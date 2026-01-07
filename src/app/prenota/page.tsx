"use client";

import { useState, useEffect, useMemo, useCallback } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { Header } from "@/components/layout/header";
import { BackButton } from "@/components/ui/back-button";
import { MappaBiblioteca, Posto as PostoMappa } from "@/components/mappa-biblioteca";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import {
  Plug,
  Accessibility,
  Volume2,
  VolumeX,
  Clock,
  MapPin,
  Calendar,
  CheckCircle2,
  Loader2,
  Info,
  AlertCircle,
  ChevronRight,
  Timer,
  Sun,
  Coffee,
  Train,
  Bell,
  List,
  Map,
  PartyPopper,
} from "lucide-react";

// Tipi
interface Sala {
  id: string;
  nome: string;
  descrizione: string;
  piano: number;
  capienza: number;
  tipoSala: string;
  orarioApertura: string;
  orarioChiusura: string;
}

interface Posto {
  id: string;
  numero: string;
  fila: string;
  haPresaElettrica: boolean;
  accessibileDisabili: boolean;
  stato: "DISPONIBILE" | "OCCUPATO" | "MANUTENZIONE" | "RISERVATO";
  posizioneX: number;
  posizioneY: number;
}

// Costanti orari biblioteca
const ORARIO_APERTURA = "09:00";
const ORARIO_CHIUSURA = "18:00";

type TipoDurata = "2h" | "mezza_mattina" | "mezza_pomeriggio" | "giornata";

interface Slot2Ore {
  id: string;
  oraInizio: string;
  oraFine: string;
  label: string;
}

const SLOTS_2_ORE: Slot2Ore[] = [
  { id: "slot1", oraInizio: "09:00", oraFine: "11:00", label: "09:00 - 11:00" },
  { id: "slot2", oraInizio: "11:00", oraFine: "13:00", label: "11:00 - 13:00" },
  { id: "slot3", oraInizio: "13:00", oraFine: "15:00", label: "13:00 - 15:00" },
  { id: "slot4", oraInizio: "15:00", oraFine: "17:00", label: "15:00 - 17:00" },
  { id: "slot5", oraInizio: "17:00", oraFine: "18:00", label: "17:00 - 18:00 (1h)" },
];

interface OpzioneDurata {
  id: TipoDurata;
  label: string;
  descrizione: string;
  oraInizio: string;
  oraFine: string;
}

const OPZIONI_DURATA: OpzioneDurata[] = [
  { id: "2h", label: "2 ore", descrizione: "Scegli uno slot di 2 ore", oraInizio: "", oraFine: "" },
  { id: "mezza_mattina", label: "Mezza giornata (mattina)", descrizione: "09:00 - 13:00", oraInizio: "09:00", oraFine: "13:00" },
  { id: "mezza_pomeriggio", label: "Mezza giornata (pomeriggio)", descrizione: "13:00 - 18:00", oraInizio: "13:00", oraFine: "18:00" },
  { id: "giornata", label: "Giornata intera", descrizione: "09:00 - 18:00", oraInizio: "09:00", oraFine: "18:00" },
];

// Festività italiane 2026
const FESTIVITA_2026 = [
  "2026-01-01", "2026-01-06", "2026-04-05", "2026-04-06", "2026-04-25",
  "2026-05-01", "2026-06-02", "2026-08-15", "2026-11-01", "2026-12-08",
  "2026-12-25", "2026-12-26",
];

// Cache disponibilità per data
interface DisponibilitaGiorno {
  data: string;
  postiDisponibili: number;
  postiTotali: number;
}

function isGiornoChiuso(data: string): { chiuso: boolean; motivo: string } {
  const date = new Date(data);
  const dayOfWeek = date.getDay();
  if (dayOfWeek === 0) return { chiuso: true, motivo: "La biblioteca è chiusa la domenica" };
  if (FESTIVITA_2026.includes(data)) return { chiuso: true, motivo: "La biblioteca è chiusa per festività" };
  return { chiuso: false, motivo: "" };
}

