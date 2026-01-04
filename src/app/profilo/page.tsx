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

  // Carica profilo (simulato - in produzione userebbe API)
  useEffect(() => {
    if (session?.user) {
      // Simula caricamento profilo
      const mockProfile: UserProfile = {
        nome: session.user.nome || "",
        cognome: session.user.cognome || "",
        email: session.user.email || "",
        matricola: session.user.matricola || null,
        ruolo: session.user.ruolo || "STUDENTE",
        isPendolare: session.user.isPendolare || false,
        tragittoPendolare: null,
        necessitaAccessibilita: session.user.necessitaAccessibilita || false,
        preferenzeAccessibilita: null,
        altoContrasto: false,
        notifichePush: true,
        notificheEmail: true,
      };
      
      setProfile(mockProfile);
      setIsPendolare(mockProfile.isPendolare);
      setNecessitaAccessibilita(mockProfile.necessitaAccessibilita);
      setAltoContrasto(mockProfile.altoContrasto);
      setNotifichePush(mockProfile.notifichePush);
      setNotificheEmail(mockProfile.notificheEmail);
      setLoading(false);
      
      // Fetch statistiche utente
      fetchStatistiche(session.user.id);
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
      // Simula salvataggio (in produzione chiamerebbe API)
      await new Promise((resolve) => setTimeout(resolve, 1000));
      
      toast.success("Profilo aggiornato! ✅");
      
      // Aggiorna stato locale
      if (profile) {
        setProfile({
          ...profile,
          isPendolare,
          tragittoPendolare: tragitto || null,
          necessitaAccessibilita,
          preferenzeAccessibilita: preferenzeAccessibilita || null,
          altoContrasto,
          notifichePush,
          notificheEmail,
        });
      }
    } catch (error) {
      console.error("Errore salvataggio:", error);
      toast.error("Errore nel salvataggio");
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
            <h1 className="text-3xl font-bold tracking-tight text-slate-900">Il Mio Profilo</h1>
            <p className="text-lg text-slate-600 mt-2">
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
                <div className="p-4 bg-blue-50 rounded-xl text-center">
                  <Calendar className="h-6 w-6 text-blue-600 mx-auto mb-2" />
                  <p className="text-2xl font-bold text-slate-900">{statistiche.prenotazioniTotali}</p>
                  <p className="text-xs text-slate-500">Prenotazioni totali</p>
                </div>
                <div className="p-4 bg-purple-50 rounded-xl text-center">
                  <BookOpen className="h-6 w-6 text-purple-600 mx-auto mb-2" />
                  <p className="text-2xl font-bold text-slate-900">{statistiche.prestitiTotali}</p>
                  <p className="text-xs text-slate-500">Libri presi in prestito</p>
                </div>
                <div className="p-4 bg-green-50 rounded-xl text-center">
                  <Clock className="h-6 w-6 text-green-600 mx-auto mb-2" />
                  <p className="text-2xl font-bold text-slate-900">{statistiche.oreTotaliStudio}</p>
                  <p className="text-xs text-slate-500">Ore in biblioteca</p>
                </div>
                <div className="p-4 bg-amber-50 rounded-xl text-center">
                  <User className="h-6 w-6 text-amber-600 mx-auto mb-2" />
                  <p className="text-lg font-bold text-slate-900 truncate">
                    {statistiche.salaPreferita || "N/A"}
                  </p>
                  <p className="text-xs text-slate-500">Sala preferita</p>
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
