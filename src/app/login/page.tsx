// ============================================
// PAGINA LOGIN - BiblioFlow
// ============================================
// Design basato sui principi HCI:
// - Inclusività by design (accessibilità WCAG)
// - Trasparenza (messaggi di errore chiari)
// - Wizard di interazione semplice

"use client";

import { useState, Suspense } from "react";
import { signIn } from "next-auth/react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { BackButton } from "@/components/ui/back-button";
import { Loader2, BookOpen, AlertCircle, CheckCircle2, Eye, EyeOff } from "lucide-react";
import { FcGoogle } from "react-icons/fc";
import { CODICI_ERRORE_LOGIN, messaggioErroreLogin } from "@/lib/auth-errors";

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const callbackUrl = searchParams.get("callbackUrl") || "/";
  // Impostato dal wizard di registrazione quando l'account e' appena stato
  // creato: senza questo avviso l'utente arriverebbe su un form vuoto senza
  // capire se la registrazione sia andata a buon fine.
  const appenaRegistrato = searchParams.get("registered") === "true";

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Teniamo anche il CODICE, non solo il messaggio: serve a decidere se
  // mostrare la scorciatoia "reinvia l'email di verifica".
  const [codiceErrore, setCodiceErrore] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError(null);
    setCodiceErrore(null);

    try {
      const result = await signIn("credentials", {
        email,
        password,
        redirect: false,
      });

      if (result?.error) {
        // Il motivo reale NON viaggia nel campo `error` (Auth.js lo appiattisce
        // su "CredentialsSignin"): sta in `code`, valorizzato lato server da
        // `ErroreLogin`. Prima questa mappa era indicizzata sulle frasi
        // italiane lanciate da `authorize`, che al browser non arrivano mai:
        // di fatto ogni fallimento mostrava il messaggio generico.
        const codice = result.code;
        setCodiceErrore(codice ?? null);
        setError(messaggioErroreLogin(codice));
      } else {
        // Login riuscito - ottieni la sessione per controllare il ruolo
        const response = await fetch("/api/auth/session");
        const session = await response.json();
        
        // Reindirizza in base al ruolo
        if (session?.user?.ruolo === "ADMIN" || session?.user?.ruolo === "BIBLIOTECARIO") {
          router.push("/admin");
        } else {
          router.push(callbackUrl);
        }
        router.refresh();
      }
    } catch {
      setError("Errore di connessione. Verifica la tua connessione internet.");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    // Il gradiente aveva SOLO le tinte chiare: con il tema scuro attivo lo
    // sfondo restava bianco-azzurro sotto una card scura, e /login era l'unica
    // pagina di autenticazione a stonare. Qui si usano le stesse varianti
    // `dark:` di /registrazione, cosi' le due pagine gemelle coincidono.
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-50 via-white to-blue-50 dark:from-slate-950 dark:via-background dark:to-slate-900 p-4">
      <div className="w-full max-w-md space-y-6">
        {/* Back Button */}
        <div className="flex items-center">
          <BackButton href="/" />
        </div>

        <Card className="border-0 shadow-xl">
        <CardHeader className="space-y-4 text-center">
          {/* Logo e titolo */}
          <div className="flex justify-center">
            <div className="rounded-2xl bg-blue-100 dark:bg-blue-900 p-4">
              <BookOpen className="h-10 w-10 text-blue-600 dark:text-blue-400" aria-hidden="true" />
            </div>
          </div>
          <CardTitle className="text-3xl font-bold tracking-tight text-foreground">
            Accedi
          </CardTitle>
          <CardDescription className="text-base text-muted-foreground">
            Inserisci le tue credenziali per continuare
          </CardDescription>
        </CardHeader>

        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-6">
            {/* Conferma della registrazione appena conclusa.
                Senza questo avviso chi arriva qui dal wizard vede solo un form
                vuoto e non sa se l'account sia stato creato davvero. */}
            {appenaRegistrato && !error && (
              <div
                role="status"
                aria-live="polite"
                className="flex items-start gap-3 p-4 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg text-green-800 dark:text-green-300"
              >
                <CheckCircle2 className="h-5 w-5 flex-shrink-0 mt-0.5" aria-hidden="true" />
                <span className="text-sm">
                  Account creato. Ti abbiamo inviato un&apos;email per verificare
                  l&apos;indirizzo: aprila e poi accedi da qui.
                </span>
              </div>
            )}

            {/* Messaggio di errore accessibile */}
            {error && (
              <div
                role="alert"
                aria-live="polite"
                className="flex flex-col gap-2 p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg text-red-700 dark:text-red-300"
              >
                <div className="flex items-start gap-3">
                  <AlertCircle className="h-5 w-5 flex-shrink-0 mt-0.5" aria-hidden="true" />
                  <span className="text-sm">{error}</span>
                </div>

                {/* Via d'uscita concreta per l'unico errore che l'utente puo'
                    risolvere da solo: l'email di verifica mai arrivata. */}
                {codiceErrore === CODICI_ERRORE_LOGIN.EMAIL_NON_VERIFICATA && (
                  <Link
                    href={`/verifica-email?email=${encodeURIComponent(email)}`}
                    className="text-sm font-semibold underline underline-offset-2 self-start"
                  >
                    Invia di nuovo l&apos;email di verifica
                  </Link>
                )}
              </div>
            )}

            {/* Campo Email */}
            <div className="space-y-2">
              <Label htmlFor="email" className="text-sm font-semibold text-foreground">
                Email
              </Label>
              <Input
                id="email"
                type="email"
                placeholder="nome.cognome@studenti.unisa.it"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                autoComplete="email"
                disabled={isLoading}
                aria-describedby="email-hint"
                className="h-12 bg-muted dark:bg-gray-800 border-border focus:bg-background focus:border-blue-500 focus:ring-blue-500/20 transition-all"
              />
              <p id="email-hint" className="text-xs text-muted-foreground">
                Usa la tua email universitaria
              </p>
            </div>

            {/* Campo Password con toggle visibilità */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label htmlFor="password" className="text-sm font-semibold text-foreground">
                  Password
                </Label>
                <Link
                  href="/recupera-password"
                  className="text-xs text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 font-medium transition-colors"
                >
                  Password dimenticata?
                </Link>
              </div>
              <div className="relative">
                <Input
                  id="password"
                  type={showPassword ? "text" : "password"}
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  autoComplete="current-password"
                  disabled={isLoading}
                  className="h-12 pr-12 bg-muted dark:bg-gray-800 border-border focus:bg-background focus:border-blue-500 focus:ring-blue-500/20 transition-all"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors p-1 rounded-lg"
                  aria-label={showPassword ? "Nascondi password" : "Mostra password"}
                >
                  {showPassword ? (
                    <EyeOff className="h-5 w-5" aria-hidden="true" />
                  ) : (
                    <Eye className="h-5 w-5" aria-hidden="true" />
                  )}
                </button>
              </div>
            </div>

            {/* Pulsante Submit */}
            <Button
              type="submit"
              className="w-full h-12 text-base font-semibold bg-blue-600 hover:bg-blue-700 shadow-lg hover:shadow-xl transition-all"
              disabled={isLoading}
            >
              {isLoading ? (
                <>
                  <Loader2 className="mr-2 h-5 w-5 animate-spin" aria-hidden="true" />
                  Accesso in corso...
                </>
              ) : (
                "Accedi"
              )}
            </Button>

            {/* Divider */}
            <div className="relative">
              <div className="absolute inset-0 flex items-center">
                <span className="w-full border-t border-border" />
              </div>
              <div className="relative flex justify-center text-xs uppercase">
                <span className="bg-card px-2 text-muted-foreground">Oppure continua con</span>
              </div>
            </div>

            {/* Google OAuth */}
            <Button
              type="button"
              variant="outline"
              className="w-full h-12 text-base font-medium border-border hover:bg-muted transition-all"
              onClick={() => signIn("google", { callbackUrl })}
              disabled={isLoading}
            >
              <FcGoogle className="mr-3 h-5 w-5" aria-hidden="true" />
              Accedi con Google
            </Button>
          </form>
        </CardContent>

        <CardFooter className="flex flex-col space-y-4 text-center">
          <div className="text-sm text-muted-foreground">
            Non hai un account?{" "}
            <Link
              href="/registrazione"
              className="font-medium text-primary hover:underline focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2 rounded"
            >
              Registrati qui
            </Link>
          </div>
          
          {/* Link accessibilità */}
          <div className="text-xs text-muted-foreground">
            <Link
              href="/accessibilita"
              className="hover:underline focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2 rounded"
            >
              Opzioni di accessibilità
            </Link>
          </div>
        </CardFooter>
      </Card>
      </div>
    </div>
  );
}

// Skeleton di caricamento per Suspense
function LoginSkeleton() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 to-indigo-100 dark:from-gray-900 dark:to-gray-800 p-4">
      <Card className="w-full max-w-md shadow-xl">
        <CardHeader className="space-y-4 text-center">
          <div className="flex justify-center">
            <div className="rounded-full bg-primary/10 p-4">
              <BookOpen className="h-10 w-10 text-primary" aria-hidden="true" />
            </div>
          </div>
          <CardTitle className="text-2xl font-bold">Accedi a BiblioFlow</CardTitle>
          <CardDescription>Caricamento...</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="h-12 bg-muted rounded animate-pulse" />
          <div className="h-12 bg-muted rounded animate-pulse" />
          <div className="h-12 bg-muted rounded animate-pulse" />
        </CardContent>
      </Card>
    </div>
  );
}

// Componente principale con Suspense boundary
export default function LoginPage() {
  return (
    <Suspense fallback={<LoginSkeleton />}>
      <LoginForm />
    </Suspense>
  );
}
