"use client";

import { useState, useEffect, use } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { Header } from "@/components/layout/header";
import { BackButton } from "@/components/ui/back-button";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
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
  Book,
  BookOpen,
  MapPin,
  Calendar,
  Building2,
  Hash,
  CheckCircle,
  XCircle,
  Clock,
  Star,
  Users,
  Loader2,
  AlertCircle,
  BookMarked,
  ArrowRight,
  PackageCheck,
  HelpingHand,
} from "lucide-react";

interface Libro {
  id: string;
  titolo: string;
  autore: string;
  isbn: string;
  editore: string | null;
  annoPubblicazione: number | null;
  categoria: string | null;
  descrizione: string | null;
  copertina: string | null;
  posizione: string | null;
  copieDisponibili: number;
  copieTotali: number;
  prestitiTotali?: number;
  createdAt: string;
}

interface PrestitoAttivo {
  id: string;
  dataInizio: string;
  dataScadenza: string;
  stato: string;
}

export default function DettaglioLibroPage({ params }: { params: Promise<{ id: string }> }) {
  const resolvedParams = use(params);
  const { data: session, status } = useSession();
  const router = useRouter();

  const [libro, setLibro] = useState<Libro | null>(null);
  const [prestitoAttivo, setPrestitoAttivo] = useState<PrestitoAttivo | null>(null);
  const [loading, setLoading] = useState(true);
  const [richiediLoading, setRichiediLoading] = useState(false);
  const [showRichiediDialog, setShowRichiediDialog] = useState(false);

  // Stati per Richiesta Preparazione (Click & Collect)
  const [showPreparazioneDialog, setShowPreparazioneDialog] = useState(false);
  const [preparazioneLoading, setPreparazioneLoading] = useState(false);

  useEffect(() => {
    if (status === "unauthenticated") {
      router.push("/login");
    }
  }, [status, router]);

  useEffect(() => {
    const fetchData = async () => {
      if (!session?.user?.id) return;
      setLoading(true);
      try {
        // Fetch libro
        const libroRes = await fetch(`/api/libri/${resolvedParams.id}`);
        if (libroRes.ok) {
          const libroData = await libroRes.json();
          setLibro(libroData.data);
        } else {
          toast.error("Libro non trovato");
          router.push("/libri");
          return;
        }

        // Verifica se l'utente ha un prestito attivo per questo libro
        const prestitiRes = await fetch(`/api/prestiti?userId=${session.user.id}`);
        if (prestitiRes.ok) {
          const prestitiData = await prestitiRes.json();
          const prestiti = prestitiData.data || [];
          const prestito = prestiti.find(
            (p: { libro?: { id: string }; libroId?: string; stato: string }) =>
              (p.libro?.id === resolvedParams.id || p.libroId === resolvedParams.id) &&
              p.stato === "ATTIVO"
          );
          if (prestito) {
            setPrestitoAttivo(prestito);
          }
        }
      } catch (error) {
        console.error("Errore:", error);
        toast.error("Errore nel caricamento");
      } finally {
        setLoading(false);
      }
    };

    if (status === "authenticated") {
      fetchData();
    }
  }, [resolvedParams.id, session?.user?.id, status, router]);

  const handleRichiediPrestito = async () => {
    if (!session?.user?.id || !libro) return;
    setRichiediLoading(true);
    try {
      const res = await fetch("/api/prestiti", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId: session.user.id,
          libroId: libro.id,
        }),
      });

      if (res.ok) {
        const data = await res.json();
        setPrestitoAttivo(data.data);
        setShowRichiediDialog(false);
        setLibro({ ...libro, copieDisponibili: libro.copieDisponibili - 1 });
        toast.success("Prestito richiesto con successo!", {
          description: "Ritira il libro al banco prestiti entro 24 ore",
        });
      } else {
        const error = await res.json();
        toast.error(error.error || "Errore nella richiesta");
      }
    } catch (error) {
      console.error("Errore:", error);
      toast.error("Errore di connessione");
    } finally {
      setRichiediLoading(false);
    }
  };

  const handleRichiestaPreparazione = async () => {
    if (!session?.user?.id || !libro) return;
    setPreparazioneLoading(true);

    try {
      const res = await fetch("/api/richieste", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId: session.user.id,
          libroId: libro.id,
          note: "Richiesta da app BiblioFlow"
        }),
      });

      if (res.ok) {
        setShowPreparazioneDialog(false);
        // Mostra feedback di successo
        toast.success("Richiesta inviata al bibliotecario!", {
          description: "Il libro verrà prelevato dallo scaffale. Riceverai una notifica quando sarà pronto.",
          icon: <PackageCheck className="h-5 w-5 text-green-600" />,
          duration: 5000,
        });
      } else {
        const err = await res.json();
        toast.error(err.error || "Errore nell'invio della richiesta");
      }
    } catch (error) {
      console.error("Errore:", error);
      toast.error("Errore di connessione");
    } finally {
      setPreparazioneLoading(false);
    }
  };

  const calcolaGiorniRimanenti = (dataScadenza: string) => {
    const oggi = new Date();
    const scadenza = new Date(dataScadenza);
    const diff = Math.ceil((scadenza.getTime() - oggi.getTime()) / (1000 * 60 * 60 * 24));
    return diff;
  };

  if (status === "loading" || loading) {
    return (
      <div className="min-h-screen bg-gray-50">
        <Header />
        <main className="container mx-auto px-4 py-8 max-w-4xl">
          <BackButton />
          <div className="space-y-6 mt-6">
            <Card>
              <div className="bg-gradient-to-br from-blue-600 to-indigo-700 p-6">
                <div className="flex gap-6">
                  <Skeleton className="w-32 h-44 rounded-lg bg-white/20" />
                  <div className="flex-1 space-y-3">
                    <Skeleton className="h-8 w-3/4 bg-white/20" />
                    <Skeleton className="h-5 w-1/2 bg-white/20" />
                    <Skeleton className="h-6 w-1/3 bg-white/20" />
                  </div>
                </div>
              </div>
              <CardContent className="p-6 space-y-4">
                <Skeleton className="h-4 w-full" />
                <div className="grid grid-cols-2 gap-4">
                  <Skeleton className="h-20 rounded-xl" />
                  <Skeleton className="h-20 rounded-xl" />
                </div>
              </CardContent>
            </Card>
          </div>
        </main>
      </div>
    );
  }

  if (!libro) {
    return (
      <div className="min-h-screen bg-gray-50">
        <Header />
        <main className="container mx-auto px-4 py-8 max-w-4xl">
          <div className="text-center py-12">
            <AlertCircle className="w-12 h-12 text-red-500 mx-auto mb-4" />
            <h2 className="text-xl font-semibold text-gray-900 mb-2">Libro non trovato</h2>
            <Button onClick={() => router.push("/libri")}>Torna al catalogo</Button>
          </div>
        </main>
      </div>
    );
  }

  const disponibile = libro.copieDisponibili > 0;
  const percentualeDisponibilita = libro.copieTotali > 0
    ? Math.round((libro.copieDisponibili / libro.copieTotali) * 100)
    : 0;

  return (
    <div className="min-h-screen bg-gray-50 pb-24">
      <Header />

      <main className="container mx-auto px-4 py-8 max-w-4xl">
        <BackButton />

        <div className="space-y-6 mt-6">
          {/* Hero Card */}
          <Card className="border-0 shadow-lg overflow-hidden">
            <div className="bg-gradient-to-br from-blue-600 to-indigo-700 p-6 text-white">
              <div className="flex gap-6">
                {/* Copertina */}
                <div className="flex-shrink-0">
                  <div className="w-32 h-44 bg-white/20 backdrop-blur rounded-lg flex items-center justify-center shadow-xl overflow-hidden relative">
                    {libro.copertina ? (
                      <Image
                        src={libro.copertina}
                        alt={`Copertina del libro ${libro.titolo}`}
                        fill
                        className="object-cover"
                        sizes="128px"
                        priority
                      />
                    ) : (
                      <Book className="w-16 h-16 text-white/60" />
                    )}
                  </div>
                </div>

                {/* Info principali */}
                <div className="flex-1 min-w-0">
                  <h1 className="text-2xl font-bold mb-2 line-clamp-2">{libro.titolo}</h1>
                  <p className="text-blue-100 text-lg mb-4">{libro.autore}</p>

                  <div className="flex flex-wrap gap-2">
                    {libro.categoria && (
                      <Badge className="bg-white/20 hover:bg-white/30 text-white border-0">
                        {libro.categoria}
                      </Badge>
                    )}
                    <Badge
                      className={`border-0 ${disponibile
                        ? "bg-emerald-500/90 text-white"
                        : "bg-red-500/90 text-white"
                        }`}
                    >
                      {disponibile ? (
                        <>
                          <CheckCircle className="w-3 h-3 mr-1" /> Disponibile
                        </>
                      ) : (
                        <>
                          <XCircle className="w-3 h-3 mr-1" /> Non disponibile
                        </>
                      )}
                    </Badge>
                  </div>
                </div>
              </div>
            </div>

            <CardContent className="p-6">
              {/* Barra disponibilità */}
              <div className="mb-6">
                <div className="flex justify-between text-sm mb-2">
                  <span className="text-gray-600">Disponibilità</span>
                  <span className="font-medium">
                    {libro.copieDisponibili} / {libro.copieTotali} copie
                  </span>
                </div>
                <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all duration-500 ${percentualeDisponibilita > 50
                      ? "bg-emerald-500"
                      : percentualeDisponibilita > 20
                        ? "bg-amber-500"
                        : "bg-red-500"
                      }`}
                    style={{ width: `${percentualeDisponibilita}%` }}
                  />
                </div>
              </div>

              {/* Dettagli */}
              <div className="grid grid-cols-2 gap-4">
                <div className="flex items-center gap-3 p-3 bg-muted dark:bg-gray-800 rounded-xl">
                  <div className="w-10 h-10 bg-blue-100 dark:bg-blue-900 rounded-full flex items-center justify-center">
                    <Hash className="w-5 h-5 text-blue-600 dark:text-blue-400" />
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">ISBN</p>
                    <p className="font-medium text-foreground text-sm">{libro.isbn}</p>
                  </div>
                </div>

                {libro.editore && (
                  <div className="flex items-center gap-3 p-3 bg-muted dark:bg-gray-800 rounded-xl">
                    <div className="w-10 h-10 bg-purple-100 dark:bg-purple-900 rounded-full flex items-center justify-center">
                      <Building2 className="w-5 h-5 text-purple-600 dark:text-purple-400" />
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">Editore</p>
                      <p className="font-medium text-foreground text-sm">{libro.editore}</p>
                    </div>
                  </div>
                )}

                {libro.annoPubblicazione && (
                  <div className="flex items-center gap-3 p-3 bg-muted dark:bg-gray-800 rounded-xl">
                    <div className="w-10 h-10 bg-amber-100 dark:bg-amber-900 rounded-full flex items-center justify-center">
                      <Calendar className="w-5 h-5 text-amber-600 dark:text-amber-400" />
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">Anno</p>
                      <p className="font-medium text-foreground text-sm">{libro.annoPubblicazione}</p>
                    </div>
                  </div>
                )}

                {libro.posizione && (
                  <div className="flex items-center gap-3 p-3 bg-muted dark:bg-gray-800 rounded-xl">
                    <div className="w-10 h-10 bg-emerald-100 dark:bg-emerald-900 rounded-full flex items-center justify-center">
                      <MapPin className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">Posizione</p>
                      <p className="font-medium text-foreground text-sm">{libro.posizione}</p>
                    </div>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Descrizione */}
          {libro.descrizione && (
            <Card className="border-0 shadow-md">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-lg">
                  <BookOpen className="w-5 h-5 text-blue-600" />
                  Descrizione
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-muted-foreground leading-relaxed">{libro.descrizione}</p>
              </CardContent>
            </Card>
          )}

          {/* Prestito attivo */}
          {prestitoAttivo && (
            <Card className="border-0 shadow-md bg-blue-50 dark:bg-blue-950 border-l-4 border-l-blue-500">
              <CardContent className="p-6">
                <div className="flex items-start gap-4">
                  <div className="w-12 h-12 bg-blue-100 dark:bg-blue-900 rounded-full flex items-center justify-center flex-shrink-0">
                    <Clock className="w-6 h-6 text-blue-600 dark:text-blue-400" />
                  </div>
                  <div className="flex-1">
                    <h3 className="font-semibold text-foreground mb-1">
                      Hai già questo libro in prestito
                    </h3>
                    <p className="text-sm text-muted-foreground mb-1">
                      Data scadenza:{" "}
                      <strong>
                        {new Date(prestitoAttivo.dataScadenza).toLocaleDateString("it-IT", {
                          day: "numeric",
                          month: "long",
                          year: "numeric",
                        })}
                      </strong>
                    </p>
                    <p className="text-sm text-muted-foreground">
                      {calcolaGiorniRimanenti(prestitoAttivo.dataScadenza) > 0
                        ? `Mancano ${calcolaGiorniRimanenti(prestitoAttivo.dataScadenza)} giorni alla scadenza`
                        : "Prestito scaduto - restituire il libro"}
                    </p>
                    <Button
                      variant="link"
                      className="text-blue-600 p-0 h-auto mt-2"
                      onClick={() => router.push("/prestiti")}
                    >
                      Vai ai miei prestiti <ArrowRight className="w-4 h-4 ml-1" />
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Statistiche */}
          <Card className="border-0 shadow-md">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg">
                <Star className="w-5 h-5 text-amber-500" />
                Statistiche
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-3 gap-4 text-center">
                <div className="p-4 bg-muted dark:bg-gray-800 rounded-xl">
                  <Users className="w-6 h-6 text-blue-600 dark:text-blue-400 mx-auto mb-2" />
                  <p className="text-2xl font-bold text-foreground">{libro.prestitiTotali || 0}</p>
                  <p className="text-xs text-muted-foreground">Prestiti totali</p>
                </div>
                <div className="p-4 bg-muted dark:bg-gray-800 rounded-xl">
                  <Star className="w-6 h-6 text-amber-500 mx-auto mb-2" />
                  <p className="text-2xl font-bold text-foreground">4.5</p>
                  <p className="text-xs text-muted-foreground">Valutazione</p>
                </div>
                <div className="p-4 bg-muted dark:bg-gray-800 rounded-xl">
                  <Clock className="w-6 h-6 text-emerald-600 dark:text-emerald-400 mx-auto mb-2" />
                  <p className="text-2xl font-bold text-foreground">14</p>
                  <p className="text-xs text-muted-foreground">Giorni medi</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </main>

      {/* Bottom Action Bar */}
      {!prestitoAttivo && (
        <div className="fixed bottom-0 left-0 right-0 bg-background/95 backdrop-blur border-t border-border p-4 z-50">
          <div className="container mx-auto max-w-4xl flex gap-3">
            <Button
              className={`flex-1 h-14 text-lg font-semibold rounded-xl shadow-lg border-2 ${disponibile
                ? "bg-white text-blue-600 border-blue-100 hover:bg-blue-50"
                : "bg-muted text-muted-foreground cursor-not-allowed border-transparent"
                }`}
              disabled={!disponibile}
              onClick={() => setShowPreparazioneDialog(true)}
              variant="outline"
            >
              {disponibile ? (
                <>
                  <HelpingHand className="w-5 h-5 mr-2" />
                  Preparamelo
                </>
              ) : (
                "Non disponibile"
              )}
            </Button>

            <Button
              className={`flex-[2] h-14 text-lg font-semibold rounded-xl shadow-lg ${disponibile
                ? "bg-blue-600 hover:bg-blue-700 text-white"
                : "bg-muted text-muted-foreground cursor-not-allowed"
                }`}
              disabled={!disponibile}
              onClick={() => setShowRichiediDialog(true)}
            >
              {disponibile ? (
                <>
                  <BookMarked className="w-5 h-5 mr-2" />
                  Prenota Ritiro
                </>
              ) : (
                "Non disponibile"
              )}
            </Button>
          </div>
        </div>
      )}

      {/* Dialog conferma prestito */}
      <Dialog open={showRichiediDialog} onOpenChange={setShowRichiediDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Conferma richiesta prestito</DialogTitle>
            <DialogDescription>Stai richiedendo il prestito di:</DialogDescription>
          </DialogHeader>

          <div className="p-4 bg-gray-50 rounded-xl my-4">
            <h3 className="font-semibold text-gray-900">{libro.titolo}</h3>
            <p className="text-sm text-gray-600">{libro.autore}</p>
            {libro.posizione && (
              <p className="text-sm text-blue-600 mt-2 flex items-center gap-1">
                <MapPin className="w-4 h-4" />
                {libro.posizione}
              </p>
            )}
          </div>

          <div className="text-sm text-gray-600 space-y-2">
            <p>📍 Ritira il libro al banco prestiti entro 24 ore</p>
            <p>📅 Durata prestito: 30 giorni</p>
            <p>🔄 Possibilità di rinnovo: 2 volte</p>
          </div>

          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="outline" onClick={() => setShowRichiediDialog(false)}>
              Annulla
            </Button>
            <Button
              onClick={handleRichiediPrestito}
              disabled={richiediLoading}
              className="bg-blue-600 hover:bg-blue-700"
            >
              {richiediLoading ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" /> Richiesta...
                </>
              ) : (
                "Conferma Prestito"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog Preparazione (Click & Collect) */}
      <Dialog open={showPreparazioneDialog} onOpenChange={setShowPreparazioneDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <HelpingHand className="h-5 w-5 text-blue-600" />
              Richiedi Preparazione
            </DialogTitle>
            <DialogDescription>
              Un bibliotecario preleverà il libro per te. Utile se il libro è in alto o difficile da raggiungere.
            </DialogDescription>
          </DialogHeader>

          <div className="p-4 bg-amber-50 rounded-xl my-4 border border-amber-100">
            <h3 className="font-semibold text-gray-900 mb-1">Nota per il bibliotecario</h3>
            <p className="text-sm text-gray-600">
              "Vorrei trovare questo libro già pronto al banco prestiti per favore."
            </p>
          </div>

          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="outline" onClick={() => setShowPreparazioneDialog(false)}>
              Annulla
            </Button>
            <Button
              onClick={handleRichiestaPreparazione}
              disabled={preparazioneLoading}
              className="bg-amber-600 hover:bg-amber-700 text-white"
            >
              {preparazioneLoading ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" /> Invio richiesta...
                </>
              ) : (
                <>
                  <PackageCheck className="w-4 h-4 mr-2" /> Conferma Richiesta
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