function formatDataDisplay(data: string): string {
  if (!data) return "";
  const date = new Date(data);
  return date.toLocaleDateString("it-IT", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
}

function getDataMinima(): string {
  return new Date().toISOString().split("T")[0];
}

function getDataMassima(): string {
  const max = new Date();
  max.setDate(max.getDate() + 30);
  return max.toISOString().split("T")[0];
}

function StepIndicator({ step, currentStep, label }: { step: number; currentStep: number; label: string }) {
  const isActive = step === currentStep;
  const isCompleted = step < currentStep;
  return (
    <div className="flex items-center gap-2">
      <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold transition-all
        ${isCompleted ? "bg-green-500 text-white" : ""}
        ${isActive ? "bg-blue-600 text-white ring-4 ring-blue-200 dark:ring-blue-800" : ""}
        ${!isActive && !isCompleted ? "bg-muted text-muted-foreground" : ""}`}>
        {isCompleted ? <CheckCircle2 className="h-5 w-5" /> : step}
      </div>
      <span className={`text-sm font-medium ${isActive ? "text-blue-600 dark:text-blue-400" : "text-muted-foreground"}`}>{label}</span>
    </div>
  );
}

function getDurataIcon(id: TipoDurata) {
  switch (id) {
    case "2h": return <Timer className="h-5 w-5" />;
    case "mezza_mattina": return <Sun className="h-5 w-5" />;
    case "mezza_pomeriggio": return <Coffee className="h-5 w-5" />;
    case "giornata": return <Calendar className="h-5 w-5" />;
  }
}

export default function PrenotaPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  
  const [currentStep, setCurrentStep] = useState(1);
  const [dataPrenotazione, setDataPrenotazione] = useState<string>("");
  const [dataError, setDataError] = useState<string>("");
  const [tipoDurata, setTipoDurata] = useState<TipoDurata | "">("");
  const [slot2OreSelezionato, setSlot2OreSelezionato] = useState<string>("");
  const [sale, setSale] = useState<Sala[]>([]);
  const [salaSelezionata, setSalaSelezionata] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [posti, setPosti] = useState<Posto[]>([]);
  const [postoSelezionato, setPostoSelezionato] = useState<Posto | null>(null);
  const [loadingPosti, setLoadingPosti] = useState(false);
  const [filtroPresaElettrica, setFiltroPresaElettrica] = useState(false);
  const [filtroAccessibile, setFiltroAccessibile] = useState(false);
  const [dialogAperto, setDialogAperto] = useState(false);
  const [prenotazioneInCorso, setPrenotazioneInCorso] = useState(false);

  useEffect(() => {
    if (status === "unauthenticated") router.push("/login?callbackUrl=/prenota");
  }, [status, router]);

  useEffect(() => {
    const oggi = getDataMinima();
    setDataPrenotazione(oggi);
    const check = isGiornoChiuso(oggi);
    if (check.chiuso) setDataError(check.motivo);
  }, []);

  useEffect(() => {
    const fetchSale = async () => {
      try {
        const res = await fetch("/api/sale");
        if (res.ok) {
          const response = await res.json();
          setSale(response.data || []);
        }
      } catch (error) {
        console.error("Errore caricamento sale:", error);
        toast.error("Errore nel caricamento delle sale");
      } finally {
        setLoading(false);
      }
    };
    if (status === "authenticated") fetchSale();
  }, [status]);

  const getOrariSelezionati = useCallback((): { oraInizio: string; oraFine: string } => {
    if (tipoDurata === "2h" && slot2OreSelezionato) {
      const slot = SLOTS_2_ORE.find(s => s.id === slot2OreSelezionato);
      return slot ? { oraInizio: slot.oraInizio, oraFine: slot.oraFine } : { oraInizio: "", oraFine: "" };
    }
    const opzione = OPZIONI_DURATA.find(o => o.id === tipoDurata);
    return opzione ? { oraInizio: opzione.oraInizio, oraFine: opzione.oraFine } : { oraInizio: "", oraFine: "" };
  }, [tipoDurata, slot2OreSelezionato]);

  useEffect(() => {
    const fetchPosti = async () => {
      if (currentStep !== 4 || !salaSelezionata) return;
      setLoadingPosti(true);
      try {
        const { oraInizio, oraFine } = getOrariSelezionati();
        const params = new URLSearchParams({ salaId: salaSelezionata, data: dataPrenotazione, oraInizio, oraFine });
        const res = await fetch(`/api/posti?${params}`);
        if (res.ok) {
          const response = await res.json();
          setPosti(response.data || []);
        }
      } catch (error) {
        console.error("Errore caricamento posti:", error);
        toast.error("Errore nel caricamento dei posti");
      } finally {
        setLoadingPosti(false);
      }
    };
    fetchPosti();
  }, [currentStep, salaSelezionata, dataPrenotazione, getOrariSelezionati]);

  const handleDataChange = (data: string) => {
    setDataPrenotazione(data);
    const check = isGiornoChiuso(data);
    setDataError(check.chiuso ? check.motivo : "");
  };

  const handleAvanti = () => { if (currentStep < 4) setCurrentStep(currentStep + 1); };
  
  const handleIndietro = () => {
    if (currentStep > 1) {
      setCurrentStep(currentStep - 1);
      if (currentStep === 4) setPostoSelezionato(null);
      if (currentStep === 3) setSalaSelezionata("");
    }
  };

  const canProceed = (): boolean => {
    switch (currentStep) {
      case 1: return !!dataPrenotazione && !dataError;
      case 2: return tipoDurata === "2h" ? !!slot2OreSelezionato : !!tipoDurata;
      case 3: return !!salaSelezionata;
      case 4: return !!postoSelezionato;
      default: return false;
    }
  };

  const handleSelectFromMap = (postoId: string) => {
    const posto = posti.find((p) => p.id === postoId);
    if (posto && posto.stato === "DISPONIBILE") setPostoSelezionato(posto);
  };

  const handleConfermaPrenotazione = async () => {
    if (!postoSelezionato || !session?.user?.id) {
      toast.error("Seleziona un posto");
      return;
    }
    const { oraInizio, oraFine } = getOrariSelezionati();
    if (!oraInizio || !oraFine) {
      toast.error("Errore negli orari selezionati");
      return;
    }
    setPrenotazioneInCorso(true);
    try {
      const res = await fetch("/api/prenotazioni", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId: session.user.id,
          postoId: postoSelezionato.id,
          data: dataPrenotazione,
          oraInizio,
          oraFine,
        }),
      });
      if (res.ok) {
        // Trigger confetti animation - lazy loaded
        const confetti = (await import("canvas-confetti")).default;
        confetti({
          particleCount: 100,
          spread: 70,
          origin: { y: 0.6 },
        });
        toast.success("Prenotazione confermata! 🎉", { description: `Posto ${postoSelezionato.numero} - ${oraInizio} - ${oraFine}`, duration: 3000 });
        setDialogAperto(false);
        // Ritardo per vedere l'animazione e il toast
        setTimeout(() => router.push("/prenotazioni"), 2500);
      } else {
        const error = await res.json();
        toast.error(error.error || "Errore nella prenotazione");
      }
    } catch (error) {
      console.error("Errore prenotazione:", error);
      toast.error("Errore di connessione");
    } finally {
      setPrenotazioneInCorso(false);
    }
  };

  const postiFiltrati = posti.filter((posto) => {
    if (filtroPresaElettrica && !posto.haPresaElettrica) return false;
    if (filtroAccessibile && !posto.accessibileDisabili) return false;
    return true;
  });

  const postiMappa: PostoMappa[] = useMemo(() => {
    return postiFiltrati.map((posto) => {
      // Converti RISERVATO in PRENOTATO per la mappa
      let statoMappa: "DISPONIBILE" | "OCCUPATO" | "PRENOTATO" | "MANUTENZIONE";
      if (posto.stato === "RISERVATO") {
        statoMappa = "PRENOTATO";
      } else if (posto.stato === "OCCUPATO" || posto.stato === "DISPONIBILE" || posto.stato === "MANUTENZIONE") {
        statoMappa = posto.stato;
      } else {
        statoMappa = "DISPONIBILE"; // fallback
      }
      
      return {
        id: posto.id,
        numero: posto.numero,
        x: posto.posizioneX || 100,
        y: posto.posizioneY || 100,
        stato: statoMappa,
        caratteristiche: {
          presaElettrica: posto.haPresaElettrica,
          finestraVicina: false,
          silenzioso: true,
          wifi: true,
          accessibile: posto.accessibileDisabili,
        },
      };
    });
  }, [postiFiltrati]);

  const salaCorrente = sale.find((s) => s.id === salaSelezionata);
  const { oraInizio, oraFine } = getOrariSelezionati();

  if (status === "loading" || loading) {
    return (
      <div className="min-h-screen bg-background">
        <Header />
        <main className="container mx-auto px-4 py-6">
          <Skeleton className="h-8 w-64 mb-6" />
          <Skeleton className="h-[400px]" />
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-background to-muted/30 dark:from-gray-900 dark:via-gray-900 dark:to-gray-950">
      <Header />
      <main className="container mx-auto px-4 py-6 max-w-4xl">
        <div className="mb-6 space-y-4">
          <BackButton href="/" />
          <div>
            <h1 className="text-3xl font-bold tracking-tight text-foreground">Prenota un Posto</h1>
            <p className="text-muted-foreground mt-1">Biblioteca aperta dalle {ORARIO_APERTURA} alle {ORARIO_CHIUSURA} • Chiusa domenica e festivi</p>
          </div>
        </div>

        <Card className="mb-6">
          <CardContent className="py-4">
            <div className="flex items-center justify-between overflow-x-auto gap-2">
              <StepIndicator step={1} currentStep={currentStep} label="Data" />
              <ChevronRight className="h-5 w-5 text-muted-foreground/50 flex-shrink-0" />
              <StepIndicator step={2} currentStep={currentStep} label="Durata" />
              <ChevronRight className="h-5 w-5 text-muted-foreground/50 flex-shrink-0" />
              <StepIndicator step={3} currentStep={currentStep} label="Sala" />
              <ChevronRight className="h-5 w-5 text-muted-foreground/50 flex-shrink-0" />
              <StepIndicator step={4} currentStep={currentStep} label="Posto" />
            </div>
          </CardContent>
        </Card>

        {currentStep === 1 && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2"><Calendar className="h-5 w-5 text-blue-600" />Quando vuoi studiare?</CardTitle>
              <CardDescription>Seleziona la data della prenotazione (max 30 giorni in anticipo)</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <Label htmlFor="data">Data</Label>
                <input type="date" id="data" value={dataPrenotazione} onChange={(e) => handleDataChange(e.target.value)} min={getDataMinima()} max={getDataMassima()} className="w-full mt-2 px-4 py-3 border rounded-lg bg-background text-lg" />
              </div>
              {dataPrenotazione && !dataError && (
                <div className="p-4 bg-blue-50 rounded-lg border border-blue-200">
                  <p className="text-blue-800 font-medium capitalize">📅 {formatDataDisplay(dataPrenotazione)}</p>
                </div>
              )}
              {dataError && (
                <div className="p-4 bg-red-50 rounded-lg border border-red-200 flex items-start gap-3">
                  <AlertCircle className="h-5 w-5 text-red-500 flex-shrink-0 mt-0.5" />
                  <div><p className="text-red-800 font-medium">{dataError}</p><p className="text-red-600 text-sm mt-1">Seleziona un altro giorno</p></div>
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {currentStep === 2 && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2"><Clock className="h-5 w-5 text-blue-600 dark:text-blue-400" />Per quanto tempo?</CardTitle>
              <CardDescription>Scegli la durata della tua prenotazione (minimo 2 ore)</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {OPZIONI_DURATA.map((opzione) => (
                  <button key={opzione.id} onClick={() => { setTipoDurata(opzione.id); if (opzione.id !== "2h") setSlot2OreSelezionato(""); }}
                    className={`p-4 rounded-lg border-2 text-left transition-all ${tipoDurata === opzione.id ? "border-blue-500 bg-blue-50 dark:bg-blue-950 ring-2 ring-blue-200 dark:ring-blue-800" : "border-border hover:border-muted-foreground/50 hover:bg-muted"}`}>
                    <div className="flex items-center gap-3">
                      <div className={`p-2 rounded-full ${tipoDurata === opzione.id ? "bg-blue-100 dark:bg-blue-900 text-blue-600 dark:text-blue-400" : "bg-muted text-muted-foreground"}`}>{getDurataIcon(opzione.id)}</div>
                      <div><p className="font-semibold">{opzione.label}</p><p className="text-sm text-muted-foreground">{opzione.descrizione}</p></div>
                    </div>
                  </button>
                ))}
              </div>
              {tipoDurata === "2h" && (
                <div className="mt-6 p-4 bg-muted dark:bg-gray-800 rounded-lg">
                  <Label className="text-base font-semibold mb-3 block">Seleziona fascia oraria</Label>
                  <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                    {SLOTS_2_ORE.map((slot) => (
                      <button key={slot.id} onClick={() => setSlot2OreSelezionato(slot.id)}
                        className={`p-3 rounded-lg border text-center transition-all ${slot2OreSelezionato === slot.id ? "border-blue-500 bg-blue-100 dark:bg-blue-900 text-blue-800 dark:text-blue-200 font-semibold" : "border-border bg-card hover:border-blue-300"}`}>
                        {slot.label}
                      </button>
                    ))}
                  </div>
                </div>
              )}
              {canProceed() && <div className="p-4 bg-green-50 dark:bg-green-950 rounded-lg border border-green-200 dark:border-green-800"><p className="text-green-800 dark:text-green-200 font-medium">⏰ Orario selezionato: {oraInizio} - {oraFine}</p></div>}
            </CardContent>
          </Card>
        )}

        {currentStep === 3 && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2"><MapPin className="h-5 w-5 text-blue-600 dark:text-blue-400" />Dove vuoi studiare?</CardTitle>
              <CardDescription>Scegli la sala che preferisci</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {sale.map((sala) => (
                <button key={sala.id} onClick={() => setSalaSelezionata(sala.id)}
                  className={`w-full p-4 rounded-lg border-2 text-left transition-all ${salaSelezionata === sala.id ? "border-blue-500 bg-blue-50 dark:bg-blue-950 ring-2 ring-blue-200 dark:ring-blue-800" : "border-border hover:border-muted-foreground/50 hover:bg-muted"}`}>
                  <div className="flex items-start gap-4">
                    <div className={`p-3 rounded-full ${salaSelezionata === sala.id ? "bg-blue-100 dark:bg-blue-900" : "bg-muted"}`}>
                      {sala.tipoSala === "SILENZIOSA" ? <VolumeX className={`h-6 w-6 ${salaSelezionata === sala.id ? "text-blue-600 dark:text-blue-400" : "text-muted-foreground"}`} /> : sala.tipoSala === "GRUPPO" ? <Volume2 className={`h-6 w-6 ${salaSelezionata === sala.id ? "text-blue-600 dark:text-blue-400" : "text-orange-500"}`} /> : <MapPin className={`h-6 w-6 ${salaSelezionata === sala.id ? "text-blue-600 dark:text-blue-400" : "text-muted-foreground"}`} />}
                    </div>
                    <div className="flex-1">
                      <div className="flex items-center gap-2"><p className="font-semibold text-lg">{sala.nome}</p><Badge variant="secondary">Piano {sala.piano}</Badge></div>
                      <p className="text-muted-foreground text-sm mt-1">{sala.descrizione}</p>
                      <div className="flex gap-4 mt-2 text-sm text-muted-foreground"><span>{sala.capienza} posti</span><span>•</span><span>{sala.orarioApertura} - {sala.orarioChiusura}</span></div>
                    </div>
                  </div>
                </button>
              ))}
            </CardContent>
          </Card>
        )}

        {currentStep === 4 && (
          <div className="space-y-4">
            <Card className="bg-blue-50 dark:bg-blue-950 border-blue-200 dark:border-blue-800">
              <CardContent className="py-4">
                <div className="flex flex-wrap gap-4 text-sm">
                  <div className="flex items-center gap-2"><Calendar className="h-4 w-4 text-blue-600" /><span className="font-medium capitalize">{formatDataDisplay(dataPrenotazione)}</span></div>
                  <div className="flex items-center gap-2"><Clock className="h-4 w-4 text-blue-600" /><span className="font-medium">{oraInizio} - {oraFine}</span></div>
                  <div className="flex items-center gap-2"><MapPin className="h-4 w-4 text-blue-600" /><span className="font-medium">{salaCorrente?.nome}</span></div>
                </div>
              </CardContent>
            </Card>
            
            {/* Switch rapido tra sale */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-lg flex items-center gap-2">
                  <Map className="h-5 w-5 text-blue-600" />
                  Cambia Sala
                </CardTitle>
                <CardDescription>Passa rapidamente ad un&apos;altra sala senza tornare indietro</CardDescription>
              </CardHeader>
              <CardContent>
                <Tabs value={salaSelezionata} onValueChange={(value) => {
                  setSalaSelezionata(value);
                  setPostoSelezionato(null);
                }} className="w-full">
                  <TabsList className="w-full flex-wrap h-auto gap-1 bg-slate-100 p-1">
                    {sale.map((sala) => (
                      <TabsTrigger 
                        key={sala.id} 
                        value={sala.id} 
                        className="flex-1 min-w-[120px] data-[state=active]:bg-blue-600 data-[state=active]:text-white"
                      >
                        <div className="flex items-center gap-2">
                          {sala.tipoSala === "SILENZIOSA" ? <VolumeX className="h-4 w-4" /> : 
                           sala.tipoSala === "GRUPPO" ? <Volume2 className="h-4 w-4" /> : 
                           <MapPin className="h-4 w-4" />}
                          <span className="truncate">{sala.nome.replace("Sala ", "")}</span>
                          <Badge variant="outline" className="ml-1 text-xs">P{sala.piano}</Badge>
                        </div>
                      </TabsTrigger>
                    ))}
                  </TabsList>
                </Tabs>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-3"><CardTitle className="text-lg">Filtri</CardTitle></CardHeader>
              <CardContent>
                <div className="flex flex-wrap gap-6">
                  <div className="flex items-center space-x-2"><Switch id="presa" checked={filtroPresaElettrica} onCheckedChange={setFiltroPresaElettrica} /><Label htmlFor="presa" className="flex items-center gap-2"><Plug className="h-4 w-4" />Presa elettrica</Label></div>
                  <div className="flex items-center space-x-2"><Switch id="accessibile" checked={filtroAccessibile} onCheckedChange={setFiltroAccessibile} /><Label htmlFor="accessibile" className="flex items-center gap-2"><Accessibility className="h-4 w-4" />Accessibile</Label></div>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-3"><CardTitle className="text-lg">Seleziona un Posto</CardTitle><CardDescription>Clicca su un posto verde per selezionarlo • {postiFiltrati.filter(p => p.stato === "DISPONIBILE").length} posti disponibili</CardDescription></CardHeader>
              <CardContent>
                {loadingPosti ? <div className="flex items-center justify-center h-64"><Loader2 className="h-8 w-8 animate-spin text-muted-foreground" /></div> : postiFiltrati.length === 0 ? <div className="flex flex-col items-center justify-center h-64 text-muted-foreground"><Info className="h-12 w-12 mb-4" /><p>Nessun posto disponibile con i filtri selezionati</p></div> : <MappaBiblioteca sala={salaCorrente?.nome || "Sala Studio"} piano={salaCorrente?.piano || 1} posti={postiMappa} postoSelezionato={postoSelezionato?.id || null} onSelectPosto={handleSelectFromMap} />}
              </CardContent>
            </Card>
          </div>
        )}

        <div className="mt-6 flex justify-between gap-4">
          {currentStep > 1 ? <Button variant="outline" onClick={handleIndietro} className="flex-1 max-w-[200px]">Indietro</Button> : <div />}
          {currentStep < 4 ? <Button onClick={handleAvanti} disabled={!canProceed()} className="flex-1 max-w-[200px]">Avanti<ChevronRight className="ml-2 h-4 w-4" /></Button> : <Button onClick={() => setDialogAperto(true)} disabled={!postoSelezionato} className="flex-1 max-w-[200px] bg-green-600 hover:bg-green-700"><CheckCircle2 className="mr-2 h-4 w-4" />Conferma Prenotazione</Button>}
        </div>
      </main>

      <Dialog open={dialogAperto} onOpenChange={setDialogAperto}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader><DialogTitle>Conferma Prenotazione</DialogTitle><DialogDescription>Verifica i dettagli della tua prenotazione</DialogDescription></DialogHeader>
          <div className="space-y-4 py-4">
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div><p className="text-muted-foreground">Data</p><p className="font-medium capitalize">{formatDataDisplay(dataPrenotazione)}</p></div>
              <div><p className="text-muted-foreground">Orario</p><p className="font-medium">{oraInizio} - {oraFine}</p></div>
              <div><p className="text-muted-foreground">Sala</p><p className="font-medium">{salaCorrente?.nome}</p></div>
              <div><p className="text-muted-foreground">Posto</p><p className="font-medium">{postoSelezionato?.numero}</p></div>
            </div>
            {postoSelezionato && (
              <div className="flex gap-2 pt-2">
                {postoSelezionato.haPresaElettrica && <Badge variant="secondary" className="flex items-center gap-1"><Plug className="h-3 w-3" />Presa</Badge>}
                {postoSelezionato.accessibileDisabili && <Badge variant="secondary" className="flex items-center gap-1"><Accessibility className="h-3 w-3" />Accessibile</Badge>}
              </div>
            )}
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setDialogAperto(false)}>Annulla</Button>
            <Button onClick={handleConfermaPrenotazione} disabled={prenotazioneInCorso} className="bg-green-600 hover:bg-green-700">
              {prenotazioneInCorso ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Prenotazione...</> : <><CheckCircle2 className="mr-2 h-4 w-4" />Conferma</>}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
