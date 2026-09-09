// ============================================================================
// PAGINA VERIFICA EMAIL - BiblioFlow
// ============================================================================
// COSA: unica pagina per due momenti diversi dello stesso passaggio.
//   1. "Controlla la posta": si arriva qui subito dopo la registrazione, o dal
//      login quando l'account non e' ancora verificato. Da qui si puo' farsi
//      rimandare il messaggio.
//   2. "Conferma": e' la destinazione del link contenuto nell'email
//      (?userId=...&token=...). La pagina consuma il token e mostra l'esito.
//
// PERCHE' UNA PAGINA E NON L'API NUDA: il link dell'email puntava a
// /api/auth/verify, che risponde JSON. L'utente ci cliccava sopra dalla posta e
// si trovava davanti `{"success":true}` in una pagina bianca, senza sapere che
// fare dopo. Qui invece riceve una conferma leggibile e il pulsante per
// accedere.

"use client";

import { Suspense, useCallback, useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { BackButton } from "@/components/ui/back-button";
import {
  AlertCircle,
  CheckCircle2,
  Loader2,
  MailCheck,
} from "lucide-react";

/** Stato della conferma automatica del token preso dalla query string. */
type StatoVerifica = "in_corso" | "riuscita" | "fallita";

function VerificaEmailContent() {
  const searchParams = useSearchParams();
  const userId = searchParams.get("userId");
  const token = searchParams.get("token");
  // Il login passa l'indirizzo gia' digitato: evita di farlo riscrivere.
  const emailIniziale = searchParams.get("email") ?? "";

  // C'e' un token da consumare solo se ENTRAMBI i parametri sono presenti.
  const haToken = Boolean(userId && token);

  const [statoVerifica, setStatoVerifica] = useState<StatoVerifica>("in_corso");
  const [erroreVerifica, setErroreVerifica] = useState<string | null>(null);

  const [email, setEmail] = useState(emailIniziale);
  const [reinvioInCorso, setReinvioInCorso] = useState(false);
  const [messaggioReinvio, setMessaggioReinvio] = useState<string | null>(null);
  const [erroreReinvio, setErroreReinvio] = useState<string | null>(null);

  /**
   * Il token e' monouso: la richiesta di conferma va inviata UNA volta sola.
   *
   * PERCHE' SERVE UN REF E NON BASTA `useEffect`: in sviluppo React esegue
   * gli effetti due volte (StrictMode monta, smonta e rimonta). La prima
   * chiamata consumava il token, la seconda si sentiva rispondere "token gia'
   * usato" e sovrascriveva l'esito positivo con un errore. Il ref sopravvive
   * al doppio montaggio e blocca la seconda chiamata sul nascere.
   */
  const confermaAvviata = useRef(false);

  // --- 1. Conferma del token ------------------------------------------------
  useEffect(() => {
    if (!haToken || confermaAvviata.current) return;
    confermaAvviata.current = true;

    // NOTA: volutamente NESSUNA cleanup che annulli l'aggiornamento di stato.
    // Il token si puo' consumare una volta sola, quindi la richiesta non viene
    // rifatta al rimontaggio: scartarne il risultato lascerebbe la pagina
    // bloccata su "Verifica in corso" per sempre. Un `setState` dopo lo smonto
    // e' innocuo in React 19 (nessun warning, nessun leak).
    async function conferma() {
      try {
        const parametri = new URLSearchParams({
          userId: userId as string,
          token: token as string,
        });
        const risposta = await fetch(`/api/auth/verify?${parametri.toString()}`);
        const dati = await risposta.json().catch(() => null);

        // Si controlla `risposta.ok` E il campo `success`: un 200 con
        // `success: false` deve comunque risultare un fallimento, altrimenti
        // mostreremmo una conferma falsa.
        if (risposta.ok && dati?.success) {
          setStatoVerifica("riuscita");
          return;
        }

        setStatoVerifica("fallita");
        setErroreVerifica(
          dati?.error ??
            "Il link di verifica non è valido. Potrebbe essere scaduto o già usato.",
        );
      } catch {
        setStatoVerifica("fallita");
        setErroreVerifica(
          "Non riusciamo a contattare il server. Controlla la connessione e riprova.",
        );
      }
    }

    conferma();
  }, [haToken, userId, token]);

  // --- 2. Richiesta di un nuovo invio ---------------------------------------
  const richiediNuovaEmail = useCallback(async () => {
    setReinvioInCorso(true);
    setMessaggioReinvio(null);
    setErroreReinvio(null);

    try {
      const risposta = await fetch("/api/auth/verifica/reinvia", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      const dati = await risposta.json().catch(() => null);

      if (!risposta.ok) {
        setErroreReinvio(
          dati?.error ?? "Invio non riuscito. Riprova tra qualche minuto.",
        );
        return;
      }

      setMessaggioReinvio(
        dati?.message ??
          "Se l'indirizzo corrisponde a un account da verificare, ti abbiamo inviato una nuova email.",
      );
    } catch {
      setErroreReinvio(
        "Errore di connessione. Verifica la tua connessione internet.",
      );
    } finally {
      setReinvioInCorso(false);
    }
  }, [email]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-50 via-white to-blue-50 p-4">
      <div className="w-full max-w-md space-y-6">
        <div className="flex items-center">
          <BackButton href="/login" label="Torna al login" />
        </div>

        <Card className="border-0 shadow-xl">
          <CardHeader className="space-y-4 text-center">
            <div className="flex justify-center">
              <div className="rounded-2xl bg-blue-100 dark:bg-blue-900 p-4">
                <MailCheck
                  className="h-10 w-10 text-blue-600 dark:text-blue-400"
                  aria-hidden="true"
                />
              </div>
            </div>
            <CardTitle className="text-3xl font-bold tracking-tight text-foreground">
              Verifica la tua email
            </CardTitle>
            <CardDescription className="text-base text-muted-foreground">
              {haToken
                ? "Stiamo confermando il tuo indirizzo"
                : "Serve una conferma prima di poter accedere"}
            </CardDescription>
          </CardHeader>

          <CardContent className="space-y-6">
            {/* --- Esito della conferma automatica --- */}
            {haToken && statoVerifica === "in_corso" && (
              <div
                role="status"
                aria-live="polite"
                className="flex items-center gap-3 p-4 rounded-lg bg-muted text-muted-foreground"
              >
                <Loader2 className="h-5 w-5 animate-spin" aria-hidden="true" />
                <span className="text-sm">Verifica in corso…</span>
              </div>
            )}

            {haToken && statoVerifica === "riuscita" && (
              <div
                role="status"
                aria-live="polite"
                className="flex items-start gap-3 p-4 rounded-lg bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 text-green-800 dark:text-green-300"
              >
                <CheckCircle2
                  className="h-5 w-5 flex-shrink-0 mt-0.5"
                  aria-hidden="true"
                />
                <span className="text-sm">
                  Indirizzo confermato. Ora puoi accedere a BiblioFlow.
                </span>
              </div>
            )}

            {haToken && statoVerifica === "fallita" && (
              <div
                role="alert"
                aria-live="polite"
                className="flex items-start gap-3 p-4 rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-300"
              >
                <AlertCircle
                  className="h-5 w-5 flex-shrink-0 mt-0.5"
                  aria-hidden="true"
                />
                <span className="text-sm">{erroreVerifica}</span>
              </div>
            )}

            {/* --- Richiesta di un nuovo invio ---
                Resta disponibile anche dopo un fallimento: e' proprio il caso
                in cui serve (link scaduto o gia' usato). Viene invece nascosta
                quando la verifica e' andata a buon fine, per non confondere. */}
            {statoVerifica !== "riuscita" && (
              <div className="space-y-4">
                {!haToken && (
                  <p className="text-sm text-muted-foreground">
                    Ti abbiamo inviato un messaggio con un link di conferma.
                    Controlla anche la cartella spam. Se non lo trovi, puoi
                    richiederne un altro qui sotto.
                  </p>
                )}

                <div className="space-y-2">
                  <Label htmlFor="email" className="text-sm font-semibold">
                    La tua email
                  </Label>
                  <Input
                    id="email"
                    type="email"
                    autoComplete="email"
                    placeholder="nome.cognome@studenti.unisa.it"
                    value={email}
                    onChange={(evento) => setEmail(evento.target.value)}
                    disabled={reinvioInCorso}
                    className="h-12"
                  />
                </div>

                {messaggioReinvio && (
                  <div
                    role="status"
                    aria-live="polite"
                    className="flex items-start gap-3 p-4 rounded-lg bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 text-green-800 dark:text-green-300"
                  >
                    <CheckCircle2
                      className="h-5 w-5 flex-shrink-0 mt-0.5"
                      aria-hidden="true"
                    />
                    <span className="text-sm">{messaggioReinvio}</span>
                  </div>
                )}

                {erroreReinvio && (
                  <div
                    role="alert"
                    aria-live="polite"
                    className="flex items-start gap-3 p-4 rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-300"
                  >
                    <AlertCircle
                      className="h-5 w-5 flex-shrink-0 mt-0.5"
                      aria-hidden="true"
                    />
                    <span className="text-sm">{erroreReinvio}</span>
                  </div>
                )}

                <Button
                  type="button"
                  onClick={richiediNuovaEmail}
                  disabled={reinvioInCorso || email.trim() === ""}
                  className="w-full h-12 text-base font-semibold"
                >
                  {reinvioInCorso ? (
                    <>
                      <Loader2
                        className="mr-2 h-5 w-5 animate-spin"
                        aria-hidden="true"
                      />
                      Invio in corso…
                    </>
                  ) : (
                    "Inviami di nuovo l'email"
                  )}
                </Button>
              </div>
            )}
          </CardContent>

          <CardFooter className="flex flex-col space-y-2">
            <Button asChild variant={statoVerifica === "riuscita" ? "default" : "outline"} className="w-full h-12">
              <Link href="/login">Vai al login</Link>
            </Button>
          </CardFooter>
        </Card>
      </div>
    </div>
  );
}

// `useSearchParams` richiede un confine di Suspense per non forzare tutta la
// pagina al rendering dinamico.
export default function VerificaEmailPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen flex items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      }
    >
      <VerificaEmailContent />
    </Suspense>
  );
}
