"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import QRCode from "qrcode";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Loader2, CheckCircle2, X } from "lucide-react";
import { toast } from "sonner";

interface QRCodeCheckInProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  prenotazioneId: string;
  posto: {
    numero: string;
    sala: string;
    piano: number;
  };
  checkInEntro: Date;
}

export function QRCodeCheckIn({ 
  open, 
  onOpenChange, 
  prenotazioneId, 
  posto,
  checkInEntro 
}: QRCodeCheckInProps) {
  const [qrCodeUrl, setQrCodeUrl] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [checkingIn, setCheckingIn] = useState(false);
  const [checkInSuccess, setCheckInSuccess] = useState(false);

  // Genera QR code quando il dialog si apre
  useEffect(() => {
    if (open) {
      console.log("Generazione QR code per prenotazione:", prenotazioneId);
      setLoading(true);
      const qrData = JSON.stringify({
        type: "CHECKIN_PRENOTAZIONE",
        prenotazioneId,
        timestamp: new Date().toISOString(),
      });

      QRCode.toDataURL(
        qrData,
        {
          width: 280,
          margin: 2,
          color: {
            dark: "#000000",
            light: "#FFFFFF",
          },
        }
      )
        .then((url) => {
          console.log("QR code generato con successo");
          setQrCodeUrl(url);
          setLoading(false);
        })
        .catch((error) => {
          console.error("Errore generazione QR:", error);
          toast.error("Errore nella generazione del QR code");
          setLoading(false);
        });
    }
  }, [open, prenotazioneId]);

  // Simula check-in automatico (in produzione questo verrebbe fatto da un scanner fisico)
  const handleCheckIn = async () => {
    setCheckingIn(true);
    
    try {
      const response = await fetch(`/api/prenotazioni/${prenotazioneId}/check-in`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          timestamp: new Date().toISOString(),
        }),
      });

      if (!response.ok) {
        throw new Error("Errore durante il check-in");
      }

      setCheckInSuccess(true);
      toast.success("Check-in effettuato con successo!");
      
      // Chiudi dialog dopo 2 secondi
      setTimeout(() => {
        onOpenChange(false);
        setCheckInSuccess(false);
        // Ricarica la pagina per aggiornare lo stato
        window.location.reload();
      }, 2000);
    } catch (error) {
      console.error("Errore check-in:", error);
      toast.error("Errore durante il check-in");
    } finally {
      setCheckingIn(false);
    }
  };

  // Calcola tempo rimanente
  const getTimeRemaining = () => {
    const now = new Date();
    const diff = checkInEntro.getTime() - now.getTime();
    const minutes = Math.floor(diff / 60000);
    
    if (minutes < 0) return "Scaduto";
    if (minutes < 1) return "< 1 minuto";
    return `${minutes} minuti`;
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="text-xl font-semibold">Check-in Prenotazione</DialogTitle>
          <DialogDescription>
            Mostra questo QR code all&apos;ingresso della biblioteca oppure effettua il check-in manualmente
          </DialogDescription>
        </DialogHeader>

        {checkInSuccess ? (
          <div className="flex flex-col items-center justify-center py-8 space-y-4">
            <div className="h-20 w-20 rounded-full bg-green-100 flex items-center justify-center">
              <CheckCircle2 className="h-12 w-12 text-green-600" />
            </div>
            <div className="text-center">
              <h3 className="text-lg font-semibold text-green-600">Check-in completato!</h3>
              <p className="text-sm text-muted-foreground mt-1">
                Benvenuto in biblioteca
              </p>
            </div>
          </div>
        ) : (
          <>
            {/* Informazioni posto */}
            <div className="bg-muted/50 rounded-lg p-4 space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Posto:</span>
                <span className="font-medium">{posto.numero}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Sala:</span>
                <span className="font-medium">{posto.sala}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Piano:</span>
                <span className="font-medium">{posto.piano}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Tempo rimasto:</span>
                <span className={`font-medium ${getTimeRemaining() === "Scaduto" ? "text-red-500" : ""}`}>
                  {getTimeRemaining()}
                </span>
              </div>
            </div>

            {/* QR Code */}
            <div className="flex flex-col items-center justify-center py-4">
              {loading ? (
                <div className="h-[280px] w-[280px] flex items-center justify-center bg-muted rounded-lg">
                  <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                </div>
              ) : qrCodeUrl ? (
                <div className="relative">
                  <Image
                    src={qrCodeUrl}
                    alt="QR Code Check-in"
                    className="rounded-lg shadow-lg border-4 border-white"
                    width={280}
                    height={280}
                  />
                </div>
              ) : (
                <div className="h-[280px] w-[280px] flex items-center justify-center bg-muted rounded-lg">
                  <p className="text-sm text-muted-foreground">Errore generazione QR</p>
                </div>
              )}
            </div>

            {/* Azioni */}
            <div className="space-y-2">
              <Button
                onClick={handleCheckIn}
                disabled={checkingIn || getTimeRemaining() === "Scaduto"}
                className="w-full bg-gradient-to-r from-blue-500 to-blue-600 hover:from-blue-600 hover:to-blue-700"
              >
                {checkingIn ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Check-in in corso...
                  </>
                ) : (
                  "Effettua Check-in Manuale"
                )}
              </Button>
              
              <Button
                onClick={() => onOpenChange(false)}
                variant="outline"
                className="w-full"
              >
                <X className="mr-2 h-4 w-4" />
                Annulla
              </Button>
            </div>

            <p className="text-xs text-center text-muted-foreground">
              In una biblioteca reale, questo QR code verrebbe scansionato all&apos;ingresso
            </p>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
