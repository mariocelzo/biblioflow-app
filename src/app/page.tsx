"use client";

import { useState, useEffect } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Header } from "@/components/layout/header";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { QRCodeCheckIn } from "@/components/qrcode-checkin";
import { 
  Calendar, 
  BookOpen, 
  User, 
  CheckCircle,
  TrendingUp,
  Home,
  Map,
  Settings,
  ChevronRight,
  MapPin,
  Clock,
  QrCode,
  Navigation,
  Star,
  Sparkles,
  ArrowRight,
  X,
  Loader2
} from "lucide-react";

interface StatsBiblioteca {
  postiDisponibili: number;
  prenotazioniAttive: number;
  percentualeOccupazione: number;
  utentiOnline: number;
}

interface PrenotazioneAttiva {
  id: string;
  posto: {
    numero: string;
    sala: string;
    piano: number;
    caratteristiche: string[];
  };
  dataInizio: string;
  dataFine: string;
  stato: 'CONFERMATA' | 'CHECKIN' | 'COMPLETATA';
  checkInEntro?: string;
}

export default function HomePage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [showQRCheckIn, setShowQRCheckIn] = useState(false);
  const [cancellando, setCancellando] = useState(false);
  const [prenotazioneAttiva, setPrenotazioneAttiva] = useState<PrenotazioneAttiva | null>(null);
  const [stats, setStats] = useState<StatsBiblioteca>({
    postiDisponibili: 0,
    prenotazioniAttive: 0,
    percentualeOccupazione: 0,
    utentiOnline: 0
  });
  
  const isAuthenticated = status === "authenticated";
  const userName = session?.user?.nome || "Ospite";

  // Carica prenotazione attiva dell'utente
  useEffect(() => {
    if (!isAuthenticated || !session?.user?.id) return;
    
    const fetchPrenotazioneAttiva = async () => {
      try {
        console.log('[HOME] Caricamento prenotazioni per utente:', session.user.id);
        const res = await fetch(`/api/prenotazioni?userId=${session.user.id}`);
        if (res.ok) {
          const response = await res.json();
          console.log('[HOME] Prenotazioni ricevute:', response.data?.length || 0);
          
          // Trova la prenotazione attiva più vicina (CONFERMATA o CHECK_IN) per oggi o futuro
          const prenotazioni = response.data || [];
          
          interface PrenotazioneAPI {
            id: string;
            data: string;
            stato: string;
            oraInizio: string;
            oraFine: string;
            posto: {
              numero: string;
              haPresaElettrica: boolean;
              haFinestra: boolean;
              isAccessibile: boolean;
              sala?: {
                nome: string;
                piano: number;
              };
            };
          }
          
          const prenotazioneOggi = prenotazioni.find((p: PrenotazioneAPI) => {
            const dataPrenotazione = new Date(p.data);
            const oggi = new Date();
            oggi.setHours(0, 0, 0, 0);
            dataPrenotazione.setHours(0, 0, 0, 0);
            
            return (
              (p.stato === 'CONFERMATA' || p.stato === 'CHECK_IN') &&
              dataPrenotazione >= oggi
            );
          });
          
          if (prenotazioneOggi) {
            // Costruisci l'oggetto prenotazione per il display
            const oraInizio = new Date(prenotazioneOggi.oraInizio);
            const oraFine = new Date(prenotazioneOggi.oraFine);
            const data = new Date(prenotazioneOggi.data);
            
            // Combina data + ora per creare DateTime completi
            const dataInizio = new Date(data);
            dataInizio.setHours(oraInizio.getUTCHours(), oraInizio.getUTCMinutes(), 0, 0);
            
            const dataFine = new Date(data);
            dataFine.setHours(oraFine.getUTCHours(), oraFine.getUTCMinutes(), 0, 0);
            
            const caratteristiche = [];
            if (prenotazioneOggi.posto.haPresaElettrica) caratteristiche.push("Presa elettrica");
            if (prenotazioneOggi.posto.haFinestra) caratteristiche.push("Vicino finestra");
            if (prenotazioneOggi.posto.isAccessibile) caratteristiche.push("Accessibile");
            
            setPrenotazioneAttiva({
              id: prenotazioneOggi.id,
              posto: {
                numero: prenotazioneOggi.posto.numero,
                sala: prenotazioneOggi.posto.sala?.nome || "Sala",
                piano: prenotazioneOggi.posto.sala?.piano || 0,
                caratteristiche
              },
              dataInizio: dataInizio.toISOString(),
              dataFine: dataFine.toISOString(),
              stato: prenotazioneOggi.stato === 'CHECK_IN' ? 'CHECKIN' : 'CONFERMATA',
              checkInEntro: prenotazioneOggi.stato === 'CONFERMATA' 
                ? new Date(dataInizio.getTime() + 15 * 60 * 1000).toISOString() 
                : undefined
            });
          } else {
            setPrenotazioneAttiva(null);
          }
          
          // Aggiorna stats
          setStats(prev => ({
            ...prev,
            prenotazioniAttive: prenotazioni.filter((p: PrenotazioneAPI) => 
              p.stato === 'CONFERMATA' || p.stato === 'CHECK_IN'
            ).length
          }));
        }
      } catch (error) {
        console.error("Errore caricamento prenotazione:", error);
      }
    };
    
    fetchPrenotazioneAttiva();
  }, [isAuthenticated, session?.user?.id]);

  const [timeRemaining, setTimeRemaining] = useState<string>("");
  const [isLoading, setIsLoading] = useState(true);

  // Countdown timer
  useEffect(() => {
    if (!prenotazioneAttiva) return;

    const updateCountdown = () => {
      const now = new Date();
      const end = new Date(prenotazioneAttiva.dataFine);
      const diff = end.getTime() - now.getTime();

      if (diff <= 0) {
        setTimeRemaining("Scaduta");
        return;
      }

      const hours = Math.floor(diff / (1000 * 60 * 60));
      const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
      
      setTimeRemaining(`${hours}h ${minutes}m`);
    };

    updateCountdown();
    const interval = setInterval(updateCountdown, 60000); // Aggiorna ogni minuto

    return () => clearInterval(interval);
  }, [prenotazioneAttiva]);

  useEffect(() => {
    const timer = setTimeout(() => setIsLoading(false), 800);
    return () => clearTimeout(timer);
  }, []);

  const handleCancellaPrenotazione = async () => {
    if (!prenotazioneAttiva || !session?.user?.id) return;
    
    setCancellando(true);
    try {
      const res = await fetch(`/api/prenotazioni/${prenotazioneAttiva.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ azione: "cancella" }),
      });

      if (res.ok) {
        toast.success("Prenotazione cancellata con successo");
        // Rimuovi la prenotazione dalla vista
        setPrenotazioneAttiva(null);
        setStats(prev => ({
          ...prev,
          prenotazioniAttive: Math.max(0, prev.prenotazioniAttive - 1)
        }));
      } else {
        const error = await res.json();
        toast.error(error.error || "Errore durante la cancellazione");
      }
    } catch (error) {
      console.error("Errore cancellazione:", error);
      toast.error("Errore di connessione");
    } finally {
      setCancellando(false);
    }
  };

  const getGreeting = () => {
    const hour = new Date().getHours();
    if (hour < 12) return "Buongiorno";
    if (hour < 18) return "Buon pomeriggio";
    return "Buonasera";
  };

  const quickActions = [
    {
      id: 'prenota',
      title: 'Prenota Posto',
      description: `${stats.postiDisponibili} disponibili`,
      icon: Calendar,
      color: 'bg-gradient-to-br from-blue-500 to-blue-600',
      path: '/prenota'
    },
    {
      id: 'prenotazioni',
      title: 'Prenotazioni',
      description: `${stats.prenotazioniAttive} attiva${stats.prenotazioniAttive !== 1 ? 'e' : ''}`,
      icon: CheckCircle,
      color: 'bg-gradient-to-br from-green-500 to-green-600',
      path: '/prenotazioni'
    },
    {
      id: 'libri',
      title: 'Catalogo Libri',
      description: 'Esplora il catalogo',
      icon: BookOpen,
      color: 'bg-gradient-to-br from-amber-500 to-orange-500',
      path: '/libri'
    },
    {
      id: 'profilo',
      title: 'Profilo',
      description: 'Impostazioni',
      icon: User,
      color: 'bg-gradient-to-br from-slate-500 to-slate-600',
      path: '/profilo'
    }
  ];

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-background to-primary/5">
      <Header />

      <main className="container mx-auto px-4 py-8 pb-24 max-w-6xl">
        {/* Hero Section con saluto */}
        <section className="mb-8">
          {isLoading ? (
            <div className="space-y-3">
              <Skeleton className="h-10 w-64" />
              <Skeleton className="h-6 w-96" />
            </div>
          ) : (
            <div className="space-y-2 animate-in fade-in slide-in-from-bottom-4 duration-700">
              <h1 className="text-4xl md:text-5xl font-bold tracking-tight text-foreground">
                {isAuthenticated ? (
                  <>
                    {getGreeting()}, <span className="text-primary">{userName}</span>
                  </>
                ) : (
                  "Benvenuto in BiblioFlow"
                )}
              </h1>
              <p className="text-lg text-muted-foreground">
                {isAuthenticated 
                  ? "Gestisci le tue prenotazioni e scopri i servizi della biblioteca"
                  : "Accedi per prenotare posti studio e molto altro"
                }
              </p>
            </div>
          )}
        </section>

        {/* Card Prenotazione Attiva */}
        {prenotazioneAttiva && (
          <section className="mb-8">
            <Card className="border-0 shadow-xl bg-gradient-to-br from-blue-500 to-blue-600 text-white overflow-hidden">
              <CardContent className="p-4 sm:p-6">
                <div className="flex flex-col sm:flex-row items-start justify-between gap-4 mb-4">
                  <div className="space-y-1 flex-1">
                    <Badge className="bg-white/20 text-white border-0 mb-2">
                      Prenotazione Attiva
                    </Badge>
                    <h3 className="text-xl sm:text-2xl font-bold">Posto {prenotazioneAttiva.posto.numero}</h3>
                    <p className="text-blue-100 flex items-center gap-2 text-sm sm:text-base">
                      <MapPin className="h-4 w-4 flex-shrink-0" />
                      <span className="truncate">{prenotazioneAttiva.posto.sala} - Piano {prenotazioneAttiva.posto.piano}</span>
                    </p>
                  </div>
                  <div className="text-left sm:text-right">
                    <div className="text-2xl sm:text-3xl font-bold">{timeRemaining}</div>
                    <p className="text-blue-100 text-sm">rimanenti</p>
                  </div>
                </div>

                {/* Caratteristiche posto */}
                <div className="flex gap-2 mb-4 flex-wrap">
                  {prenotazioneAttiva.posto.caratteristiche.map((car, idx) => (
                    <Badge key={idx} variant="secondary" className="bg-white/10 text-white border-0 text-xs">
                      {car}
                    </Badge>
                  ))}
                </div>

                {/* Azioni */}
                <div className="grid grid-cols-2 gap-2 sm:gap-3 mb-2 sm:mb-3">
                  <Button
                    variant="secondary"
                    className="bg-white/20 hover:bg-white/30 text-white border-0 h-11"
                    onClick={() => setShowQRCheckIn(true)}
                  >
                    <QrCode className="h-4 w-4 mr-2" />
                    <span className="text-sm">Check-in</span>
                  </Button>
                  <Button
                    variant="secondary"
                    className="bg-white/20 hover:bg-white/30 text-white border-0 h-11"
                    onClick={() => router.push('/prenota?percorso=true')}
                  >
                    <Navigation className="h-4 w-4 mr-2" />
                    <span className="text-sm">Percorso</span>
                  </Button>
                </div>
                <div className="grid grid-cols-2 gap-2 sm:gap-3">
                  <Button
                    variant="secondary"
                    className="bg-white/20 hover:bg-white/30 text-white border-0 h-11"
                    onClick={() => router.push('/prenotazioni')}
                  >
                    <Clock className="h-4 w-4 mr-2" />
                    <span className="text-sm">Dettagli</span>
                  </Button>
                  <Button
                    variant="destructive"
                    className="bg-red-500/20 hover:bg-red-500/30 text-white border-0 h-11"
                    onClick={handleCancellaPrenotazione}
                    disabled={cancellando}
                  >
                    {cancellando ? (
                      <>
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                        Cancellando...
                      </>
                    ) : (
                      <>
                        <X className="h-4 w-4 mr-2" />
                        Cancella
                      </>
                    )}
                  </Button>
                </div>

                {/* Alert Check-in */}
                {prenotazioneAttiva.checkInEntro && prenotazioneAttiva.stato === 'CONFERMATA' && (
                  <div className="mt-4 p-3 bg-white/10 rounded-lg flex items-center gap-2 text-sm">
                    <Clock className="h-4 w-4 flex-shrink-0" />
                    <p>Ricordati di fare il check-in entro {new Date(prenotazioneAttiva.checkInEntro).toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' })}</p>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Dialog QR Code Check-in */}
            {prenotazioneAttiva && prenotazioneAttiva.checkInEntro && (
              <QRCodeCheckIn
                open={showQRCheckIn}
                onOpenChange={setShowQRCheckIn}
                prenotazioneId={prenotazioneAttiva.id}
                posto={{
                  numero: prenotazioneAttiva.posto.numero,
                  sala: prenotazioneAttiva.posto.sala,
                  piano: prenotazioneAttiva.posto.piano,
                }}
                checkInEntro={new Date(prenotazioneAttiva.checkInEntro)}
              />
            )}
          </section>
        )}

        {/* Quick Actions Grid */}
        <section className="mb-10">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {quickActions.map((action, index) => (
              <Card 
                key={action.id}
                className="
                  group relative overflow-hidden cursor-pointer
                  border-0 shadow-lg hover:shadow-xl
                  transition-all duration-300 ease-out
                  hover:-translate-y-1
                  animate-in fade-in slide-in-from-bottom-8
                "
                style={{ animationDelay: `${index * 100}ms` }}
                onClick={() => router.push(action.path)}
              >
                <CardHeader className="pb-4">
                  <div className={`
                    w-14 h-14 rounded-2xl ${action.color}
                    flex items-center justify-center mb-4
                    shadow-lg
                    transition-transform duration-300
                    group-hover:scale-110 group-hover:rotate-3
                  `}>
                    <action.icon className="h-7 w-7 text-white" strokeWidth={2.5} />
                  </div>
                  <CardTitle className="text-xl font-semibold text-foreground">
                    {action.title}
                  </CardTitle>
                  <CardDescription className="text-muted-foreground text-base">
                    {action.description}
                  </CardDescription>
                </CardHeader>
                <ChevronRight className="
                  absolute bottom-4 right-4 h-5 w-5 text-muted-foreground
                  transition-all duration-300
                  group-hover:translate-x-1 group-hover:text-primary
                " />
              </Card>
            ))}
          </div>
        </section>

        {/* Statistiche Biblioteca */}
        <section className="space-y-4">
          <h2 className="text-2xl font-semibold text-foreground mb-6">
            Stato Biblioteca in Tempo Reale
          </h2>
          
          {/* Stats Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 mb-6">
            <Card className="border-0 shadow-md hover:shadow-lg transition-all duration-300">
              <CardContent className="pt-6">
                <div className="flex items-start justify-between">
                  <div className="space-y-1">
                    <p className="text-sm font-medium text-muted-foreground">Posti Disponibili</p>
                    <p className="text-4xl font-bold text-green-600 dark:text-green-400">{stats.postiDisponibili}</p>
                    <p className="text-xs text-muted-foreground">su 150 totali</p>
                  </div>
                  <div className="w-12 h-12 bg-green-100 dark:bg-green-900/30 rounded-xl flex items-center justify-center">
                    <CheckCircle className="h-6 w-6 text-green-600 dark:text-green-400" />
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="border-0 shadow-md hover:shadow-lg transition-all duration-300">
              <CardContent className="pt-6">
                <div className="flex items-start justify-between">
                  <div className="space-y-1">
                    <p className="text-sm font-medium text-muted-foreground">Utenti Attivi</p>
                    <p className="text-4xl font-bold text-primary">{stats.utentiOnline}</p>
                    <p className="text-xs text-muted-foreground">in questo momento</p>
                  </div>
                  <div className="w-12 h-12 bg-primary/10 rounded-xl flex items-center justify-center">
                    <TrendingUp className="h-6 w-6 text-primary" />
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="border-0 shadow-md hover:shadow-lg transition-all duration-300 sm:col-span-2 lg:col-span-1">
              <CardContent className="pt-6">
                <div className="flex items-start justify-between">
                  <div className="space-y-1">
                    <p className="text-sm font-medium text-muted-foreground">Le Tue Prenotazioni</p>
                    <p className="text-4xl font-bold text-purple-600 dark:text-purple-400">{stats.prenotazioniAttive}</p>
                    <p className="text-xs text-muted-foreground">attiva ora</p>
                  </div>
                  <div className="w-12 h-12 bg-purple-100 dark:bg-purple-900/30 rounded-xl flex items-center justify-center">
                    <Calendar className="h-6 w-6 text-purple-600 dark:text-purple-400" />
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Grafico Occupazione - Card Principale */}
          <Card className="border-0 shadow-lg">
            <CardContent className="pt-8 pb-8">
              <div className="flex flex-col lg:flex-row items-center justify-between gap-8">
                <div className="flex-1 space-y-4 text-center lg:text-left">
                  <div>
                    <p className="text-sm font-medium text-muted-foreground mb-2">Occupazione Totale</p>
                    <div className="flex items-baseline gap-2 justify-center lg:justify-start">
                      <p className="text-6xl font-bold text-primary">
                        {stats.percentualeOccupazione}
                      </p>
                      <span className="text-3xl font-semibold text-muted-foreground">%</span>
                    </div>
                    <p className="text-sm text-muted-foreground mt-2">
                      {stats.percentualeOccupazione > 80 ? '🔴 Molto occupata' : 
                       stats.percentualeOccupazione > 50 ? '🟡 Moderatamente occupata' : 
                       '🟢 Poco occupata'}
                    </p>
                  </div>

                  {/* Progress Bar */}
                  <div className="w-full max-w-md mx-auto lg:mx-0">
                    <div className="h-3 bg-secondary rounded-full overflow-hidden">
                      <div 
                        className="h-full bg-gradient-to-r from-primary to-primary/80 rounded-full transition-all duration-1000 ease-out"
                        style={{ width: `${stats.percentualeOccupazione}%` }}
                      />
                    </div>
                    <div className="flex justify-between text-xs text-muted-foreground mt-2">
                      <span>0%</span>
                      <span>100%</span>
                    </div>
                  </div>
                </div>

                {/* Circular Chart */}
                <div className="relative">
                  <svg className="w-40 h-40 lg:w-48 lg:h-48 transform -rotate-90">
                    <circle
                      cx="96"
                      cy="96"
                      r="80"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="12"
                      className="text-secondary"
                    />
                    <circle
                      cx="96"
                      cy="96"
                      r="80"
                      fill="none"
                      stroke="url(#gradient)"
                      strokeWidth="12"
                      strokeDasharray={`${stats.percentualeOccupazione * 5.03} 503`}
                      strokeLinecap="round"
                      className="transition-all duration-1000 ease-out"
                    />
                    <defs>
                      <linearGradient id="gradient" x1="0%" y1="0%" x2="100%" y2="100%">
                        <stop offset="0%" stopColor="hsl(var(--primary))" />
                        <stop offset="100%" stopColor="hsl(var(--primary))" stopOpacity="0.8" />
                      </linearGradient>
                    </defs>
                  </svg>
                  <div className="absolute inset-0 flex items-center justify-center">
                    <div className="text-center">
                      <p className="text-3xl font-bold text-primary">
                        {stats.percentualeOccupazione}%
                      </p>
                      <p className="text-xs text-muted-foreground">occupati</p>
                    </div>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </section>

        {/* Sezione Potrebbe Interessarti - Solo per utenti autenticati */}
        {isAuthenticated && (
          <section className="space-y-6 mb-8">
            <div className="flex items-center justify-between">
              <h2 className="text-2xl font-semibold text-foreground flex items-center gap-2">
                <Sparkles className="h-6 w-6 text-amber-500" />
                Potrebbe Interessarti
              </h2>
            </div>

            {/* Libri Consigliati */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-medium text-foreground flex items-center gap-2">
                  <BookOpen className="h-5 w-5 text-primary" />
                  Libri Consigliati
                </h3>
                <Button 
                  variant="ghost" 
                  size="sm" 
                  className="text-primary"
                  onClick={() => router.push('/libri')}
                >
                  Vedi tutti
                  <ArrowRight className="h-4 w-4 ml-1" />
                </Button>
              </div>
              
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {[
                  { id: '1', titolo: 'Clean Code', autore: 'Robert C. Martin', categoria: 'Informatica', disponibile: true },
                  { id: '2', titolo: 'Design Patterns', autore: 'Gang of Four', categoria: 'Informatica', disponibile: true },
                  { id: '3', titolo: 'The Pragmatic Programmer', autore: 'David Thomas', categoria: 'Informatica', disponibile: false },
                ].map((libro) => (
                  <Card 
                    key={libro.id}
                    className="cursor-pointer hover:shadow-lg transition-all duration-300 hover:-translate-y-1 border-0 shadow-md"
                    onClick={() => router.push(`/libri/${libro.id}`)}
                  >
                    <CardContent className="p-4">
                      <div className="flex items-start gap-3">
                        <div className="w-12 h-16 bg-gradient-to-br from-primary/20 to-primary/5 rounded-lg flex items-center justify-center flex-shrink-0">
                          <BookOpen className="h-6 w-6 text-primary" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <h4 className="font-semibold text-foreground truncate">{libro.titolo}</h4>
                          <p className="text-sm text-muted-foreground truncate">{libro.autore}</p>
                          <div className="flex items-center gap-2 mt-2">
                            <Badge variant="secondary" className="text-xs">
                              {libro.categoria}
                            </Badge>
                            <Badge 
                              variant={libro.disponibile ? "default" : "destructive"} 
                              className={`text-xs ${libro.disponibile ? 'bg-green-500' : ''}`}
                            >
                              {libro.disponibile ? 'Disponibile' : 'In prestito'}
                            </Badge>
                          </div>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </div>

            {/* Posti Preferiti */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-medium text-foreground flex items-center gap-2">
                  <Star className="h-5 w-5 text-amber-500" />
                  I Tuoi Posti Preferiti
                </h3>
                <Button 
                  variant="ghost" 
                  size="sm" 
                  className="text-primary"
                  onClick={() => router.push('/prenota')}
                >
                  Prenota ora
                  <ArrowRight className="h-4 w-4 ml-1" />
                </Button>
              </div>
              
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {[
                  { id: '1', numero: 'A12', sala: 'Sala Studio Silenziosa', piano: 2, caratteristiche: ['Presa elettrica', 'Vicino finestra'], disponibile: true },
                  { id: '2', numero: 'B05', sala: 'Sala Gruppi', piano: 1, caratteristiche: ['Tavolo grande', 'Lavagna'], disponibile: false },
                  { id: '3', numero: 'C18', sala: 'Sala Lettura', piano: 1, caratteristiche: ['Silenzioso', 'Buona luce'], disponibile: true },
                ].map((posto) => (
                  <Card 
                    key={posto.id}
                    className={`cursor-pointer transition-all duration-300 hover:-translate-y-1 border-0 shadow-md ${
                      posto.disponibile ? 'hover:shadow-lg' : 'opacity-60'
                    }`}
                    onClick={() => posto.disponibile && router.push(`/prenota?sala=${encodeURIComponent(posto.sala)}`)}
                  >
                    <CardContent className="p-4">
                      <div className="flex items-start justify-between">
                        <div>
                          <div className="flex items-center gap-2 mb-1">
                            <span className="text-xl font-bold text-foreground">{posto.numero}</span>
                            <Badge 
                              variant={posto.disponibile ? "default" : "secondary"} 
                              className={`text-xs ${posto.disponibile ? 'bg-green-500' : ''}`}
                            >
                              {posto.disponibile ? 'Libero' : 'Occupato'}
                            </Badge>
                          </div>
                          <p className="text-sm text-muted-foreground flex items-center gap-1">
                            <MapPin className="h-3 w-3" />
                            {posto.sala} - Piano {posto.piano}
                          </p>
                        </div>
                        <Star className="h-5 w-5 text-amber-500 fill-amber-500" />
                      </div>
                      <div className="flex gap-1 mt-3 flex-wrap">
                        {posto.caratteristiche.map((car, idx) => (
                          <Badge key={idx} variant="outline" className="text-xs">
                            {car}
                          </Badge>
                        ))}
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </div>
          </section>
        )}
      </main>

      {/* Bottom Navigation Apple-style */}
      <nav className="fixed bottom-0 left-0 right-0 bg-background/80 backdrop-blur-xl border-t border-border py-2 px-4 shadow-lg">
        <div className="container mx-auto flex justify-around max-w-md">
          <NavItem 
            icon={<Home className="h-5 w-5" />} 
            label="Home" 
            active 
            onClick={() => router.push('/')}
          />
          <NavItem 
            icon={<Map className="h-5 w-5" />} 
            label="Mappa" 
            onClick={() => router.push('/prenota')}
          />
          <NavItem 
            icon={<BookOpen className="h-5 w-5" />} 
            label="Libri" 
            onClick={() => router.push('/libri')}
          />
          <NavItem 
            icon={<Settings className="h-5 w-5" />} 
            label="Profilo" 
            onClick={() => router.push('/profilo')}
          />
        </div>
      </nav>
    </div>
  );
}

function NavItem({ 
  icon, 
  label, 
  active = false, 
  onClick 
}: { 
  icon: React.ReactNode; 
  label: string; 
  active?: boolean; 
  onClick?: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`
        flex flex-col items-center gap-1 px-4 py-2 rounded-xl
        transition-all duration-200 ease-out
        ${active 
          ? "text-primary bg-primary/10 scale-105" 
          : "text-muted-foreground hover:bg-secondary hover:text-foreground"
        }
      `}
    >
      {icon}
      <span className="text-[10px] font-medium tracking-tight">{label}</span>
    </button>
  );
}
