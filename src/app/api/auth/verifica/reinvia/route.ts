// ============================================================================
// API: REINVIO DELL'EMAIL DI VERIFICA - BiblioFlow
// ============================================================================
// COSA: rigenera il token di verifica di un account non ancora confermato e
//       manda di nuovo l'email con il link.
//
// PERCHE' SERVE: il login e' bloccato finche' l'indirizzo non e' verificato
// (finding A-5) e il token viaggia solo per email. Se quel messaggio si perde
// (spam, casella piena, provider di posta giu' al momento della registrazione)
// l'utente resta chiuso fuori per sempre, senza vie d'uscita. Questo endpoint
// e' quella via d'uscita.

// bcrypt non serve qui, ma prisma si': restiamo su runtime Node.
export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { generateRawToken, hashToken } from "@/lib/auth-tokens";
import { emailVerifica, inviaEmail, urlVerificaEmail } from "@/lib/mailer";
import { createRateLimiter } from "@/lib/rate-limit";
import { z } from "zod";

/**
 * 3 richieste ogni 15 minuti per IP.
 *
 * PERCHE': senza limite questo endpoint diventa un amplificatore di spam
 * (mandare email a un indirizzo altrui a ripetizione) e un modo per bruciare
 * la quota del provider di posta.
 */
const reinvioRateLimiter = createRateLimiter({
  max: 3,
  windowMs: 15 * 60 * 1000,
  message: "Troppe richieste di rinvio. Riprova tra qualche minuto.",
});

const schema = z.object({
  email: z.string().email().transform((valore) => valore.toLowerCase()),
});

/**
 * Risposta unica per TUTTI gli esiti applicativi.
 *
 * PERCHE' NON DIFFERENZIAMO: rispondere "questo indirizzo non esiste" oppure
 * "questo account e' gia' verificato" trasformerebbe l'endpoint in un oracolo
 * per scoprire chi e' registrato (stesso finding A-4 del login). Il messaggio
 * e' quindi volutamente al condizionale.
 */
const RISPOSTA_GENERICA = {
  success: true,
  message:
    "Se l'indirizzo corrisponde a un account da verificare, ti abbiamo inviato una nuova email.",
};

export async function POST(request: NextRequest) {
  try {
    const rateLimitResult = await reinvioRateLimiter(request);
    if (rateLimitResult) return rateLimitResult;

    const body = await request.json().catch(() => null);
    const parsed = schema.safeParse(body);

    // Anche l'input malformato riceve la risposta generica: distinguere
    // "email non valida" da "email sconosciuta" non aiuta l'utente e aiuta
    // invece chi sta sondando gli indirizzi.
    if (!parsed.success) {
      return NextResponse.json(RISPOSTA_GENERICA, { status: 200 });
    }

    const utente = await prisma.user.findUnique({
      where: { email: parsed.data.email },
      select: { id: true, nome: true, email: true, emailVerificata: true, attivo: true },
    });

    // Nessun account, gia' verificato, o disattivato: usciamo in silenzio.
    if (!utente || utente.emailVerificata || !utente.attivo) {
      return NextResponse.json(RISPOSTA_GENERICA, { status: 200 });
    }

    // I token di verifica precedenti vengono bruciati: ne resta valido uno
    // solo, l'ultimo. Cosi' un link vecchio finito in mani altrui (inoltro,
    // cronologia condivisa) smette di funzionare appena se ne chiede uno nuovo.
    await prisma.authToken.updateMany({
      where: { userId: utente.id, type: "VERIF", used: false },
      data: { used: true },
    });

    const tokenRaw = generateRawToken();
    await prisma.authToken.create({
      data: {
        userId: utente.id,
        token: hashToken(tokenRaw),
        type: "VERIF",
        expiresAt: new Date(Date.now() + 1000 * 60 * 60 * 24), // 24 ore
      },
    });

    const esito = await inviaEmail({
      to: utente.email,
      ...emailVerifica(utente.nome, urlVerificaEmail(utente.id, tokenRaw)),
    });

    if (!esito.inviata) {
      // L'utente ha fatto tutto giusto ma il messaggio non parte: il silenzio
      // qui sarebbe crudele, perche' resterebbe ad aspettare un'email che non
      // arrivera' mai.
      //
      // COMPROMESSO CONSAPEVOLE: rispondendo 503 solo in questo ramo si lascia
      // capire che l'indirizzo corrisponde a un account da verificare (le
      // email sconosciute escono prima con un 200 generico). La finestra pero'
      // si apre soltanto quando il servizio di posta e' guasto o non
      // configurato — uno stato anomalo e transitorio — e riguarda un'unica
      // informazione a bassa criticita'. Il caso normale (mailer funzionante)
      // resta indistinguibile. Abbiamo preferito questo a lasciare l'utente
      // legittimo bloccato senza alcuna spiegazione.
      console.error(
        "[reinvia-verifica] Invio fallito:",
        esito.motivo,
        esito.dettaglio ?? "",
      );

      return NextResponse.json(
        {
          success: false,
          error:
            "Non riusciamo a inviare email in questo momento. Riprova più tardi o contatta la biblioteca.",
        },
        { status: 503 },
      );
    }

    return NextResponse.json(RISPOSTA_GENERICA, { status: 200 });
  } catch (errore) {
    console.error("Errore reinvio verifica:", errore);
    return NextResponse.json(
      { success: false, error: "Errore durante l'invio. Riprova." },
      { status: 500 },
    );
  }
}
