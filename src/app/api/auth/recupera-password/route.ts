// API richiesta di recupero password.
//
// Il mailer non e' ancora presente nel progetto: in SVILUPPO il link di reset
// viene restituito nella risposta per poter provare il flusso end-to-end,
// mentre in PRODUZIONE non esce mai dal server (vedi commenti sotto).
export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { passwordResetRateLimiter } from "@/lib/rate-limit";
import { generateRawToken, hashToken } from "@/lib/auth-tokens";
import { env } from "@/lib/env";

// Messaggio UNICO usato per qualunque esito (email registrata o no).
// PERCHE': se la risposta cambiasse a seconda dell'esistenza dell'account,
// chiunque potrebbe usare questo endpoint come oracolo per enumerare gli
// utenti registrati (user enumeration).
const RISPOSTA_GENERICA =
  "Se esiste un account associato a questa email, riceverai un link per reimpostare la password.";

export async function POST(request: NextRequest) {
  try {
    // Rate limiting: max 3 richieste ogni 15 minuti per IP
    const rateLimitResult = await passwordResetRateLimiter(request);
    if (rateLimitResult) return rateLimitResult;

    const body = await request.json();
    const email = (body.email || "").toLowerCase();
    if (!email) {
      return NextResponse.json({ success: false, error: "Email mancante" }, { status: 400 });
    }

    // In produzione la risposta NON deve mai contenere il token/link di reset:
    // altrimenti chiunque conosca l'email di una vittima potrebbe farsi dare
    // dall'API il link per cambiarle la password (takeover completo, C-1).
    const isProduzione = env.NODE_ENV === "production";

    const user = await prisma.user.findUnique({ where: { email } });
    if (!user) {
      // Risposta identica al ramo "utente trovato" in produzione: stesso
      // status, stesso corpo, nessun campo aggiuntivo.
      return NextResponse.json({ success: true, message: RISPOSTA_GENERICA });
    }

    // Token casuale crittograficamente sicuro: all'utente va il valore "raw",
    // nel database finisce soltanto il suo digest SHA-256 (vedi lib/auth-tokens).
    const rawToken = generateRawToken();
    const expires = new Date(Date.now() + 1000 * 60 * 60); // 1 ora

    await prisma.authToken.create({
      data: {
        userId: user.id,
        token: hashToken(rawToken),
        type: "RESET",
        expiresAt: expires,
      },
    });

    // TODO: in produzione il token va inviato via email (mailer non ancora presente)
    if (isProduzione) {
      // Nessun `console.info` del link: i log applicativi (Vercel, Sentry)
      // sono consultabili da piu' persone e conserverebbero un token valido.
      return NextResponse.json({ success: true, message: RISPOSTA_GENERICA });
    }

    // Solo in sviluppo: il link viene restituito al client per permettere di
    // completare il flusso di reset senza un servizio di posta.
    const resetLink = `/reset-password?userId=${user.id}&token=${rawToken}`;

    return NextResponse.json({
      success: true,
      message: RISPOSTA_GENERICA,
      data: { resetLink },
    });
  } catch (error) {
    console.error("Errore recupero-password:", error);
    return NextResponse.json({ success: false, error: "Errore server" }, { status: 500 });
  }
}
