"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import {
  CheckCircle2,
  AlertOctagon,
  Loader2,
  Send,
  XCircle,
  Clock,
  BookOpen,
} from "lucide-react";

interface AnomalieActionsProps {
  stats: {
    noShow: number;
    prestitiScaduti: number;
    ritardiCheckIn: number;
  };
}

export function AnomalieActions({ stats }: AnomalieActionsProps) {
  const [isLoading, setIsLoading] = useState<string | null>(null);
  const [alertDialogOpen, setAlertDialogOpen] = useState(false);
  const [alertTitolo, setAlertTitolo] = useState("Avviso dalla Biblioteca");
  const [alertMessaggio, setAlertMessaggio] = useState("");

  const eseguiAzione = async (azione: string, extraData?: Record<string, string>) => {
    setIsLoading(azione);
    try {
      const response = await fetch("/api/admin/anomalie", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ azione, ...extraData }),
      });

      const data = await response.json();

      if (response.ok) {
        toast.success(data.message, {
          description: `${data.count} elementi processati`,
        });
        // Ricarica la pagina per aggiornare i dati
        window.location.reload();
      } else {
        toast.error("Errore", { description: data.error });
      }
    } catch {
      toast.error("Errore di connessione");
    } finally {
      setIsLoading(null);
    }
  };

  const inviaAlert = async () => {
    if (!alertMessaggio.trim()) {
      toast.error("Inserisci un messaggio");
      return;
    }
    await eseguiAzione("INVIA_ALERT_BROADCAST", {
      titolo: alertTitolo,
      messaggio: alertMessaggio,
    });
    setAlertDialogOpen(false);
    setAlertTitolo("Avviso dalla Biblioteca");
    setAlertMessaggio("");
  };

  return (
    <>
      <div className="flex gap-2">
        <Button
          variant="outline"
          className="gap-2"
          onClick={() => eseguiAzione("RISOLVI_TUTTE_NOSHOW")}
          disabled={isLoading !== null || stats.noShow === 0}
        >
          {isLoading === "RISOLVI_TUTTE_NOSHOW" ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <CheckCircle2 className="h-4 w-4" />
          )}
          Avvisa No-Show ({stats.noShow})
        </Button>
        <Button className="gap-2" onClick={() => setAlertDialogOpen(true)}>
          <AlertOctagon className="h-4 w-4" />
          Invia Alert
        </Button>
      </div>

      {/* Dialog Alert Broadcast */}
      <Dialog open={alertDialogOpen} onOpenChange={setAlertDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Invia Alert a Tutti gli Utenti</DialogTitle>
            <DialogDescription>
              Questo messaggio verrà inviato come notifica a tutti gli utenti attivi.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="titolo">Titolo</Label>
              <Input
                id="titolo"
                value={alertTitolo}
                onChange={(e) => setAlertTitolo(e.target.value)}
                placeholder="Titolo della notifica"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="messaggio">Messaggio</Label>
              <textarea
                id="messaggio"
                className="w-full min-h-24 p-3 border rounded-md bg-background text-foreground"
                value={alertMessaggio}
                onChange={(e) => setAlertMessaggio(e.target.value)}
                placeholder="Scrivi il messaggio da inviare..."
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAlertDialogOpen(false)}>
              Annulla
            </Button>
            <Button onClick={inviaAlert} disabled={isLoading !== null} className="gap-2">
              {isLoading === "INVIA_ALERT_BROADCAST" ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Send className="h-4 w-4" />
              )}
              Invia a Tutti
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

// Bottone singolo per azioni su righe
interface RowActionButtonProps {
  azione: string;
  label: string;
  icon?: React.ReactNode;
  variant?: "outline" | "default" | "destructive";
  className?: string;
  userId?: string;
  prenotazioneId?: string;
  prestitoId?: string;
  onSuccess?: () => void;
}

export function RowActionButton({
  azione,
  label,
  icon,
  variant = "outline",
  className,
  userId,
  onSuccess,
}: RowActionButtonProps) {
  const [isLoading, setIsLoading] = useState(false);

  const eseguiAzione = async () => {
    setIsLoading(true);
    try {
      let response;

      if (azione === "AVVISA_UTENTE" && userId) {
        // Usa l'API delle anomalie per avvisare e marcare come risolto
        response = await fetch("/api/admin/anomalie", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            azione: "AVVISA_SINGOLO_UTENTE",
            userId: userId,
          }),
        });
      } else {
        response = await fetch("/api/admin/anomalie", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ azione }),
        });
      }

      const data = await response.json();

      if (response.ok) {
        toast.success(data.message);
        // Ricarica la pagina per aggiornare i conteggi
        window.location.reload();
      } else {
        toast.error("Errore", { description: data.error });
      }
    } catch {
      toast.error("Errore di connessione");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Button
      variant={variant}
      size="sm"
      className={className}
      onClick={eseguiAzione}
      disabled={isLoading}
    >
      {isLoading ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : icon}
      {label}
    </Button>
  );
}

// Azioni rapide per le sezioni
export function QuickActions({ stats }: AnomalieActionsProps) {
  const [isLoading, setIsLoading] = useState<string | null>(null);

  const eseguiAzione = async (azione: string) => {
    setIsLoading(azione);
    try {
      const response = await fetch("/api/admin/anomalie", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ azione }),
      });

      const data = await response.json();

      if (response.ok) {
        toast.success(data.message, {
          description: `${data.count} elementi processati`,
        });
        window.location.reload();
      } else {
        toast.error("Errore", { description: data.error });
      }
    } catch {
      toast.error("Errore di connessione");
    } finally {
      setIsLoading(null);
    }
  };

  return (
    <div className="grid gap-3 md:grid-cols-3">
      <Button
        variant="outline"
        className="justify-start gap-2 h-auto py-3"
        onClick={() => eseguiAzione("RISOLVI_TUTTE_NOSHOW")}
        disabled={isLoading !== null || stats.noShow === 0}
      >
        {isLoading === "RISOLVI_TUTTE_NOSHOW" ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <XCircle className="h-4 w-4 text-red-600" />
        )}
        <div className="text-left">
          <div className="font-medium">Avvisa No-Show</div>
          <div className="text-xs text-muted-foreground">
            {stats.noShow} utenti da avvisare
          </div>
        </div>
      </Button>

      <Button
        variant="outline"
        className="justify-start gap-2 h-auto py-3"
        onClick={() => eseguiAzione("SOLLECITA_PRESTITI_SCADUTI")}
        disabled={isLoading !== null || stats.prestitiScaduti === 0}
      >
        {isLoading === "SOLLECITA_PRESTITI_SCADUTI" ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <BookOpen className="h-4 w-4 text-red-600" />
        )}
        <div className="text-left">
          <div className="font-medium">Sollecita Prestiti</div>
          <div className="text-xs text-muted-foreground">
            {stats.prestitiScaduti} prestiti scaduti
          </div>
        </div>
      </Button>

      <Button
        variant="outline"
        className="justify-start gap-2 h-auto py-3"
        onClick={() => eseguiAzione("ANNULLA_PRENOTAZIONI_SENZA_CHECKIN")}
        disabled={isLoading !== null || stats.ritardiCheckIn === 0}
      >
        {isLoading === "ANNULLA_PRENOTAZIONI_SENZA_CHECKIN" ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <Clock className="h-4 w-4 text-yellow-600" />
        )}
        <div className="text-left">
          <div className="font-medium">Annulla Senza Check-in</div>
          <div className="text-xs text-muted-foreground">
            {stats.ritardiCheckIn} prenotazioni
          </div>
        </div>
      </Button>
    </div>
  );
}
