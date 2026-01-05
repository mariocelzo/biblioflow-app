"use client";

import { useState } from "react";
import { Scanner } from "@yudiel/react-qr-scanner";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  QrCode,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Loader2,
  Camera,
  User,
  MapPin,
  Clock,
} from "lucide-react";
import { toast } from "sonner";

interface ScanResult {
  success: boolean;
  message?: string;
  error?: string;
  type?: string;
  data?: {
    user: {
      nome: string;
      cognome: string;
      matricola?: string;
      email: string;
    };
    posto: {
      numero: string;
      sala: {
        nome: string;
        piano: number;
      };
    };
  };
}

export default function ScannerPage() {
  const [scanning, setScanning] = useState(true);
  const [loading, setLoading] = useState(false);
  const [lastResult, setLastResult] = useState<ScanResult | null>(null);
  const [lastScanTime, setLastScanTime] = useState<number>(0);

  const handleScan = async (result: string) => {
    // Previeni scan multipli troppo ravvicinati
    const now = Date.now();
    if (now - lastScanTime < 3000) {
      return; // Aspetta almeno 3 secondi tra uno scan e l'altro
    }
    setLastScanTime(now);

    setLoading(true);
    setScanning(false);

    try {
      const response = await fetch("/api/admin/scanner/validate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ qrCode: result }),
      });

      const data = await response.json();

      setLastResult(data);

      if (data.success) {
        toast.success("Check-in completato!", {
          description: `${data.data.user.nome} ${data.data.user.cognome} - ${data.data.posto.sala.nome}`,
        });
        
        // Riprendi lo scanning dopo 4 secondi
        setTimeout(() => {
          setScanning(true);
          setLastResult(null);
        }, 4000);
      } else {
        toast.error("Errore", {
          description: data.error,
        });
        
        // Riprendi lo scanning dopo 3 secondi in caso di errore
        setTimeout(() => {
          setScanning(true);
          setLastResult(null);
        }, 3000);
      }
    } catch (error) {
      console.error("Errore scansione:", error);
      toast.error("Errore di connessione");
      setLastResult({
        success: false,
        error: "Errore di connessione al server",
      });
      
      setTimeout(() => {
        setScanning(true);
        setLastResult(null);
      }, 3000);
    } finally {
      setLoading(false);
    }
  };

  const handleError = (error: unknown) => {
    console.error("Errore camera:", error);
    toast.error("Errore camera", {
      description: "Verifica i permessi della fotocamera",
    });
  };

  const resetScanner = () => {
    setLastResult(null);
    setScanning(true);
  };

  return (
    <div className="container max-w-2xl mx-auto py-8 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight flex items-center gap-2">
            <QrCode className="h-8 w-8" />
            Scanner QR Check-in
          </h1>
          <p className="text-muted-foreground mt-1">
            Scansiona il QR code dello studente per effettuare il check-in
          </p>
        </div>
        <Badge variant="outline" className="gap-2">
          <Camera className="h-4 w-4" />
          Bibliotecario
        </Badge>
      </div>

      {/* Scanner Card */}
      <Card>
        <CardHeader>
          <CardTitle>Camera Scanner</CardTitle>
          <CardDescription>
            Inquadra il QR code mostrato dallo studente sulla sua dashboard
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {/* Scanner Camera */}
            <div className="relative aspect-square w-full max-w-md mx-auto rounded-lg overflow-hidden border-4 border-primary">
              {scanning ? (
                <Scanner
                  onScan={(detectedCodes) => {
                    if (detectedCodes && detectedCodes.length > 0) {
                      const code = detectedCodes[0].rawValue;
                      if (code) {
                        handleScan(code);
                      }
                    }
                  }}
                  onError={handleError}
                  constraints={{
                    facingMode: "environment",
                  }}
                  styles={{
                    container: {
                      width: "100%",
                      height: "100%",
                    },
                  }}
                />
              ) : (
                <div className="absolute inset-0 flex items-center justify-center bg-muted">
                  {loading ? (
                    <div className="flex flex-col items-center gap-3">
                      <Loader2 className="h-12 w-12 animate-spin text-primary" />
                      <p className="text-sm text-muted-foreground">Validazione in corso...</p>
                    </div>
                  ) : (
                    <div className="flex flex-col items-center gap-3">
                      <Camera className="h-12 w-12 text-muted-foreground" />
                      <p className="text-sm text-muted-foreground">Scanner in pausa</p>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Istruzioni */}
            {!lastResult && (
              <Alert>
                <Camera className="h-4 w-4" />
                <AlertDescription>
                  Posiziona il QR code al centro dell&apos;inquadratura. Lo scanner rileverà automaticamente il codice.
                </AlertDescription>
              </Alert>
            )}

            {/* Risultato Scan */}
            {lastResult && (
              <div className="space-y-4">
                {lastResult.success ? (
                  <>
                    <Alert className="border-green-600 bg-green-50 dark:bg-green-950">
                      <CheckCircle2 className="h-5 w-5 text-green-600" />
                      <AlertDescription className="text-green-900 dark:text-green-100 font-medium">
                        ✅ Check-in completato con successo!
                      </AlertDescription>
                    </Alert>

                    <Card className="border-green-200 dark:border-green-900">
                      <CardHeader>
                        <CardTitle className="text-lg">Dettagli Prenotazione</CardTitle>
                      </CardHeader>
                      <CardContent className="space-y-3">
                        <div className="flex items-center gap-2">
                          <User className="h-4 w-4 text-muted-foreground" />
                          <div>
                            <p className="font-medium">
                              {lastResult.data?.user.nome} {lastResult.data?.user.cognome}
                            </p>
                            <p className="text-sm text-muted-foreground">
                              {lastResult.data?.user.matricola
                                ? `Mat. ${lastResult.data?.user.matricola}`
                                : lastResult.data?.user.email}
                            </p>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <MapPin className="h-4 w-4 text-muted-foreground" />
                          <div>
                            <p className="font-medium">
                              {lastResult.data?.posto.sala.nome} - Posto {lastResult.data?.posto.numero}
                            </p>
                            <p className="text-sm text-muted-foreground">
                              Piano {lastResult.data?.posto.sala.piano}
                            </p>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <Clock className="h-4 w-4 text-muted-foreground" />
                          <p className="text-sm text-muted-foreground">
                            {new Date().toLocaleTimeString("it-IT")}
                          </p>
                        </div>
                      </CardContent>
                    </Card>
                  </>
                ) : (
                  <>
                    <Alert variant="destructive">
                      {lastResult.type === "expired" ? (
                        <AlertTriangle className="h-5 w-5" />
                      ) : (
                        <XCircle className="h-5 w-5" />
                      )}
                      <AlertDescription className="font-medium">
                        {lastResult.error || "Errore durante la validazione"}
                      </AlertDescription>
                    </Alert>

                    <div className="text-sm text-muted-foreground space-y-2">
                      {lastResult.type === "expired" && (
                        <p>💡 Il QR code ha una validità di 15 minuti. Lo studente deve generarne uno nuovo.</p>
                      )}
                      {lastResult.type === "fake" && (
                        <p>⚠️ Questo QR code non è stato generato dal sistema BiblioFlow.</p>
                      )}
                      {lastResult.type === "already_checked_in" && (
                        <p>ℹ️ Il check-in per questa prenotazione è già stato effettuato.</p>
                      )}
                      {lastResult.type === "too_early" && (
                        <p>⏰ È ancora presto per il check-in. Lo studente può effettuarlo da 15 minuti prima dell&apos;orario prenotato.</p>
                      )}
                      {lastResult.type === "too_late" && (
                        <p>⏱️ Il tempo per il check-in è scaduto (massimo 15 minuti dopo l&apos;inizio).</p>
                      )}
                    </div>
                  </>
                )}

                <Button onClick={resetScanner} className="w-full">
                  <QrCode className="h-4 w-4 mr-2" />
                  Scansiona un altro QR Code
                </Button>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Info Card */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Come funziona</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm text-muted-foreground">
          <p>• Lo studente deve mostrare il QR code dalla sua dashboard prenotazioni</p>
          <p>• Il QR code è valido solo per 15 minuti dalla generazione</p>
          <p>• Il check-in può essere effettuato da 15 min prima fino a 15 min dopo l&apos;inizio</p>
          <p>• Ogni QR code può essere usato una sola volta</p>
          <p>• Solo i QR generati da BiblioFlow sono accettati (firma digitale verificata)</p>
        </CardContent>
      </Card>
    </div>
  );
}
