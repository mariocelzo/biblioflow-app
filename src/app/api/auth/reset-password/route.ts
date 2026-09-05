// API di reset password: consuma il token monouso generato da
// /api/auth/recupera-password e imposta la nuova password.
export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { hashPassword, validatePassword } from "@/lib/password";
import { hashToken } from "@/lib/auth-tokens";
import { passwordResetRateLimiter } from "@/lib/rate-limit";

export async function POST(request: NextRequest) {
  try {
    // Rate limiting (M-7): senza limite questo endpoint permetteva di provare
    // token a raffica. Usiamo lo stesso limitatore della richiesta di reset
    // (3 tentativi ogni 15 minuti per IP) perche' fa parte dello stesso flusso.
    const rateLimitResult = await passwordResetRateLimiter(request);
    if (rateLimitResult) return rateLimitResult;

    const body = await request.json();
    const { userId, token, newPassword } = body;
    if (!userId || !token || !newPassword) {
      return NextResponse.json({ success: false, error: "Parametri mancanti" }, { status: 400 });
    }

    // Robustezza della nuova password (M-7): la registrazione la controllava
    // gia', il reset no. Senza questo controllo bastava passare per il reset
    // per aggirare la policy e impostare una password debole.
    const passwordValidation = validatePassword(newPassword);
    if (!passwordValidation.valid) {
      return NextResponse.json(
        {
          success: false,
          error: "Password non sufficientemente sicura",
          details: { password: passwordValidation.errors },
        },
        // 422: la sintassi della richiesta e' corretta ma il contenuto non
        // soddisfa le regole di dominio (policy password).
        { status: 422 },
      );
    }

    // Il database contiene solo il digest del token: ricalcoliamo l'hash del
    // valore ricevuto e cerchiamo quello (vedi lib/auth-tokens, finding C-2).
    const authToken = await prisma.authToken.findUnique({
      where: { token: hashToken(token) },
    });
    if (!authToken || authToken.userId !== userId) {
      return NextResponse.json({ success: false, error: "Token non valido" }, { status: 400 });
    }

    if (authToken.used) {
      return NextResponse.json({ success: false, error: "Token già usato" }, { status: 400 });
    }

    if (authToken.expiresAt < new Date()) {
      return NextResponse.json({ success: false, error: "Token scaduto" }, { status: 400 });
    }

    // Hash nuova password
    const passwordHash = await hashPassword(newPassword);

    // Transazione (M-7): aggiornamento password e invalidazione dei token
    // devono essere atomici. Se l'update della password riuscisse ma
    // l'invalidazione no, il token resterebbe riutilizzabile.
    await prisma.$transaction([
      prisma.user.update({ where: { id: userId }, data: { passwordHash } }),
      // Token appena usato: consumato.
      prisma.authToken.update({ where: { id: authToken.id }, data: { used: true } }),
      // Tutti gli ALTRI token di reset ancora aperti dello stesso utente
      // vengono invalidati: se un attaccante ne aveva ottenuto uno (o la
      // vittima ne aveva richiesti piu' d'uno), non deve poter rifare il
      // reset subito dopo il legittimo proprietario.
      prisma.authToken.updateMany({
        where: { userId, type: "RESET", used: false, id: { not: authToken.id } },
        data: { used: true },
      }),
    ]);

    // NOTA (follow-up): le sessioni JWT gia' emesse restano valide fino alla
    // scadenza (24h). Revocarle richiederebbe un campo `passwordChangedAt` su
    // User da confrontare nel callback jwt, cioe' una migrazione di schema:
    // fuori dallo scope di questo intervento.
    return NextResponse.json({ success: true, message: "Password aggiornata" });
  } catch (error) {
    console.error("Errore reset-password:", error);
    return NextResponse.json({ success: false, error: "Errore server" }, { status: 500 });
  }
}
