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
import { MoreHorizontal, CheckCircle, RefreshCw, Bell } from "lucide-react";
import { toast } from "sonner";

type Prestito = {
  id: string;
  stato: string;
  giorniRitardo: number;
  isScaduto: boolean;
  dataPrestito: Date;
  dataScadenza: Date;
  dataRestituzione: Date | null;
  user: {
    id: string;
    nome: string;
    cognome: string;
    email: string;
  };
  libro: {
    id: string;
    titolo: string;
    autore: string;
  };
};

type Props = {
  prestito: Prestito;
};

export default function PrestitiActions({ prestito }: Props) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [showRestituisciDialog, setShowRestituisciDialog] = useState(false);
  const [showRinnovaDialog, setShowRinnovaDialog] = useState(false);
  const [showSollecitaDialog, setShowSollecitaDialog] = useState(false);

  const handleRestituisci = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/prestiti", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          azione: "RESTITUISCI",
          prestitoId: prestito.id,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || "Errore durante la restituzione");
      }

      if (data.giorniRitardo > 0) {
        toast.success(`Prestito restituito con ${data.giorniRitardo} giorni di ritardo`);
      } else {
        toast.success("Prestito restituito con successo");
      }
      
      setShowRestituisciDialog(false);
      router.refresh();
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : "Errore durante la restituzione";
      toast.error(errorMessage);
    } finally {
      setLoading(false);
    }
  };

  const handleRinnova = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/prestiti", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          azione: "RINNOVA",
          prestitoId: prestito.id,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || "Errore durante il rinnovo");
      }

      toast.success("Prestito rinnovato con successo");
      setShowRinnovaDialog(false);
      router.refresh();
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : "Errore durante il rinnovo";
      toast.error(errorMessage);
    } finally {
      setLoading(false);
    }
  };

  const handleSollecita = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/prestiti", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          azione: "SOLLECITA_SINGOLO",
          prestitoId: prestito.id,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || "Errore durante il sollecito");
      }

      toast.success("Sollecito inviato con successo");
      setShowSollecitaDialog(false);
      router.refresh();
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : "Errore durante il sollecito";
      toast.error(errorMessage);
    } finally {
      setLoading(false);
    }
  };

  const canRestituisci = prestito.stato !== "RESTITUITO";
  const canRinnova = prestito.stato === "ATTIVO" || prestito.stato === "SCADUTO";
  const canSollecita = prestito.isScaduto && prestito.stato === "ATTIVO";

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon">
            <MoreHorizontal className="h-4 w-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          {canRestituisci && (
            <>
              <DropdownMenuItem onClick={() => setShowRestituisciDialog(true)}>
                <CheckCircle className="h-4 w-4 mr-2" />
                Restituisci
              </DropdownMenuItem>
              <DropdownMenuSeparator />
            </>
          )}
          {canRinnova && (
            <DropdownMenuItem onClick={() => setShowRinnovaDialog(true)}>
              <RefreshCw className="h-4 w-4 mr-2" />
              Rinnova
            </DropdownMenuItem>
          )}
          {canSollecita && (
            <DropdownMenuItem 
              onClick={() => setShowSollecitaDialog(true)}
              className="text-orange-600"
            >
              <Bell className="h-4 w-4 mr-2" />
              Invia Sollecito
            </DropdownMenuItem>
          )}
          {!canRestituisci && !canRinnova && !canSollecita && (
            <DropdownMenuItem disabled>
              Nessuna azione disponibile
            </DropdownMenuItem>
          )}
        </DropdownMenuContent>
      </DropdownMenu>

      {/* Dialog Restituisci */}
      <Dialog open={showRestituisciDialog} onOpenChange={setShowRestituisciDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Restituisci Prestito</DialogTitle>
            <DialogDescription>
              Conferma la restituzione del libro. L&apos;utente riceverà una notifica.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="rounded-lg bg-muted p-4 space-y-2">
              <div className="text-sm">
                <span className="font-medium">Utente:</span>{" "}
                {prestito.user.nome} {prestito.user.cognome}
              </div>
              <div className="text-sm">
                <span className="font-medium">Libro:</span>{" "}
                {prestito.libro.titolo}
              </div>
              <div className="text-sm">
                <span className="font-medium">Scadenza:</span>{" "}
                {prestito.dataScadenza.toLocaleDateString('it-IT')}
              </div>
              {prestito.giorniRitardo > 0 && (
                <div className="text-sm font-medium text-red-600">
                  Ritardo: {prestito.giorniRitardo} giorni
                </div>
              )}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowRestituisciDialog(false)}>
              Annulla
            </Button>
            <Button onClick={handleRestituisci} disabled={loading}>
              {loading ? "Restituzione..." : "Conferma Restituzione"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog Rinnova */}
      <Dialog open={showRinnovaDialog} onOpenChange={setShowRinnovaDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Rinnova Prestito</DialogTitle>
            <DialogDescription>
              Il prestito verrà esteso di 14 giorni. L&apos;utente riceverà una notifica.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="rounded-lg bg-muted p-4 space-y-2">
              <div className="text-sm">
                <span className="font-medium">Utente:</span>{" "}
                {prestito.user.nome} {prestito.user.cognome}
              </div>
              <div className="text-sm">
                <span className="font-medium">Libro:</span>{" "}
                {prestito.libro.titolo}
              </div>
              <div className="text-sm">
                <span className="font-medium">Scadenza Attuale:</span>{" "}
                {prestito.dataScadenza.toLocaleDateString('it-IT')}
              </div>
              <div className="text-sm">
                <span className="font-medium">Nuova Scadenza:</span>{" "}
                {new Date(prestito.dataScadenza.getTime() + 14 * 24 * 60 * 60 * 1000).toLocaleDateString('it-IT')}
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowRinnovaDialog(false)}>
              Annulla
            </Button>
            <Button onClick={handleRinnova} disabled={loading}>
              {loading ? "Rinnovo..." : "Conferma Rinnovo"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog Sollecita */}
      <Dialog open={showSollecitaDialog} onOpenChange={setShowSollecitaDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Invia Sollecito</DialogTitle>
            <DialogDescription>
              Invia una notifica di sollecito all&apos;utente per la restituzione del libro.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="rounded-lg bg-orange-50 dark:bg-orange-950/20 border border-orange-200 dark:border-orange-800 p-4 space-y-2">
              <div className="text-sm">
                <span className="font-medium">Utente:</span>{" "}
                {prestito.user.nome} {prestito.user.cognome}
              </div>
              <div className="text-sm">
                <span className="font-medium">Libro:</span>{" "}
                {prestito.libro.titolo}
              </div>
              <div className="text-sm font-medium text-red-600">
                Scaduto da: {prestito.giorniRitardo} giorni
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowSollecitaDialog(false)}>
              Annulla
            </Button>
            <Button onClick={handleSollecita} disabled={loading} variant="default">
              {loading ? "Invio..." : "Invia Sollecito"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
