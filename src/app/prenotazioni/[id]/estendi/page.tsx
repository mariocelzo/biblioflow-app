// ============================================
// PAGINA ESTENDI PRENOTAZIONE - BiblioFlow
// ============================================
// Design basato sui principi HCI:
// - Timeline visuale intuitiva
// - Feedback immediato sulla disponibilità
// - Drag interaction per estensione

"use client";

import { useState, useEffect, use } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { Header } from "@/components/layout/header";
import { BackButton } from "@/components/ui/back-button";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import {
  Clock,
  MapPin,
  Plus,
  Loader2,
  CheckCircle,
  AlertCircle,
  ArrowRight,
  Calendar,
} from "lucide-react";

interface SlotDisponibile {
  oraInizio: string;
  oraFine: string;
  disponibile: boolean;
  durataTotale: number;
}

interface PrenotazioneInfo {
  id: string;
  oraInizio: string;
  oraFine: string;
  data: string;
  stato: string;
  posto: {
    numero: string;
    sala: string;
    piano: number;
  };
}

interface EstensioneData {
  prenotazione: PrenotazioneInfo;
  slotDisponibili: SlotDisponibile[];
  durataAttuale: number;
  maxDurataTotale: number;
}

export default function EstendiPrenotazionePage({ 
  params 
}: { 
  params: Promise<{ id: string }> 
}) {
  const { id } = use(params);
  const { status } = useSession();
  const router = useRouter();
  
  const [data, setData] = useState<EstensioneData | null>(null);
  const [loading, setLoading] = useState(true);
  const [extending, setExtending] = useState(false);
  const [selectedSlots, setSelectedSlots] = useState<number[]>([]);
  const [error, setError] = useState<string | null>(null);

  // Redirect se non autenticato
  useEffect(() => {
    if (status === "unauthenticated") {
      router.push(`/login?callbackUrl=/prenotazioni/${id}/estendi`);
    }
  }, [status, router, id]);

  // Carica dati prenotazione e slot disponibili
  useEffect(() => {
    const fetchData = async () => {
      try {
        const res = await fetch(`/api/prenotazioni/${id}/estendi`);
        const result = await res.json();
        
        if (result.success) {
          setData(result.data);
        } else {
          setError(result.error || "Errore nel caricamento");
        }
      } catch (err) {
        console.error("Errore fetch estensione:", err);
        setError("Errore di connessione");
      } finally {
        setLoading(false);
      }
    };
    
    if (status === "authenticated" && id) {
      fetchData();
    }
  }, [status, id]);

  // Gestisce la selezione degli slot
  const toggleSlot = (index: number) => {
    if (!data) return;
    
    const slot = data.slotDisponibili[index];
    if (!slot.disponibile) return;
    
    setSelectedSlots(prev => {
      // Se clicco su uno slot già selezionato, deseleziono tutti quelli successivi
      if (prev.includes(index)) {
        return prev.filter(i => i < index);
      }
      
      // Altrimenti, seleziono tutti gli slot fino a questo (devono essere consecutivi e disponibili)
      const newSelection: number[] = [];
      for (let i = 0; i <= index; i++) {
        if (data.slotDisponibili[i].disponibile) {
          newSelection.push(i);
        } else {
          break; // Stop se incontriamo uno slot non disponibile
        }
      }
      return newSelection;
    });
  };

  // Calcola la nuova ora di fine in base agli slot selezionati
  const getNuovaOraFine = (): string | null => {
    if (!data || selectedSlots.length === 0) return null;
    const lastSlotIndex = Math.max(...selectedSlots);
    return data.slotDisponibili[lastSlotIndex].oraFine;
  };

  // Calcola la durata totale
  const getDurataTotale = (): number => {
    if (!data || selectedSlots.length === 0) return data?.durataAttuale || 0;
    const lastSlotIndex = Math.max(...selectedSlots);
    return data.slotDisponibili[lastSlotIndex].durataTotale;
  };

  // Estendi prenotazione
  const handleEstendi = async () => {
    const nuovaOraFine = getNuovaOraFine();
    if (!nuovaOraFine) return;
    
    setExtending(true);
    try {
      const res = await fetch(`/api/prenotazioni/${id}/estendi`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nuovaOraFine }),
      });
      
      const result = await res.json();
      
      if (result.success) {
        toast.success("Prenotazione estesa! ✨", {
          description: `Nuova ora di fine: ${nuovaOraFine}`,
        });
        router.push("/prenotazioni");
      } else {
        toast.error(result.error || "Errore nell'estensione");
      }
    } catch (err) {
      console.error("Errore estensione:", err);
      toast.error("Errore di connessione");
    } finally {
      setExtending(false);
    }
  };

  // Formatta ora
  const formatOra = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit" });
  };

  // Formatta data
  const formatData = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString("it-IT", { 
      weekday: "long", 
      day: "numeric", 
      month: "long" 
    });
  };

  // Loading state
  if (loading || status === "loading") {
    return (
      <div className="min-h-screen bg-background">
        <Header />
        <main className="container mx-auto px-4 py-6 max-w-2xl">
          <BackButton href="/prenotazioni" label="Le mie prenotazioni" />
          <div className="space-y-4 mt-6">
            <Skeleton className="h-8 w-64" />
            <Skeleton className="h-32 w-full" />
            <Skeleton className="h-48 w-full" />
          </div>
        </main>
      </div>
    );
  }

  // Error state
  if (error || !data) {
    return (
      <div className="min-h-screen bg-background">
        <Header />
        <main className="container mx-auto px-4 py-6 max-w-2xl">
          <BackButton href="/prenotazioni" label="Le mie prenotazioni" />
          <Card className="mt-6 border-destructive">
            <CardContent className="pt-6">
              <div className="flex items-center gap-3 text-destructive">
                <AlertCircle className="h-6 w-6" />
                <div>
                  <p className="font-medium">Impossibile estendere la prenotazione</p>
                  <p className="text-sm text-muted-foreground">{error}</p>
                </div>
              </div>
              <Button 
                variant="outline" 
                className="mt-4"
                onClick={() => router.push("/prenotazioni")}
              >
                Torna alle prenotazioni
              </Button>
            </CardContent>
          </Card>
        </main>
      </div>
    );
  }

  const nuovaOraFine = getNuovaOraFine();
  const durataTotale = getDurataTotale();

  return (
    <div className="min-h-screen bg-background">
      <Header />
      
      <main className="container mx-auto px-4 py-6 max-w-2xl">
        <BackButton href="/prenotazioni" label="Le mie prenotazioni" />
        
        {/* Titolo */}
        <div className="mt-6 mb-8">
          <h1 className="text-2xl font-bold text-foreground">Estendi Prenotazione</h1>
          <p className="text-muted-foreground">
            Seleziona gli slot per prolungare la tua sessione di studio
          </p>
        </div>

        {/* Card Info Prenotazione */}
        <Card className="mb-6 border-0 shadow-lg bg-gradient-to-br from-primary to-primary/80 text-white">
          <CardContent className="p-6">
            <div className="flex items-start justify-between">
              <div>
                <Badge className="bg-white/20 text-white border-0 mb-2">
                  Prenotazione Attuale
                </Badge>
                <h2 className="text-2xl font-bold">Posto {data.prenotazione.posto.numero}</h2>
                <p className="text-white/80 flex items-center gap-1 mt-1">
                  <MapPin className="h-4 w-4" />
                  {data.prenotazione.posto.sala} - Piano {data.prenotazione.posto.piano}
                </p>
              </div>
              <div className="text-right">
                <p className="text-white/70 text-sm flex items-center gap-1 justify-end">
                  <Calendar className="h-4 w-4" />
                  {formatData(data.prenotazione.data)}
                </p>
              </div>
            </div>
            
            {/* Orario attuale */}
            <div className="mt-4 p-4 bg-white/10 rounded-xl">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Clock className="h-5 w-5" />
                  <span className="text-lg font-medium">
                    {formatOra(data.prenotazione.oraInizio)} - {formatOra(data.prenotazione.oraFine)}
                  </span>
                </div>
                <Badge className="bg-white/20 border-0">
                  {data.durataAttuale}h attuali
                </Badge>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Timeline Estensione */}
        <Card className="mb-6">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Plus className="h-5 w-5" />
              Estendi la sessione
            </CardTitle>
            <CardDescription>
              Tocca gli slot per selezionare quanto vuoi estendere (max {data.maxDurataTotale}h totali)
            </CardDescription>
          </CardHeader>
          <CardContent>
            {data.slotDisponibili.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                <AlertCircle className="h-12 w-12 mx-auto mb-3 opacity-50" />
                <p>Nessuno slot disponibile per l&apos;estensione</p>
                <p className="text-sm mt-1">La biblioteca chiude alle 18:00 o hai raggiunto il limite massimo</p>
              </div>
            ) : (
              <>
                {/* Timeline visuale */}
                <div className="space-y-3">
                  {/* Slot prenotazione attuale */}
                  <div className="flex items-center gap-3">
                    <div className="w-20 text-sm text-muted-foreground text-right">
                      {formatOra(data.prenotazione.oraInizio)}
                    </div>
                    <div className="flex-1 h-14 rounded-xl bg-primary/20 border-2 border-primary flex items-center px-4">
                      <div className="flex items-center gap-2 text-primary font-medium">
                        <CheckCircle className="h-5 w-5" />
                        Prenotazione attuale ({data.durataAttuale}h)
                      </div>
                    </div>
                    <div className="w-20 text-sm text-muted-foreground">
                      {formatOra(data.prenotazione.oraFine)}
                    </div>
                  </div>
                  
                  {/* Freccia */}
                  <div className="flex justify-center">
                    <ArrowRight className="h-5 w-5 text-muted-foreground rotate-90" />
                  </div>
                  
                  {/* Slot estensione */}
                  {data.slotDisponibili.map((slot, index) => {
                    const isSelected = selectedSlots.includes(index);
                    const isDisabled = !slot.disponibile;
                    const isPreviousSelected = index > 0 && selectedSlots.includes(index - 1);
                    const canSelect = slot.disponibile && (index === 0 || isPreviousSelected || selectedSlots.length === 0);
                    
                    return (
                      <div key={index} className="flex items-center gap-3">
                        <div className="w-20 text-sm text-muted-foreground text-right">
                          {slot.oraInizio}
                        </div>
                        <button
                          onClick={() => canSelect && toggleSlot(index)}
                          disabled={isDisabled}
                          className={`
                            flex-1 h-14 rounded-xl border-2 transition-all duration-200
                            flex items-center justify-between px-4
                            ${isSelected 
                              ? "bg-green-500/20 border-green-500 text-green-700 dark:text-green-400" 
                              : isDisabled 
                                ? "bg-muted border-muted text-muted-foreground cursor-not-allowed opacity-50"
                                : canSelect
                                  ? "bg-secondary border-border hover:border-primary hover:bg-primary/5 cursor-pointer"
                                  : "bg-muted/50 border-muted text-muted-foreground cursor-not-allowed"
                            }
                          `}
                        >
                          <div className="flex items-center gap-2">
                            {isSelected ? (
                              <CheckCircle className="h-5 w-5 text-green-500" />
                            ) : isDisabled ? (
                              <AlertCircle className="h-5 w-5" />
                            ) : (
                              <Plus className="h-5 w-5" />
                            )}
                            <span className="font-medium">
                              {isDisabled ? "Non disponibile" : `+${parseInt(slot.oraFine) - parseInt(slot.oraInizio)}h`}
                            </span>
                          </div>
                          {!isDisabled && (
                            <Badge variant={isSelected ? "default" : "secondary"} className={isSelected ? "bg-green-500" : ""}>
                              Tot: {slot.durataTotale}h
                            </Badge>
                          )}
                        </button>
                        <div className="w-20 text-sm text-muted-foreground">
                          {slot.oraFine}
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* Riepilogo selezione */}
                {selectedSlots.length > 0 && (
                  <div className="mt-6 p-4 bg-green-50 dark:bg-green-900/20 rounded-xl border border-green-200 dark:border-green-800">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="font-medium text-green-700 dark:text-green-400">
                          Nuova sessione: {formatOra(data.prenotazione.oraInizio)} - {nuovaOraFine}
                        </p>
                        <p className="text-sm text-green-600 dark:text-green-500">
                          Durata totale: {durataTotale} ore
                        </p>
                      </div>
                      <Badge className="bg-green-500 text-white">
                        +{durataTotale - data.durataAttuale}h
                      </Badge>
                    </div>
                  </div>
                )}
              </>
            )}
          </CardContent>
        </Card>

        {/* Pulsanti azione */}
        <div className="flex gap-3">
          <Button 
            variant="outline" 
            className="flex-1"
            onClick={() => router.push("/prenotazioni")}
          >
            Annulla
          </Button>
          <Button 
            className="flex-1 bg-green-500 hover:bg-green-600"
            disabled={selectedSlots.length === 0 || extending}
            onClick={handleEstendi}
          >
            {extending ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Estendo...
              </>
            ) : (
              <>
                <CheckCircle className="h-4 w-4 mr-2" />
                Conferma Estensione
              </>
            )}
          </Button>
        </div>
      </main>
    </div>
  );
}
