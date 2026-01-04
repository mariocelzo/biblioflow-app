"use client";

import { useState, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
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
import {
  Loader2,
  KeyRound,
  AlertCircle,
  Eye,
  EyeOff,
  CheckCircle,
} from "lucide-react";

function ResetPasswordForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = searchParams.get("token");

  const [password, setPassword] = useState("");
  const [confermaPassword, setConfermaPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [passwordErrors, setPasswordErrors] = useState<string[]>([]);

  const validatePassword = (pwd: string): string[] => {
    const errors: string[] = [];
    if (pwd.length < 8) errors.push("Almeno 8 caratteri");
    if (!/[A-Z]/.test(pwd)) errors.push("Almeno una maiuscola");
    if (!/[a-z]/.test(pwd)) errors.push("Almeno una minuscola");
    if (!/[0-9]/.test(pwd)) errors.push("Almeno un numero");
    return errors;
  };

  const handlePasswordChange = (value: string) => {
    setPassword(value);
    setPasswordErrors(validatePassword(value));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    // Validazioni
    const pwdErrors = validatePassword(password);
    if (pwdErrors.length > 0) {
      setPasswordErrors(pwdErrors);
      return;
    }

    if (password !== confermaPassword) {
      setError("Le password non corrispondono");
      return;
    }

    if (!token) {
      setError("Token di reset mancante. Richiedi un nuovo link.");
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const response = await fetch("/api/auth/reset-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, password }),
      });

      const data = await response.json();

      if (!response.ok) {
        setError(data.error || "Errore durante il reset della password");
        return;
      }

      setSuccess(true);
    } catch {
      setError("Errore di connessione. Riprova.");
    } finally {
      setIsLoading(false);
    }
  };

  // Schermata token mancante
  if (!token) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 to-indigo-100 dark:from-gray-900 dark:to-gray-800 p-4">
        <Card className="w-full max-w-md shadow-xl">
          <CardHeader className="space-y-4 text-center">
            <div className="flex justify-center">
              <div className="rounded-full bg-red-100 dark:bg-red-900/30 p-4">
                <AlertCircle className="h-10 w-10 text-red-600 dark:text-red-400" />
              </div>
            </div>
            <CardTitle className="text-2xl font-bold">Link non valido</CardTitle>
            <CardDescription>
              Il link di reset password non è valido o è scaduto.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button
              onClick={() => router.push("/recupera-password")}
              className="w-full"
            >
              Richiedi nuovo link
            </Button>
          </CardContent>
          <CardFooter className="justify-center">
            <Link
              href="/login"
              className="text-sm text-primary hover:underline"
            >
              Torna al login
            </Link>
          </CardFooter>
        </Card>
      </div>
    );
  }

  // Schermata successo
  if (success) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 to-indigo-100 dark:from-gray-900 dark:to-gray-800 p-4">
        <Card className="w-full max-w-md shadow-xl">
          <CardHeader className="space-y-4 text-center">
            <div className="flex justify-center">
              <div className="rounded-full bg-green-100 dark:bg-green-900/30 p-4">
                <CheckCircle className="h-10 w-10 text-green-600 dark:text-green-400" />
              </div>
            </div>
            <CardTitle className="text-2xl font-bold">
              Password aggiornata!
            </CardTitle>
            <CardDescription>
              La tua password è stata modificata con successo.
              <br />
              Ora puoi accedere con la nuova password.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button onClick={() => router.push("/login")} className="w-full">
              Vai al login
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Form reset password
  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 to-indigo-100 dark:from-gray-900 dark:to-gray-800 p-4">
      <Card className="w-full max-w-md shadow-xl">
        <CardHeader className="space-y-4 text-center">
          <div className="flex justify-center">
            <div className="rounded-full bg-primary/10 p-4">
              <KeyRound className="h-10 w-10 text-primary" aria-hidden="true" />
            </div>
          </div>
          <CardTitle className="text-2xl font-bold">
            Crea nuova password
          </CardTitle>
          <CardDescription>
            Inserisci la tua nuova password per completare il reset.
          </CardDescription>
        </CardHeader>

        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-6">
            {/* Messaggio errore */}
            {error && (
              <div
                role="alert"
                aria-live="polite"
                className="flex items-start gap-3 p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg text-red-700 dark:text-red-300"
              >
                <AlertCircle className="h-5 w-5 flex-shrink-0 mt-0.5" />
                <span className="text-sm">{error}</span>
              </div>
            )}

            {/* Campo Password */}
            <div className="space-y-2">
              <Label htmlFor="password">Nuova password</Label>
              <div className="relative">
                <Input
                  id="password"
                  type={showPassword ? "text" : "password"}
                  placeholder="Almeno 8 caratteri"
                  value={password}
                  onChange={(e) => handlePasswordChange(e.target.value)}
                  required
                  disabled={isLoading}
                  aria-invalid={passwordErrors.length > 0}
                  className="pr-12"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  aria-label={
                    showPassword ? "Nascondi password" : "Mostra password"
                  }
                >
                  {showPassword ? (
                    <EyeOff className="h-5 w-5" />
                  ) : (
                    <Eye className="h-5 w-5" />
                  )}
                </button>
              </div>

              {/* Requisiti password */}
              <div className="text-xs space-y-1">
                <p className="text-muted-foreground">La password deve avere:</p>
                <ul className="grid grid-cols-2 gap-1">
                  {[
                    { check: password.length >= 8, label: "8+ caratteri" },
                    { check: /[A-Z]/.test(password), label: "1 maiuscola" },
                    { check: /[a-z]/.test(password), label: "1 minuscola" },
                    { check: /[0-9]/.test(password), label: "1 numero" },
                  ].map((req, i) => (
                    <li
                      key={i}
                      className={`flex items-center gap-1 ${
                        req.check
                          ? "text-green-600 dark:text-green-400"
                          : "text-muted-foreground"
                      }`}
                    >
                      {req.check ? (
                        <CheckCircle className="h-3 w-3" />
                      ) : (
                        <span className="h-3 w-3 rounded-full border" />
                      )}
                      {req.label}
                    </li>
                  ))}
                </ul>
              </div>
            </div>

            {/* Campo Conferma Password */}
            <div className="space-y-2">
              <Label htmlFor="confermaPassword">Conferma password</Label>
              <Input
                id="confermaPassword"
                type={showPassword ? "text" : "password"}
                placeholder="Ripeti la password"
                value={confermaPassword}
                onChange={(e) => setConfermaPassword(e.target.value)}
                required
                disabled={isLoading}
                aria-invalid={
                  confermaPassword.length > 0 && password !== confermaPassword
                }
              />
              {confermaPassword.length > 0 && password !== confermaPassword && (
                <p className="text-sm text-red-600 dark:text-red-400">
                  Le password non corrispondono
                </p>
              )}
            </div>

            {/* Pulsante Submit */}
            <Button
              type="submit"
              className="w-full"
              disabled={
                isLoading ||
                passwordErrors.length > 0 ||
                password !== confermaPassword
              }
            >
              {isLoading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Aggiornamento...
                </>
              ) : (
                "Aggiorna password"
              )}
            </Button>
          </form>
        </CardContent>

        <CardFooter className="justify-center">
          <Link href="/login" className="text-sm text-primary hover:underline">
            Torna al login
          </Link>
        </CardFooter>
      </Card>
    </div>
  );
}

// Skeleton di caricamento
function ResetPasswordSkeleton() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 to-indigo-100 dark:from-gray-900 dark:to-gray-800 p-4">
      <Card className="w-full max-w-md shadow-xl">
        <CardHeader className="space-y-4 text-center">
          <div className="flex justify-center">
            <div className="rounded-full bg-primary/10 p-4">
              <KeyRound className="h-10 w-10 text-primary" />
            </div>
          </div>
          <CardTitle className="text-2xl font-bold">
            Crea nuova password
          </CardTitle>
          <CardDescription>Caricamento...</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="h-10 bg-muted rounded animate-pulse" />
          <div className="h-10 bg-muted rounded animate-pulse" />
          <div className="h-10 bg-muted rounded animate-pulse" />
        </CardContent>
      </Card>
    </div>
  );
}

// Componente principale con Suspense
export default function ResetPasswordPage() {
  return (
    <Suspense fallback={<ResetPasswordSkeleton />}>
      <ResetPasswordForm />
    </Suspense>
  );
}
