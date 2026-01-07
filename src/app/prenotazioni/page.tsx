// ============================================
// PAGINA LE MIE PRENOTAZIONI - BiblioFlow
// ============================================
// Design basato sui principi HCI:
// - Visibilità dello stato (prenotazioni con stati chiari)
// - Controllo utente (azioni check-in, cancella)
// - Feedback immediato (toast notifiche)

"use client";

import { useState, useEffect } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Header } from "@/components/layout/header";
import { BackButton } from "@/components/ui/back-button";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import {
  Calendar,
  Clock,
  MapPin,
  QrCode,
  Trash2,
  CheckCircle,
  AlertCircle,
  Plus,
  Loader2,
  History,
  Timer,
} from "lucide-react";

// Tipi
interface Prenotazione {
  id: string;
  dataPrenotazione: string;
  oraInizio: string;
  oraFine: string;
  stato: "IN_ATTESA" | "CONFERMATA" | "CHECK_IN" | "COMPLETATA" | "CANCELLATA" | "NO_SHOW";
  checkInAt: string | null;
  checkOutAt: string | null;
  posto: {
    id: string;
    numero: string;
    fila: string;
    sala: {
      id: string;
      nome: string;
      piano: number;
    };
  };
}

export default function PrenotazioniPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  
  const [prenotazioni, setPrenotazioni] = useState<Prenotazione[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogCancellaAperto, setDialogCancellaAperto] = useState(false);
  const [prenotazioneDaCancellare, setPrenotazioneDaCancellare] = useState<string | null>(null);
  const [operazioneInCorso, setOperazioneInCorso] = useState(false);

  // Redirect se non autenticato
  useEffect(() => {
    if (status === "unauthenticated") {
      router.push("/login?callbackUrl=/prenotazioni");
    }
  }, [status, router]);

  // Carica prenotazioni
  useEffect(() => {
    const fetchPrenotazioni = async () => {
      if (!session?.user?.id) return;
      
      try {
        const res = await fetch(`/api/prenotazioni?utenteId=${session.user.id}`);
        if (res.ok) {
          const response = await res.json();
          // L'API restituisce { success, data, count }
          setPrenotazioni(Array.isArray(response.data) ? response.data : []);
        }
      } catch (error) {
        console.error("Errore caricamento prenotazioni:", error);
        toast.error("Errore nel caricamento delle prenotazioni");
      } finally {
        setLoading(false);
      }
    };
    
    if (status === "authenticated") {
      fetchPrenotazioni();
    }
  }, [status, session?.user?.id]);

  // Filtra prenotazioni per stato
  const prenotazioniAttive = prenotazioni.filter(
    (p) => ["IN_ATTESA", "CONFERMATA", "CHECK_IN"].includes(p.stato)
  );
  const prenotazioniPassate = prenotazioni.filter(
    (p) => ["COMPLETATA", "CANCELLATA", "NO_SHOW"].includes(p.stato)
  );

  // Check-in
  const handleCheckIn = async (prenotazioneId: string) => {
    setOperazioneInCorso(true);
    try {
      const res = await fetch(`/api/prenotazioni/${prenotazioneId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ azione: "check-in" }),
      });

      if (res.ok) {
        toast.success("Check-in effettuato! ✅", {
          description: "Buono studio!",
        });
        // Aggiorna lo stato locale
        setPrenotazioni((prev) =>
          prev.map((p) =>
            p.id === prenotazioneId
              ? { ...p, stato: "CHECK_IN" as const, checkInAt: new Date().toISOString() }
              : p
          )
        );
      } else {
        const error = await res.json();
        toast.error(error.error || "Errore nel check-in");
      }
    } catch (error) {
      console.error("Errore check-in:", error);
      toast.error("Errore di connessione");
    } finally {
      setOperazioneInCorso(false);
    }
  };

  // Check-out
  const handleCheckOut = async (prenotazioneId: string) => {
    setOperazioneInCorso(true);
    try {
      const res = await fetch(`/api/prenotazioni/${prenotazioneId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ azione: "check-out" }),
      });

      if (res.ok) {
        toast.success("Check-out effettuato! 👋", {
          description: "A presto!",
        });
        setPrenotazioni((prev) =>
          prev.map((p) =>
            p.id === prenotazioneId
              ? { ...p, stato: "COMPLETATA" as const, checkOutAt: new Date().toISOString() }
              : p
          )
        );
      } else {
        const error = await res.json();
        toast.error(error.error || "Errore nel check-out");
      }
    } catch (error) {
      console.error("Errore check-out:", error);
      toast.error("Errore di connessione");
    } finally {
      setOperazioneInCorso(false);
    }
  };

  // Cancella prenotazione
  const handleCancella = async () => {
    if (!prenotazioneDaCancellare) return;
    
    setOperazioneInCorso(true);
    try {
      const res = await fetch(`/api/prenotazioni/${prenotazioneDaCancellare}`, {
        method: "DELETE",
      });

      if (res.ok) {
        toast.success("Prenotazione cancellata");
        setPrenotazioni((prev) =>
          prev.map((p) =>
            p.id === prenotazioneDaCancellare
              ? { ...p, stato: "CANCELLATA" as const }
              : p
          )
        );
        setDialogCancellaAperto(false);
      } else {
        const error = await res.json();
        toast.error(error.error || "Errore nella cancellazione");
      }
    } catch (error) {
      console.error("Errore cancellazione:", error);
      toast.error("Errore di connessione");
    } finally {
      setOperazioneInCorso(false);
      setPrenotazioneDaCancellare(null);
    }
  };

  // Ottieni colore badge stato
  const getStatoBadge = (stato: Prenotazione["stato"]) => {
    switch (stato) {
      case "IN_ATTESA":
        return <Badge variant="secondary">In attesa</Badge>;
      case "CONFERMATA":
        return <Badge className="bg-blue-500">Confermata</Badge>;
      case "CHECK_IN":
        return <Badge className="bg-green-500">In corso</Badge>;
      case "COMPLETATA":
        return <Badge variant="outline">Completata</Badge>;
      case "CANCELLATA":
        return <Badge variant="destructive">Cancellata</Badge>;
      case "NO_SHOW":
        return <Badge variant="destructive">No-show</Badge>;
      default:
        return <Badge variant="outline">{stato}</Badge>;
    }
  };

  // Formatta data
  const formatData = (dataString: string) => {
    return new Date(dataString).toLocaleDateString("it-IT", {
      weekday: "short",
      day: "numeric",
      month: "short",
    });
  };

  // Formatta ora
  const formatOra = (dataString: string) => {
    return new Date(dataString).toLocaleTimeString("it-IT", {
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  // Card prenotazione
  const PrenotazioneCard = ({ prenotazione }: { prenotazione: Prenotazione }) => {
    const isAttiva = ["IN_ATTESA", "CONFERMATA"].includes(prenotazione.stato);
    const isInCorso = prenotazione.stato === "CHECK_IN";
    const puoFareCheckIn = prenotazione.stato === "CONFERMATA";
    
    const cardAriaLabel = `Prenotazione posto ${prenotazione.posto.numero} in ${prenotazione.posto.sala.nome}, 
      ${formatData(prenotazione.oraInizio)} dalle ${formatOra(prenotazione.oraInizio)} alle ${formatOra(prenotazione.oraFine)}, 
      stato: ${prenotazione.stato.replace('_', ' ').toLowerCase()}`;
    
    return (
      <Card 
        className={isInCorso ? "border-green-500 border-2" : ""}
        role="article"
        aria-label={cardAriaLabel}
      >
        <CardContent className="p-4">
          <div className="flex justify-between items-start">
            <div className="space-y-2">
              {/* Posto e sala */}
              <div className="flex items-center gap-2">
                <MapPin className="h-4 w-4 text-muted-foreground" />
                <span className="font-medium">
                  Posto {prenotazione.posto.numero}
                </span>
                <span className="text-muted-foreground">
                  {prenotazione.posto.sala.nome}
                </span>
              </div>
              
              {/* Data e ora */}
              <div className="flex items-center gap-4 text-sm text-muted-foreground">
                <div className="flex items-center gap-1">
                  <Calendar className="h-4 w-4" />
                  {formatData(prenotazione.oraInizio)}
                </div>
                <div className="flex items-center gap-1">
                  <Clock className="h-4 w-4" />
                  {formatOra(prenotazione.oraInizio)} - {formatOra(prenotazione.oraFine)}
                </div>
              </div>
            </div>
            
            {/* Badge stato */}
            {getStatoBadge(prenotazione.stato)}
          </div>

          {/* Azioni */}
          {(isAttiva || isInCorso) && (
            <div className="flex gap-2 mt-4 pt-4 border-t flex-wrap" role="group" aria-label="Azioni prenotazione">
              {puoFareCheckIn && (
                <Button
                  size="sm"
                  onClick={() => handleCheckIn(prenotazione.id)}
                  disabled={operazioneInCorso}
                  aria-label={`Effettua check-in per posto ${prenotazione.posto.numero}`}
                >
                  <QrCode className="mr-2 h-4 w-4" aria-hidden="true" />
                  Check-in
                </Button>
              )}
              {isInCorso && (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => handleCheckOut(prenotazione.id)}
                  disabled={operazioneInCorso}
                  aria-label={`Effettua check-out dal posto ${prenotazione.posto.numero}`}
                >
                  <CheckCircle className="mr-2 h-4 w-4" aria-hidden="true" />
                  Check-out
                </Button>
              )}
              {/* Pulsante Estendi - solo per prenotazioni attive */}
              {(isAttiva || isInCorso) && (
                <Button
                  size="sm"
                  variant="outline"
                  className="border-green-500 text-green-600 hover:bg-green-50 dark:hover:bg-green-900/20"
                  onClick={() => router.push(`/prenotazioni/${prenotazione.id}/estendi`)}
                  aria-label={`Estendi la prenotazione del posto ${prenotazione.posto.numero}`}
                >
                  <Timer className="mr-2 h-4 w-4" aria-hidden="true" />
                  Estendi
                </Button>
              )}
              {isAttiva && (
                <Button
                  size="sm"
                  variant="destructive"
                  onClick={() => {
                    setPrenotazioneDaCancellare(prenotazione.id);
                    setDialogCancellaAperto(true);
                  }}
                  disabled={operazioneInCorso}
                  aria-label={`Cancella prenotazione posto ${prenotazione.posto.numero}`}
                >
                  <Trash2 className="mr-2 h-4 w-4" aria-hidden="true" />
                  Cancella
                </Button>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    );
  };

  // Loading state
  if (status === "loading" || loading) {
    return (
      <div className="min-h-screen bg-background">
        <Header />
        <main className="container mx-auto px-4 py-6">
          <Skeleton className="h-8 w-64 mb-6" />
          <div className="space-y-4">
            <Skeleton className="h-32" />
            <Skeleton className="h-32" />
            <Skeleton className="h-32" />
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <Header />
      
      <main className="container mx-auto px-4 py-6">
        {/* BackButton e Intestazione */}
        <div className="mb-6 space-y-4">
          <BackButton href="/" />
          <div className="flex justify-between items-center">
            <div>
              <h1 className="text-3xl font-bold tracking-tight text-foreground">Le Mie Prenotazioni</h1>
              <p className="text-lg text-muted-foreground mt-2">
                Gestisci le tue prenotazioni in biblioteca
              </p>
            </div>
          <Button asChild className="bg-blue-600 hover:bg-blue-700">
            <Link href="/prenota">
              <Plus className="mr-2 h-4 w-4" />
              Nuova Prenotazione
            </Link>
          </Button>
          </div>
        </div>

        {/* Tabs */}
        <Tabs defaultValue="attive" className="space-y-4">
          <TabsList>
            <TabsTrigger value="attive" className="flex items-center gap-2">
              <Calendar className="h-4 w-4" />
              Attive ({prenotazioniAttive.length})
            </TabsTrigger>
            <TabsTrigger value="passate" className="flex items-center gap-2">
              <History className="h-4 w-4" />
              Storico ({prenotazioniPassate.length})
            </TabsTrigger>
          </TabsList>

          <TabsContent value="attive">
            {prenotazioniAttive.length === 0 ? (
              <Card>
                <CardContent className="flex flex-col items-center justify-center py-12">
                  <Calendar className="h-12 w-12 text-muted-foreground mb-4" />
                  <h3 className="text-lg font-medium mb-2">
                    Nessuna prenotazione attiva
                  </h3>
                  <p className="text-muted-foreground text-center mb-4">
                    Non hai prenotazioni in corso. Prenota un posto per studiare!
                  </p>
                  <Button asChild>
                    <Link href="/prenota">
                      <Plus className="mr-2 h-4 w-4" />
                      Prenota un posto
                    </Link>
                  </Button>
                </CardContent>
              </Card>
            ) : (
              <div className="space-y-4">
                {prenotazioniAttive.map((prenotazione) => (
                  <PrenotazioneCard key={prenotazione.id} prenotazione={prenotazione} />
                ))}
              </div>
            )}
          </TabsContent>

          <TabsContent value="passate">
            {prenotazioniPassate.length === 0 ? (
              <Card>
                <CardContent className="flex flex-col items-center justify-center py-12">
                  <History className="h-12 w-12 text-muted-foreground mb-4" />
                  <h3 className="text-lg font-medium">Nessuna prenotazione passata</h3>
                  <p className="text-muted-foreground">
                    Lo storico delle tue prenotazioni apparirà qui
                  </p>
                </CardContent>
              </Card>
            ) : (
              <div className="space-y-4">
                {prenotazioniPassate.map((prenotazione) => (
                  <PrenotazioneCard key={prenotazione.id} prenotazione={prenotazione} />
                ))}
              </div>
            )}
          </TabsContent>
        </Tabs>
      </main>

      {/* Dialog conferma cancellazione */}
      <Dialog open={dialogCancellaAperto} onOpenChange={setDialogCancellaAperto}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertCircle className="h-5 w-5 text-destructive" />
              Cancella Prenotazione
            </DialogTitle>
            <DialogDescription>
              Sei sicuro di voler cancellare questa prenotazione? 
              Questa azione non può essere annullata.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setDialogCancellaAperto(false)}
            >
              Annulla
            </Button>
            <Button
              variant="destructive"
              onClick={handleCancella}
              disabled={operazioneInCorso}
            >
              {operazioneInCorso ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Trash2 className="mr-2 h-4 w-4" />
              )}
              Conferma Cancellazione
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
