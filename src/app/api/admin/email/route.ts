import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { inviaEmail } from "@/lib/mailer";

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

    // Il testo libero inserito dall'admin viene mostrato anche in HTML: si
    // convertono solo gli a-capo, senza pretendere di generare markup ricco.
    const html = `<p>${messaggio.replace(/\n/g, "<br/>")}</p>`;

    const esito = await inviaEmail({ to, subject: oggetto, text: messaggio, html });

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
