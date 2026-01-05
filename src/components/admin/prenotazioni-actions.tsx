"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { MoreHorizontal, XCircle, CheckCircle, Edit, Calendar, Clock } from "lucide-react";
import { toast } from "sonner";

type Prenotazione = {
  id: string;
  stato: string;
  data: Date;
  oraInizio: string | Date;
  oraFine: string | Date;
  checkInAt: Date | null;
  user: {
    id: string;
    nome: string;
    cognome: string;
    email: string;
    matricola: string | null;
  };
  posto: {
    id: string;
    numero: string;
    sala: {
      nome: string;
      piano: number;
    };
  };
};

type Props = {
  prenotazione: Prenotazione;
};

export default function PrenotazioniActions({ prenotazione }: Props) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [showAnnullaDialog, setShowAnnullaDialog] = useState(false);
  const [showCheckInDialog, setShowCheckInDialog] = useState(false);
  const [showModificaDialog, setShowModificaDialog] = useState(false);
  
  // Form modifica
  const [nuovaData, setNuovaData] = useState(
    prenotazione.data.toISOString().split('T')[0]
  );
  
  const getTimeString = (time: string | Date): string => {
    if (typeof time === 'string') return time.slice(0, 5);
    return new Date(`1970-01-01T${time}`).toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' });
  };
  
  const [nuovaOraInizio, setNuovaOraInizio] = useState(
    getTimeString(prenotazione.oraInizio)
  );
  const [nuovaOraFine, setNuovaOraFine] = useState(
    getTimeString(prenotazione.oraFine)
  );

  const handleAnnulla = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/prenotazioni", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          azione: "ANNULLA_SINGOLA",
          prenotazioneId: prenotazione.id,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || "Errore durante l'annullamento");
      }

      toast.success("Prenotazione annullata con successo");
      setShowAnnullaDialog(false);
      router.refresh();
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : "Errore durante l'annullamento";
      toast.error(errorMessage);
    } finally {
      setLoading(false);
    }
  };

  const handleCheckIn = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/prenotazioni", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          azione: "CHECK_IN_MANUALE",
          prenotazioneId: prenotazione.id,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || "Errore durante il check-in");
      }

      toast.success("Check-in effettuato con successo");
      setShowCheckInDialog(false);
      router.refresh();
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : "Errore durante il check-in";
      toast.error(errorMessage);
    } finally {
      setLoading(false);
    }
  };

  const handleModifica = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/prenotazioni", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          azione: "MODIFICA",
          prenotazioneId: prenotazione.id,
          nuoviDati: {
            data: nuovaData,
            oraInizio: nuovaOraInizio,
            oraFine: nuovaOraFine,
          },
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || "Errore durante la modifica");
      }

      toast.success("Prenotazione modificata con successo");
      setShowModificaDialog(false);
      router.refresh();
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : "Errore durante la modifica";
      toast.error(errorMessage);
    } finally {
      setLoading(false);
    }
  };

  const canCheckIn = prenotazione.stato === "CONFERMATA";
  const canModifica = prenotazione.stato !== "COMPLETATA" && prenotazione.stato !== "CANCELLATA";
  const canAnnulla = prenotazione.stato !== "COMPLETATA" && prenotazione.stato !== "CANCELLATA";

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon">
            <MoreHorizontal className="h-4 w-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          {canCheckIn && (
            <>
              <DropdownMenuItem onClick={() => setShowCheckInDialog(true)}>
                <CheckCircle className="h-4 w-4 mr-2" />
                Check-in Manuale
              </DropdownMenuItem>
              <DropdownMenuSeparator />
            </>
          )}
          {canModifica && (
            <DropdownMenuItem onClick={() => setShowModificaDialog(true)}>
              <Edit className="h-4 w-4 mr-2" />
              Modifica
            </DropdownMenuItem>
          )}
          {canAnnulla && (
            <DropdownMenuItem 
              onClick={() => setShowAnnullaDialog(true)}
              className="text-red-600"
            >
              <XCircle className="h-4 w-4 mr-2" />
              Annulla Prenotazione
            </DropdownMenuItem>
          )}
          {!canCheckIn && !canModifica && !canAnnulla && (
            <DropdownMenuItem disabled>
              Nessuna azione disponibile
            </DropdownMenuItem>
          )}
        </DropdownMenuContent>
      </DropdownMenu>

      {/* Dialog Annulla */}
      <Dialog open={showAnnullaDialog} onOpenChange={setShowAnnullaDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Annulla Prenotazione</DialogTitle>
            <DialogDescription>
              Sei sicuro di voler annullare questa prenotazione? L&apos;utente riceverà una notifica.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="rounded-lg bg-muted p-4 space-y-2">
              <div className="text-sm">
                <span className="font-medium">Utente:</span>{" "}
                {prenotazione.user.nome} {prenotazione.user.cognome}
              </div>
              <div className="text-sm">
                <span className="font-medium">Posto:</span>{" "}
                {prenotazione.posto.sala.nome} - Posto {prenotazione.posto.numero}
              </div>
              <div className="text-sm">
                <span className="font-medium">Data:</span>{" "}
                {prenotazione.data.toLocaleDateString('it-IT')}
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAnnullaDialog(false)}>
              Annulla
            </Button>
            <Button variant="destructive" onClick={handleAnnulla} disabled={loading}>
              {loading ? "Annullamento..." : "Conferma Annullamento"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog Check-in */}
      <Dialog open={showCheckInDialog} onOpenChange={setShowCheckInDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Check-in Manuale</DialogTitle>
            <DialogDescription>
              Conferma il check-in manuale per questa prenotazione.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="rounded-lg bg-muted p-4 space-y-2">
              <div className="text-sm">
                <span className="font-medium">Utente:</span>{" "}
                {prenotazione.user.nome} {prenotazione.user.cognome}
              </div>
              <div className="text-sm">
                <span className="font-medium">Posto:</span>{" "}
                {prenotazione.posto.sala.nome} - Posto {prenotazione.posto.numero}
              </div>
              <div className="text-sm">
                <span className="font-medium">Data:</span>{" "}
                {prenotazione.data.toLocaleDateString('it-IT')}
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCheckInDialog(false)}>
              Annulla
            </Button>
            <Button onClick={handleCheckIn} disabled={loading}>
              {loading ? "Conferma..." : "Conferma Check-in"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog Modifica */}
      <Dialog open={showModificaDialog} onOpenChange={setShowModificaDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Modifica Prenotazione</DialogTitle>
            <DialogDescription>
              Modifica data e orari della prenotazione. L&apos;utente riceverà una notifica.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="data">
                <Calendar className="h-4 w-4 inline mr-2" />
                Data
              </Label>
              <Input
                id="data"
                type="date"
                value={nuovaData}
                onChange={(e) => setNuovaData(e.target.value)}
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="oraInizio">
                  <Clock className="h-4 w-4 inline mr-2" />
                  Ora Inizio
                </Label>
                <Input
                  id="oraInizio"
                  type="time"
                  value={nuovaOraInizio}
                  onChange={(e) => setNuovaOraInizio(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="oraFine">Ora Fine</Label>
                <Input
                  id="oraFine"
                  type="time"
                  value={nuovaOraFine}
                  onChange={(e) => setNuovaOraFine(e.target.value)}
                />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowModificaDialog(false)}>
              Annulla
            </Button>
            <Button onClick={handleModifica} disabled={loading}>
              {loading ? "Modifica..." : "Conferma Modifica"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
