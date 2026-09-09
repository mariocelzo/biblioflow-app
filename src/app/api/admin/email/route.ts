// Prisma serve per verificare il destinatario: restiamo su runtime Node.
export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { inviaEmail } from "@/lib/mailer";
import { createRateLimiter } from "@/lib/rate-limit";

/**
 * Limite di invii dal pannello: 30 all'ora per IP.
 *
 * PERCHE' ANCHE SE LA ROTTA E' RISERVATA ALLO STAFF: le email partono
 * dall'account del servizio di posta dell'applicazione, che ha una quota
 * giornaliera. Bruciarla — per un ciclo sbagliato, un click ripetuto o un
 * account staff compromesso — non spegne solo questa funzione: spegne anche
 * le email di VERIFICA e di RECUPERO PASSWORD, cioe' l'accesso al sito.
 * Il limite protegge quelle, non questa.
 */
const emailAdminRateLimiter = createRateLimiter({
  max: 30,
  windowMs: 60 * 60 * 1000,
  message: "Troppe email inviate in poco tempo. Riprova più tardi.",
});

/**
 * Rende sicuro il testo scritto dall'amministratore prima di metterlo in HTML.
 *
 * PERCHE': il messaggio e' testo libero e finiva interpolato nell'HTML
 * dell'email senza alcuna trasformazione. Non e' una XSS classica (chi scrive
 * e' gia' staff autenticato), ma bastava un `a < b` per produrre markup rotto,
 * e nulla impediva di iniettare tag arbitrari in un messaggio che parte a nome
 * della biblioteca. Si convertono le entita' PRIMA di aggiungere i soli `<br/>`
 * voluti, cosi' gli a-capo restano l'unico markup generato.
 */
function testoInHtml(testo: string): string {
  return testo
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;")
    .replace(/\n/g, "<br/>");
}

// POST /api/admin/email - invia un'email libera a un utente dal pannello admin.
//
// PERCHE' ESISTE: il dialog "Invia Email" in utenti-actions.tsx prometteva un
// invio ("Email Inviata") dopo un semplice `setTimeout`, senza nessuna
// chiamata di rete: l'amministratore riceveva conferma di un'email mai
// spedita. Ora che src/lib/mailer.ts espone un mailer HTTP funzionante
// (Brevo/Resend), questa route lo usa davvero e restituisce l'esito reale,
// cosi' il frontend puo' mostrare un successo solo quando l'invio e' riuscito
// per davvero.
export async function POST(request: NextRequest) {
  try {
    const session = await auth();

    if (!session?.user) {
      return NextResponse.json({ error: "Non autorizzato" }, { status: 401 });
    }

    if (session.user.ruolo !== "BIBLIOTECARIO" && session.user.ruolo !== "ADMIN") {
      return NextResponse.json({ error: "Accesso negato" }, { status: 403 });
    }

    const body = await request.json();
    const { to, oggetto, messaggio } = body;

    if (
      typeof to !== "string" || !to.trim() ||
      typeof oggetto !== "string" || !oggetto.trim() ||
      typeof messaggio !== "string" || !messaggio.trim()
    ) {
      return NextResponse.json(
        { error: "Campi obbligatori mancanti: to, oggetto, messaggio" },
        { status: 400 }
      );
    }

    // Il destinatario deve corrispondere a un utente REGISTRATO.
    //
    // PERCHE': `to` arrivava dal corpo della richiesta e veniva usato tale e
    // quale. Un account staff poteva cosi' spedire a qualunque indirizzo del
    // mondo, con oggetto e testo liberi, a nome della biblioteca e attraverso
    // l'account del servizio di posta dell'applicazione. Vincolandolo agli
    // utenti registrati la funzione fa cio' che dichiara — scrivere a un
    // utente dal pannello — e smette di essere un relay aperto.
    const destinatario = await prisma.user.findUnique({
      where: { email: to.trim().toLowerCase() },
      select: { email: true },
    });

    if (!destinatario) {
      return NextResponse.json(
        { error: "Nessun utente registrato con questo indirizzo" },
        { status: 404 },
      );
    }

    // Limite verificato E incrementato solo ora (modo predefinito): un invio
    // rifiutato prima, per dati non validi o destinatario inesistente, non
    // deve consumare quota. Stessa logica adottata sulla registrazione.
    // NB: serve il modo "verifica-e-conta"; il modo "conta" incrementa
    // soltanto e non rifiuterebbe mai nulla.
    const limite = await emailAdminRateLimiter(request);
    if (limite) return limite;

    const html = `<p>${testoInHtml(messaggio)}</p>`;

    const esito = await inviaEmail({
      to: destinatario.email,
      subject: oggetto,
      text: messaggio,
      html,
    });

    if (!esito.inviata) {
      // Il mailer non lancia mai: un esito negativo va comunicato con
      // onesta' all'admin, non nascosto dietro un falso "successo" (era
      // esattamente il difetto che questa route corregge).
      const error =
        esito.motivo === "non_configurato"
          ? "Servizio email non configurato sul server: contattare l'amministratore di sistema"
          : "Invio dell'email fallito. Riprova piu' tardi";

      return NextResponse.json({ error }, { status: 502 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Errore invio email admin:", error);
    return NextResponse.json(
      { error: "Errore interno del server" },
      { status: 500 }
    );
  }
}
