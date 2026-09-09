// API mock per verifica email (simulata)
export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { hashToken } from "@/lib/auth-tokens";

export async function GET(request: NextRequest) {
  try {
    const url = new URL(request.url);
    const userId = url.searchParams.get("userId");
    const token = url.searchParams.get("token");

    if (!userId || !token) {
      return NextResponse.json({ success: false, error: "Parametri mancanti" }, { status: 400 });
    }

    // Verifica token persistente.
    // Nel database e' salvato solo il digest SHA-256 del token (finding C-2):
    // ricalcoliamo l'hash del valore arrivato nella query string e cerchiamo
    // quello. La lookup resta una uguaglianza esatta sull'indice unico.
    const authToken = await prisma.authToken.findUnique({
      where: { token: hashToken(token) },
    });
    // Il tipo va confrontato esplicitamente: la tabella `AuthToken` ospita sia
    // i token di verifica (VERIF) sia quelli di reset password (RESET). Senza
    // questo controllo un token RESET verificherebbe l'email (e, simmetricamente
    // in reset-password/route.ts, un token VERIF cambierebbe la password).
    if (!authToken || authToken.userId !== userId || authToken.type !== "VERIF") {
      return NextResponse.json({ success: false, error: "Token non valido" }, { status: 400 });
    }

    if (authToken.expiresAt < new Date()) {
      return NextResponse.json({ success: false, error: "Token scaduto" }, { status: 400 });
    }

    if (authToken.used) {
      // Un token gia' consumato non e' necessariamente un errore da mostrare.
      //
      // PERCHE': questo link vive dentro un'email. Viene aperto piu' volte
      // (l'utente ricarica la pagina, torna indietro) e soprattutto viene
      // spesso pre-aperto dai filtri antispam e dagli scanner di sicurezza dei
      // provider di posta, che lo consumano PRIMA che l'utente ci clicchi.
      // Se in quel caso rispondessimo "token gia' usato", l'utente vedrebbe un
      // errore per una verifica in realta' andata a buon fine.
      //
      // Quindi: se l'indirizzo risulta gia' verificato, l'operazione ha
      // ottenuto il suo scopo e rispondiamo successo (idempotenza). Se invece
      // non lo e', il token era stato invalidato apposta (tipicamente da un
      // reinvio successivo) e va rifiutato davvero.
      const utente = await prisma.user.findUnique({
        where: { id: userId },
        select: { emailVerificata: true },
      });

      if (utente?.emailVerificata) {
        return NextResponse.json({ success: true, message: "Email già verificata" });
      }

      return NextResponse.json(
        {
          success: false,
          error:
            "Questo link non è più valido perché ne è stato richiesto uno più recente. Controlla l'ultima email ricevuta.",
        },
        { status: 400 },
      );
    }

    // Marca email verificata e token come usato
    await prisma.user.update({ where: { id: userId }, data: { emailVerificata: true } });
    await prisma.authToken.update({ where: { id: authToken.id }, data: { used: true } });

    return NextResponse.json({ success: true, message: "Email verificata" });
  } catch (error) {
    console.error("Errore verify:", error);
    return NextResponse.json({ success: false, error: "Errore server" }, { status: 500 });
  }
}
