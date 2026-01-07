// ============================================
// PAGINA PROFILO - BiblioFlow
// ============================================
// Design basato sui principi HCI:
// - Inclusività by design (opzioni accessibilità)
// - Flessibilità adattiva (profilo pendolare)
// - Controllo utente (modifica preferenze)

"use client";

import { useState, useEffect } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { Header } from "@/components/layout/header";
import { BackButton } from "@/components/ui/back-button";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import {
  User,
  Mail,
  GraduationCap,
  Train,
  Accessibility,
  Bell,
  Save,
  Loader2,
  Shield,
  Eye,
  BookOpen,
  Calendar,
  Clock,
  BarChart3,
  Moon,
  Zap,
} from "lucide-react";

interface UserProfile {
  nome: string;
  cognome: string;
  email: string;
  matricola: string | null;
  ruolo: string;
  isPendolare: boolean;
  tragittoPendolare: string | null;
  necessitaAccessibilita: boolean;
  preferenzeAccessibilita: string | null;
  altoContrasto: boolean;
  notifichePush: boolean;
  notificheEmail: boolean;
}

export default function ProfiloPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  
  // Form state
  const [isPendolare, setIsPendolare] = useState(false);
  const [tragitto, setTragitto] = useState("");
  const [necessitaAccessibilita, setNecessitaAccessibilita] = useState(false);
  const [preferenzeAccessibilita, setPreferenzeAccessibilita] = useState("");
  const [altoContrasto, setAltoContrasto] = useState(false);
  const [darkMode, setDarkMode] = useState(false);
  const [riduzioneMovimento, setRiduzioneMovimento] = useState(false);
  const [notifichePush, setNotifichePush] = useState(true);
  const [notificheEmail, setNotificheEmail] = useState(true);
  
  // Statistiche
  const [statistiche, setStatistiche] = useState({
    prenotazioniTotali: 0,
    prestitiTotali: 0,
    oreTotaliStudio: 0,
    salaPreferita: "",
  });

  // Redirect se non autenticato
  useEffect(() => {
    if (status === "unauthenticated") {
      router.push("/login?callbackUrl=/profilo");
    }
  }, [status, router]);

  // Carica profilo dall'API
  useEffect(() => {
    console.log("[PROFILO] useEffect triggered, session:", session?.user?.id);
    
    if (session?.user) {
      const loadProfile = async () => {
        try {
          console.log("[PROFILO] Inizio caricamento...");
          const response = await fetch("/api/profilo");
          console.log("[PROFILO] Response status:", response.status);
          
          if (response.ok) {
            const data = await response.json();
            
            console.log("[PROFILO] Dati caricati:", data);
            
            setProfile(data);
            
            // Popola form
            setIsPendolare(data.isPendolare || false);
            setTragitto(data.tragittoPendolare || "");
            setNecessitaAccessibilita(data.necessitaAccessibilita || false);
            setPreferenzeAccessibilita(data.preferenzeAccessibilita || "");
            setAltoContrasto(data.altoContrasto || false);
            setDarkMode(data.darkMode || false);
            setRiduzioneMovimento(data.riduzioneMovimento || false);
            setNotifichePush(data.notifichePush ?? true);
            setNotificheEmail(data.notificheEmail ?? true);
          } else {
            const errorData = await response.json().catch(() => ({ error: 'Unknown error' }));
            console.error("[PROFILO] Errore API:", response.status, errorData);
            toast.error(`Errore nel caricamento: ${errorData.error || response.status}`);
          }
        } catch (error) {
          console.error("[PROFILO] Errore caricamento completo:", error);
          toast.error("Errore di connessione");
        } finally {
          setLoading(false);
        }
      };

      loadProfile();
      
      // Fetch statistiche utente
      if (session.user.id) {
        fetchStatistiche(session.user.id);
      }
    }
  }, [session]);

  // Fetch statistiche
  const fetchStatistiche = async (userId: string) => {
    try {
      // Fetch prenotazioni
      const prenotazioniRes = await fetch(`/api/prenotazioni?userId=${userId}`);
      const prenotazioniData = prenotazioniRes.ok ? await prenotazioniRes.json() : { data: [] };
      
      // Fetch prestiti  
      const prestitiRes = await fetch(`/api/prestiti?userId=${userId}`);
      const prestitiData = prestitiRes.ok ? await prestitiRes.json() : { data: [] };
      
      // Calcola ore studio (stima: 4h per prenotazione completata)
      const prenotazioniCompletate = (prenotazioniData.data || []).filter(
        (p: { stato: string }) => p.stato === "COMPLETATA"
      ).length;
      
      // Trova sala più frequentata
      const saleCount: Record<string, number> = {};
      (prenotazioniData.data || []).forEach((p: { posto?: { sala?: { nome: string } } }) => {
        const salaNome = p.posto?.sala?.nome;
        if (salaNome) {
          saleCount[salaNome] = (saleCount[salaNome] || 0) + 1;
        }
      });
      const salaPreferita = Object.entries(saleCount).sort((a, b) => b[1] - a[1])[0]?.[0] || "";
      
      setStatistiche({
        prenotazioniTotali: (prenotazioniData.data || []).length,
        prestitiTotali: (prestitiData.data || []).length,
        oreTotaliStudio: prenotazioniCompletate * 4,
        salaPreferita,
      });
    } catch (error) {
      console.error("Errore fetch statistiche:", error);
    }
  };

  // Salva modifiche
  const handleSave = async () => {
    setSaving(true);
    
    try {
      const payload = {
        isPendolare,
        tragittoPendolare: tragitto || null,
        necessitaAccessibilita,
        preferenzeAccessibilita: preferenzeAccessibilita || null,
        altoContrasto,
        darkMode,
        riduzioneMovimento,
        dimensioneTesto: 16, // Default, può essere personalizzato in futuro
        notifichePush,
        notificheEmail,
      };
      
      console.log("[PROFILO] Invio dati:", payload);
      
      const response = await fetch('/api/profilo', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      
      console.log("[PROFILO] Response status:", response.status);
      
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: 'Unknown error' }));
        console.error("[PROFILO] Errore API:", errorData);
        throw new Error(errorData.error || 'Salvataggio fallito');
      }
      
      const updatedUser = await response.json();
      console.log("[PROFILO] Profilo aggiornato:", updatedUser);
      
      toast.success("Profilo aggiornato! ✅");
      
      // Aggiorna stato locale
      setProfile(prev => prev ? { ...prev, ...updatedUser } : null);
      
      // Ricarica per applicare le modifiche di accessibilità
      setTimeout(() => {
        window.location.reload();
      }, 1000);
      
    } catch (error) {
      console.error("[PROFILO] Errore salvataggio:", error);
      toast.error(error instanceof Error ? error.message : "Errore nel salvataggio");
    } finally {
      setSaving(false);
    }
  };

  // Ottieni badge ruolo
  const getRuoloBadge = (ruolo: string) => {
    switch (ruolo) {
      case "ADMIN":
        return <Badge className="bg-red-500">Amministratore</Badge>;
      case "BIBLIOTECARIO":
        return <Badge className="bg-purple-500">Bibliotecario</Badge>;
      case "DOCENTE":
        return <Badge className="bg-blue-500">Docente</Badge>;
      default:
        return <Badge variant="secondary">Studente</Badge>;
    }
  };

  // Loading state
  if (status === "loading" || loading) {
    return (
      <div className="min-h-screen bg-background">
        <Header />
        <main className="container mx-auto px-4 py-6 max-w-2xl">
          <Skeleton className="h-8 w-48 mb-6" />
          <Skeleton className="h-64 mb-4" />
          <Skeleton className="h-48 mb-4" />
          <Skeleton className="h-48" />
        </main>
      </div>
    );
  }

  if (!profile) {
    return null;
  }

  return (
    <div className="min-h-screen bg-background">
      <Header />
      
      <main className="container mx-auto px-4 py-6 max-w-2xl">
        {/* BackButton e Intestazione */}
        <div className="mb-6 space-y-4">
          <BackButton href="/" />
          <div>
            <h1 className="text-3xl font-bold tracking-tight text-foreground">Il Mio Profilo</h1>
            <p className="text-lg text-muted-foreground mt-2">
              Gestisci le tue informazioni e preferenze
            </p>
          </div>
        </div>

        <div className="space-y-6">
          {/* Informazioni personali */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <User className="h-5 w-5" />
                Informazioni Personali
              </CardTitle>
              <CardDescription>
                I tuoi dati di base (non modificabili)
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label className="text-muted-foreground">Nome</Label>
                  <p className="font-medium">{profile.nome}</p>
                </div>
                <div>
                  <Label className="text-muted-foreground">Cognome</Label>
                  <p className="font-medium">{profile.cognome}</p>
                </div>
              </div>
              
              <div className="flex items-center gap-2">
                <Mail className="h-4 w-4 text-muted-foreground" />
                <span>{profile.email}</span>
              </div>
              
              {profile.matricola && (
                <div className="flex items-center gap-2">
                  <GraduationCap className="h-4 w-4 text-muted-foreground" />
                  <span>Matricola: {profile.matricola}</span>
                </div>
              )}
              
              <div className="flex items-center gap-2">
                <Shield className="h-4 w-4 text-muted-foreground" />
                <span>Ruolo:</span>
                {getRuoloBadge(profile.ruolo)}
              </div>
            </CardContent>
          </Card>

          {/* Profilo Pendolare */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Train className="h-5 w-5" />
                Profilo Pendolare
              </CardTitle>
              <CardDescription>
                Opzioni speciali per studenti pendolari
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label htmlFor="pendolare">Sono un pendolare</Label>
                  <p className="text-sm text-muted-foreground">
                    Attiva per ricevere priorità nelle prenotazioni mattutine
                  </p>
                </div>
                <Switch
                  id="pendolare"
                  checked={isPendolare}
                  onCheckedChange={setIsPendolare}
                />
              </div>
              
              {isPendolare && (
                <div className="space-y-2 pt-2">
                  <Label htmlFor="tragitto">Tragitto abituale</Label>
                  <Input
                    id="tragitto"
                    placeholder="es. Avellino - Napoli"
                    value={tragitto}
                    onChange={(e) => setTragitto(e.target.value)}
                  />
                  <p className="text-xs text-muted-foreground">
                    Ci aiuta a suggerirti orari compatibili con i mezzi pubblici
                  </p>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Accessibilità */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Accessibility className="h-5 w-5" />
                Accessibilità
              </CardTitle>
              <CardDescription>
                Personalizza l&apos;esperienza in base alle tue esigenze
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label htmlFor="accessibilita">Necessità di accessibilità</Label>
                  <p className="text-sm text-muted-foreground">
                    Mostra solo posti accessibili nelle ricerche
                  </p>
                </div>
                <Switch
                  id="accessibilita"
                  checked={necessitaAccessibilita}
                  onCheckedChange={setNecessitaAccessibilita}
                />
              </div>
              
              {necessitaAccessibilita && (
                <div className="space-y-2 pt-2">
                  <Label htmlFor="preferenze-accessibilita">Note specifiche</Label>
                  <Input
                    id="preferenze-accessibilita"
                    placeholder="es. Sedia a rotelle, ipovedente..."
                    value={preferenzeAccessibilita}
                    onChange={(e) => setPreferenzeAccessibilita(e.target.value)}
                  />
                </div>
              )}

              <Separator />

              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label htmlFor="alto-contrasto" className="flex items-center gap-2">
                    <Eye className="h-4 w-4" />
                    Alto contrasto
                  </Label>
                  <p className="text-sm text-muted-foreground">
                    Aumenta il contrasto dei colori per una migliore leggibilità
                  </p>
                </div>
                <Switch
                  id="alto-contrasto"
                  checked={altoContrasto}
                  onCheckedChange={setAltoContrasto}
                />
              </div>

              <Separator />

              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label htmlFor="dark-mode" className="flex items-center gap-2">
                    <Moon className="h-4 w-4" />
                    Modalità scura
                  </Label>
                  <p className="text-sm text-muted-foreground">
                    Tema scuro per ridurre l&apos;affaticamento visivo
                  </p>
                </div>
                <Switch
                  id="dark-mode"
                  checked={darkMode}
                  onCheckedChange={setDarkMode}
                />
              </div>

              <Separator />

              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label htmlFor="riduzione-movimento" className="flex items-center gap-2">
                    <Zap className="h-4 w-4" />
                    Riduzione movimento
                  </Label>
                  <p className="text-sm text-muted-foreground">
                    Riduce o elimina le animazioni per utenti sensibili al movimento
                  </p>
                </div>
                <Switch
                  id="riduzione-movimento"
                  checked={riduzioneMovimento}
                  onCheckedChange={setRiduzioneMovimento}
                />
              </div>

              <Separator />

            </CardContent>
          </Card>

          {/* Statistiche */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <BarChart3 className="h-5 w-5" />
                Le Tue Statistiche
              </CardTitle>
              <CardDescription>
                Il tuo utilizzo della biblioteca
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 gap-4">
                <div className="p-4 bg-blue-50 dark:bg-blue-950 rounded-xl text-center">
                  <Calendar className="h-6 w-6 text-blue-600 dark:text-blue-400 mx-auto mb-2" />
                  <p className="text-2xl font-bold text-foreground">{statistiche.prenotazioniTotali}</p>
                  <p className="text-xs text-muted-foreground">Prenotazioni totali</p>
                </div>
                <div className="p-4 bg-purple-50 dark:bg-purple-950 rounded-xl text-center">
                  <BookOpen className="h-6 w-6 text-purple-600 dark:text-purple-400 mx-auto mb-2" />
                  <p className="text-2xl font-bold text-foreground">{statistiche.prestitiTotali}</p>
                  <p className="text-xs text-muted-foreground">Libri presi in prestito</p>
                </div>
                <div className="p-4 bg-green-50 dark:bg-green-950 rounded-xl text-center">
                  <Clock className="h-6 w-6 text-green-600 dark:text-green-400 mx-auto mb-2" />
                  <p className="text-2xl font-bold text-foreground">{statistiche.oreTotaliStudio}</p>
                  <p className="text-xs text-muted-foreground">Ore in biblioteca</p>
                </div>
                <div className="p-4 bg-amber-50 dark:bg-amber-950 rounded-xl text-center">
                  <User className="h-6 w-6 text-amber-600 dark:text-amber-400 mx-auto mb-2" />
                  <p className="text-lg font-bold text-foreground truncate">
                    {statistiche.salaPreferita || "N/A"}
                  </p>
                  <p className="text-xs text-muted-foreground">Sala preferita</p>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Notifiche */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Bell className="h-5 w-5" />
                Notifiche
              </CardTitle>
              <CardDescription>
                Scegli come ricevere gli avvisi
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label htmlFor="notifiche-push">Notifiche push</Label>
                  <p className="text-sm text-muted-foreground">
                    Ricevi notifiche sul dispositivo
                  </p>
                </div>
                <Switch
                  id="notifiche-push"
                  checked={notifichePush}
                  onCheckedChange={setNotifichePush}
                />
              </div>

              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label htmlFor="notifiche-email">Notifiche email</Label>
                  <p className="text-sm text-muted-foreground">
                    Ricevi promemoria via email
                  </p>
                </div>
                <Switch
                  id="notifiche-email"
                  checked={notificheEmail}
                  onCheckedChange={setNotificheEmail}
                />
              </div>
            </CardContent>
          </Card>

          {/* Pulsante salva */}
          <Button
            className="w-full h-12"
            onClick={handleSave}
            disabled={saving}
          >
            {saving ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Salvataggio...
              </>
            ) : (
              <>
                <Save className="mr-2 h-4 w-4" />
                Salva Modifiche
              </>
            )}
          </Button>
        </div>
      </main>
    </div>
  );
}
