"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from "@/components/ui/card";
import { Loader2, Mail, AlertCircle } from "lucide-react";

export default function RecuperaPasswordPage() {
  const [email, setEmail] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [resetLink, setResetLink] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError(null);
    setMessage(null);
    setResetLink(null);

    try {
      const res = await fetch("/api/auth/recupera-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Errore durante la richiesta");
      } else {
        setMessage(data.message || "Se esiste un account riceverai un link (mock)");
        if (data.data?.resetLink) setResetLink(data.data.resetLink);
      }
    } catch {
      setError("Errore di connessione");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-gradient-to-br from-blue-50 to-indigo-100 dark:from-gray-900 dark:to-gray-800">
      <Card className="w-full max-w-md shadow-xl">
        <CardHeader className="text-center">
          <div className="mx-auto rounded-full bg-primary/10 p-4 w-fit">
            <Mail className="h-6 w-6 text-primary" />
          </div>
          <CardTitle>Recupera password</CardTitle>
          <CardDescription>Inserisci la tua email universitaria per ricevere un link di reset (mock).</CardDescription>
        </CardHeader>

        <CardContent>
          {error && (
            <div role="alert" className="flex items-start gap-3 p-3 bg-red-50 border border-red-200 rounded text-red-700">
              <AlertCircle className="h-4 w-4" />
              <div className="text-sm">{error}</div>
            </div>
          )}

          {message && (
            <div role="status" className="p-3 bg-green-50 border border-green-200 rounded text-green-700 text-sm">
              {message}
            </div>
          )}

          <form onSubmit={handleSubmit} className="mt-4 space-y-4">
            <div className="space-y-2">
              <Label htmlFor="email">Email universitaria</Label>
              <Input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="nome.cognome@studenti.unisa.it" required />
            </div>

            <Button type="submit" className="w-full" disabled={isLoading}>
              {isLoading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Inviando...
                </>
              ) : (
                "Invia link di reset"
              )}
            </Button>
          </form>

          {resetLink && (
            <div className="mt-4 text-sm">
              <div className="text-muted-foreground mb-2">Link mock generato:</div>
              <code className="block p-2 bg-muted/10 rounded">{resetLink}</code>
            </div>
          )}
        </CardContent>

        <CardFooter className="text-sm text-center">
          <a className="text-primary hover:underline" href="/login">Torna al login</a>
        </CardFooter>
      </Card>
    </div>
  );
}
