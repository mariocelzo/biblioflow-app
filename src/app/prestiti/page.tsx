// ============================================
// PAGINA I MIEI PRESTITI - BiblioFlow
// ============================================
// Design basato sui principi HCI:
// - Visibilità dello stato (scadenze, stati prestiti)
// - Ricerca intuitiva (catalogo libri)
// - Feedback immediato (toast notifiche)

"use client";

import { useState, useEffect } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { Header } from "@/components/layout/header";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
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
  BookOpen,
  Search,
  Calendar,
  Clock,
  RefreshCw,
  AlertTriangle,
  BookMarked,
  Library,
  Loader2,
  History,
  RotateCcw,
} from "lucide-react";

// Tipi
interface Libro {
  id: string;
  titolo: string;
  autore: string;
  isbn: string;
  editore: string;
  annoPubblicazione: number;
  genere: string;
  copieDisponibili: number;
  copieTotali: number;
  posizione: string;
}

interface Prestito {
  id: string;
  dataInizio: string;
  dataScadenza: string;
  dataRestituzione: string | null;
  stato: "ATTIVO" | "RESTITUITO" | "SCADUTO" | "RINNOVATO";
  rinnovi: number;
  maxRinnovi: number;
  libro: Libro;
}

export default function PrestitiPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  
  // Stati prestiti
  const [prestiti, setPrestiti] = useState<Prestito[]>([]);
  const [loadingPrestiti, setLoadingPrestiti] = useState(true);
  
  // Stati catalogo
  const [libri, setLibri] = useState<Libro[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [loadingLibri, setLoadingLibri] = useState(false);
  
  // Dialog
  const [dialogRinnovoAperto, setDialogRinnovoAperto] = useState(false);
  const [prestitoDaRinnovare, setPrestitoDaRinnovare] = useState<string | null>(null);
  const [operazioneInCorso, setOperazioneInCorso] = useState(false);

  // Redirect se non autenticato
  useEffect(() => {
    if (status === "unauthenticated") {
      router.push("/login?callbackUrl=/prestiti");
    }
  }, [status, router]);

  // Carica prestiti utente
  useEffect(() => {
    const fetchPrestiti = async () => {
      if (!session?.user?.id) return;
      try {
        const res = await fetch(`/api/prestiti?utenteId=${session.user.id}`);
        if (res.ok) {
          const response = await res.json();
          // L'API restituisce { success, data, count }
          setPrestiti(Array.isArray(response.data) ? response.data : []);
        }
      } catch (error) {
        console.error("Errore caricamento prestiti:", error);
        toast.error("Errore nel caricamento dei prestiti");
      } finally {
        setLoadingPrestiti(false);
      }
    };
    if (status === "authenticated") {
      fetchPrestiti();
    }
  }, [status, session?.user?.id]);

  // Cerca libri
  const handleSearchLibri = async () => {
    if (!searchQuery.trim()) return;
    
    setLoadingLibri(true);
    try {
      const res = await fetch(`/api/libri?search=${encodeURIComponent(searchQuery)}`);
      if (res.ok) {
        const data = await res.json();
        setLibri(data);
      }
    } catch (error) {
      console.error("Errore ricerca libri:", error);
      toast.error("Errore nella ricerca");
    } finally {
      setLoadingLibri(false);
    }
  };

  // Rinnova prestito
  const handleRinnova = async () => {
    if (!prestitoDaRinnovare) return;
    
    setOperazioneInCorso(true);
    try {
      const res = await fetch(`/api/prestiti/${prestitoDaRinnovare}/rinnova`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });

      if (res.ok) {
        const response = await res.json();
        toast.success("Prestito rinnovato! 📚", {
          description: response.message,
        });
        setPrestiti((prev) =>
          prev.map((p) =>
            p.id === prestitoDaRinnovare
              ? { ...p, dataScadenza: response.data.dataScadenza, rinnovi: response.data.rinnovi, stato: response.data.stato }
              : p
          )
        );
        setDialogRinnovoAperto(false);
      } else {
        const error = await res.json();
        toast.error(error.error || "Errore nel rinnovo");
      }
    } catch (error) {
      console.error("Errore rinnovo:", error);
      toast.error("Errore di connessione");
    } finally {
      setOperazioneInCorso(false);
      setPrestitoDaRinnovare(null);
    }
  };

  // Filtra prestiti per stato
  const prestitiAttivi = prestiti.filter((p) => ["ATTIVO", "RINNOVATO"].includes(p.stato));
  const prestitiPassati = prestiti.filter((p) => ["RESTITUITO", "SCADUTO"].includes(p.stato));

  // Calcola giorni alla scadenza
  const giorniAllaScadenza = (dataScadenza: string) => {
    const oggi = new Date();
    const scadenza = new Date(dataScadenza);
    const diff = Math.ceil((scadenza.getTime() - oggi.getTime()) / (1000 * 60 * 60 * 24));
    return diff;
  };

  // Ottieni badge stato prestito
  const getStatoBadge = (prestito: Prestito) => {
    const giorni = giorniAllaScadenza(prestito.dataScadenza);
    
    if (prestito.stato === "RESTITUITO") {
      return <Badge variant="outline">Restituito</Badge>;
    }
    if (prestito.stato === "SCADUTO" || giorni < 0) {
      return <Badge variant="destructive">Scaduto</Badge>;
    }
    if (giorni <= 3) {
      return <Badge className="bg-amber-500">Scade tra {giorni}g</Badge>;
    }
    return <Badge className="bg-green-500">Attivo</Badge>;
  };

  // Card prestito
  const PrestitoCard = ({ prestito }: { prestito: Prestito }) => {
    const giorni = giorniAllaScadenza(prestito.dataScadenza);
    const isScaduto = giorni < 0;
    const inScadenza = giorni <= 3 && giorni >= 0;
    const puoRinnovare = prestito.rinnovi < prestito.maxRinnovi && !isScaduto;

    return (
      <Card className={isScaduto ? "border-red-500 border-2" : inScadenza ? "border-amber-500 border-2" : ""}>
        <CardContent className="p-4">
          <div className="flex gap-4">
            {/* Icona libro */}
            <div className="flex-shrink-0 w-16 h-20 bg-primary/10 rounded flex items-center justify-center">
              <BookOpen className="h-8 w-8 text-primary" />
            </div>
            
            {/* Info libro */}
            <div className="flex-1 min-w-0">
              <div className="flex justify-between items-start gap-2">
                <div className="min-w-0">
                  <h3 className="font-medium truncate">{prestito.libro.titolo}</h3>
                  <p className="text-sm text-muted-foreground">{prestito.libro.autore}</p>
                </div>
                {getStatoBadge(prestito)}
              </div>
              
              {/* Date e countdown */}
              <div className="flex flex-wrap gap-4 mt-2 text-sm text-muted-foreground">
                <div className="flex items-center gap-1">
                  <Calendar className="h-4 w-4" />
                  Preso: {new Date(prestito.dataInizio).toLocaleDateString("it-IT")}
                </div>
                <div className="flex items-center gap-1">
                  <Clock className="h-4 w-4" />
                  Scadenza: {new Date(prestito.dataScadenza).toLocaleDateString("it-IT")}
                </div>
                {/* Countdown giorni */}
                {prestito.stato !== "RESTITUITO" && (
                  <Badge 
                    variant="outline"
                    className={`
                      ${isScaduto ? "bg-red-100 text-red-700 border-red-300" : ""}
                      ${inScadenza && !isScaduto ? "bg-amber-100 text-amber-700 border-amber-300" : ""}
                      ${giorni > 3 ? "bg-green-100 text-green-700 border-green-300" : ""}
                    `}
                  >
                    {isScaduto 
                      ? `Scaduto da ${Math.abs(giorni)} giorni` 
                      : giorni === 0 
                        ? "Scade oggi!" 
                        : giorni === 1 
                          ? "Scade domani" 
                          : `${giorni} giorni rimanenti`
                    }
                  </Badge>
                )}
              </div>
              
              {/* Info rinnovi */}
              {prestito.rinnovi > 0 && (
                <p className="text-xs text-muted-foreground mt-1">
                  Rinnovato {prestito.rinnovi}/{prestito.maxRinnovi} volte
                </p>
              )}
            </div>
          </div>

          {/* Azioni */}
          {prestito.stato !== "RESTITUITO" && (
            <div className="flex gap-2 mt-4 pt-4 border-t">
              {puoRinnovare && (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    setPrestitoDaRinnovare(prestito.id);
                    setDialogRinnovoAperto(true);
                  }}
                  disabled={operazioneInCorso}
                >
                  <RefreshCw className="mr-2 h-4 w-4" />
                  Rinnova
                </Button>
              )}
              {isScaduto && (
                <div className="flex items-center gap-2 text-sm text-red-600">
                  <AlertTriangle className="h-4 w-4" />
                  Restituisci il libro in biblioteca
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    );
  };

  // Card libro catalogo
  const LibroCard = ({ libro }: { libro: Libro }) => {
    const disponibile = libro.copieDisponibili > 0;

    return (
      <Card>
        <CardContent className="p-4">
          <div className="flex gap-4">
            <div className="flex-shrink-0 w-12 h-16 bg-primary/10 rounded flex items-center justify-center">
              <BookMarked className="h-6 w-6 text-primary" />
            </div>
            
            <div className="flex-1 min-w-0">
              <h3 className="font-medium truncate">{libro.titolo}</h3>
              <p className="text-sm text-muted-foreground">{libro.autore}</p>
              <div className="flex items-center gap-2 mt-1">
                <Badge variant={disponibile ? "default" : "secondary"}>
                  {disponibile ? `${libro.copieDisponibili} disponibili` : "Non disponibile"}
                </Badge>
                <span className="text-xs text-muted-foreground">
                  {libro.posizione}
                </span>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    );
  };

  // Loading state
  if (status === "loading" || loadingPrestiti) {
    return (
      <div className="min-h-screen bg-background">
        <Header />
        <main className="container mx-auto px-4 py-6">
          <Skeleton className="h-8 w-64 mb-6" />
          <div className="space-y-4">
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
        {/* Intestazione */}
        <div className="mb-6">
          <h1 className="text-2xl font-bold">I Miei Prestiti</h1>
          <p className="text-muted-foreground">
            Gestisci i tuoi prestiti e cerca libri nel catalogo
          </p>
        </div>

        {/* Tabs */}
        <Tabs defaultValue="attivi" className="space-y-4">
          <TabsList>
            <TabsTrigger value="attivi" className="flex items-center gap-2">
              <BookOpen className="h-4 w-4" />
              Attivi ({prestitiAttivi.length})
            </TabsTrigger>
            <TabsTrigger value="storico" className="flex items-center gap-2">
              <History className="h-4 w-4" />
              Storico ({prestitiPassati.length})
            </TabsTrigger>
            <TabsTrigger value="catalogo" className="flex items-center gap-2">
              <Library className="h-4 w-4" />
              Catalogo
            </TabsTrigger>
          </TabsList>

          {/* Tab Prestiti Attivi */}
          <TabsContent value="attivi">
            {prestitiAttivi.length === 0 ? (
              <Card>
                <CardContent className="flex flex-col items-center justify-center py-12">
                  <BookOpen className="h-12 w-12 text-muted-foreground mb-4" />
                  <h3 className="text-lg font-medium mb-2">
                    Nessun prestito attivo
                  </h3>
                  <p className="text-muted-foreground text-center">
                    Non hai libri in prestito. Cerca nel catalogo!
                  </p>
                </CardContent>
              </Card>
            ) : (
              <div className="space-y-4">
                {/* Alert prestiti in scadenza */}
                {prestitiAttivi.some((p) => giorniAllaScadenza(p.dataScadenza) <= 3) && (
                  <Card className="bg-amber-50 dark:bg-amber-950 border-amber-200">
                    <CardContent className="p-4 flex items-center gap-3">
                      <AlertTriangle className="h-5 w-5 text-amber-600" />
                      <p className="text-sm text-amber-800 dark:text-amber-200">
                        Hai prestiti in scadenza! Ricorda di rinnovarli o restituirli.
                      </p>
                    </CardContent>
                  </Card>
                )}
                
                {prestitiAttivi.map((prestito) => (
                  <PrestitoCard key={prestito.id} prestito={prestito} />
                ))}
              </div>
            )}
          </TabsContent>

          {/* Tab Storico */}
          <TabsContent value="storico">
            {prestitiPassati.length === 0 ? (
              <Card>
                <CardContent className="flex flex-col items-center justify-center py-12">
                  <History className="h-12 w-12 text-muted-foreground mb-4" />
                  <h3 className="text-lg font-medium">Nessun prestito passato</h3>
                  <p className="text-muted-foreground">
                    Lo storico dei tuoi prestiti apparirà qui
                  </p>
                </CardContent>
              </Card>
            ) : (
              <div className="space-y-4">
                {prestitiPassati.map((prestito) => (
                  <PrestitoCard key={prestito.id} prestito={prestito} />
                ))}
              </div>
            )}
          </TabsContent>

          {/* Tab Catalogo */}
          <TabsContent value="catalogo">
            <Card>
              <CardContent className="p-4">
                {/* Barra ricerca */}
                <div className="flex gap-2 mb-4">
                  <div className="relative flex-1">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                      placeholder="Cerca per titolo, autore o ISBN..."
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      onKeyDown={(e) => e.key === "Enter" && handleSearchLibri()}
                      className="pl-10"
                    />
                  </div>
                  <Button onClick={handleSearchLibri} disabled={loadingLibri}>
                    {loadingLibri ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      "Cerca"
                    )}
                  </Button>
                </div>

                {/* Risultati */}
                {libri.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
                    <Library className="h-12 w-12 mb-4" />
                    <p>Cerca un libro nel catalogo della biblioteca</p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    <p className="text-sm text-muted-foreground">
                      {libri.length} risultati trovati
                    </p>
                    {libri.map((libro) => (
                      <LibroCard key={libro.id} libro={libro} />
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </main>

      {/* Dialog conferma rinnovo */}
      <Dialog open={dialogRinnovoAperto} onOpenChange={setDialogRinnovoAperto}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <RotateCcw className="h-5 w-5" />
              Rinnova Prestito
            </DialogTitle>
            <DialogDescription>
              Il prestito sarà esteso di 14 giorni dalla data attuale.
              Puoi rinnovare massimo 2 volte.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setDialogRinnovoAperto(false)}
            >
              Annulla
            </Button>
            <Button onClick={handleRinnova} disabled={operazioneInCorso}>
              {operazioneInCorso ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <RefreshCw className="mr-2 h-4 w-4" />
              )}
              Conferma Rinnovo
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
