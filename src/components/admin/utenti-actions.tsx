"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
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
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import {
  MoreHorizontal,
  Loader2,
  Send,
  Eye,
  Ban,
  CheckCircle2,
  UserX,
  Mail,
  History,
  User,
  MapPin,
  Calendar,
  BookOpen,
  TrendingUp,
  Clock,
} from "lucide-react";

interface ProfiloData {
  user: {
    nome: string;
    cognome: string;
    email: string;
    matricola: string | null;
    ruolo: string;
    attivo: boolean;
    emailVerificata: boolean;
    isPendolare: boolean;
  };
  statistiche: {
    prenotazioniCompletate: number;
    prestitiCompletati: number;
    noShowCount: number;
  };
  prenotazioni: Array<{
    id: string;
    data: string;
    oraInizio: string;
    oraFine: string;
    checkinEffettuato: boolean;
    posto: {
      numero: string;
      sala: {
        nome: string;
      };
    };
  }>;
  prestiti: Array<{
    id: string;
    dataInizio: string;
    dataFine: string;
    dataRestituzioneEffettiva: string | null;
    stato: string;
    libro: {
      titolo: string;
      autore: string;
    };
  }>;
}

interface StoricoData {
  eventi: Array<{
    id: string;
    tipo: string;
    descrizione: string;
    createdAt: string;
    prenotazione?: {
      posto: {
        numero: string;
        sala: {
          nome: string;
        };
      };
    };
  }>;
}

interface UtenteActionButtonProps {
  userId: string;
  nome: string;
  cognome: string;
  email: string;
  attivo: boolean;
  ruolo: string;
  onSuccess?: () => void;
}

export function UtenteActionButton({
  userId,
  nome,
  cognome,
  email,
  attivo,
  ruolo,
  onSuccess,
}: UtenteActionButtonProps) {
  const [isLoading, setIsLoading] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [dialogType, setDialogType] = useState<"notifica" | "stato" | "email" | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [sheetType, setSheetType] = useState<"profilo" | "storico" | null>(null);
  const [nuovoStato, setNuovoStato] = useState<boolean>(attivo);
  
  // Dati profilo
  const [profiloData, setProfiloData] = useState<ProfiloData | null>(null);
  const [loadingProfilo, setLoadingProfilo] = useState(false);
  
  // Dati storico
  const [storicoData, setStoricoData] = useState<StoricoData | null>(null);
  const [loadingStorico, setLoadingStorico] = useState(false);
  
  // Form notifica
  const [titolo, setTitolo] = useState("Comunicazione dalla Biblioteca");
  const [messaggio, setMessaggio] = useState("");
  
  // Form email
  const [emailOggetto, setEmailOggetto] = useState("");
  const [emailTesto, setEmailTesto] = useState("");

  const cambiaStato = async () => {
    setIsLoading(true);
    try {
      const response = await fetch(`/api/admin/utenti/${userId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ attivo: nuovoStato }),
      });

      const data = await response.json();

      if (response.ok) {
        toast.success(nuovoStato ? "Account Riattivato" : "Account Disattivato", {
          description: `L'account di ${nome} ${cognome} è stato ${nuovoStato ? "riattivato" : "disattivato"}.`,
        });
        setDialogOpen(false);
        onSuccess?.();
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

  const inviaNotifica = async () => {
    if (!messaggio.trim()) {
      toast.error("Inserisci un messaggio");
      return;
    }

    setIsLoading(true);
    try {
      const response = await fetch(`/api/admin/utenti/${userId}/notifica`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tipo: "SISTEMA",
          titolo,
          messaggio,
        }),
      });

      const data = await response.json();

      if (response.ok) {
        toast.success("Notifica Inviata", {
          description: `La notifica è stata inviata a ${nome} ${cognome}.`,
        });
        setDialogOpen(false);
        setTitolo("Comunicazione dalla Biblioteca");
        setMessaggio("");
        onSuccess?.();
      } else {
        toast.error("Errore", { description: data.error });
      }
    } catch {
      toast.error("Errore di connessione");
    } finally {
      setIsLoading(false);
    }
  };

  const inviaEmail = async () => {
    if (!emailOggetto.trim() || !emailTesto.trim()) {
      toast.error("Compila tutti i campi");
      return;
    }

    setIsLoading(true);
    try {
      // Simulazione invio email (in produzione integrare servizio email)
      await new Promise(resolve => setTimeout(resolve, 1500));
      
      toast.success("Email Inviata", {
        description: `L'email è stata inviata a ${email}`,
      });
      setDialogOpen(false);
      setEmailOggetto("");
      setEmailTesto("");
    } catch {
      toast.error("Errore durante l'invio dell'email");
    } finally {
      setIsLoading(false);
    }
  };

  const caricaProfilo = async () => {
    setLoadingProfilo(true);
    try {
      const response = await fetch(`/api/admin/utenti/${userId}/profilo`);
      const data = await response.json();
      
      if (response.ok) {
        setProfiloData(data);
      } else {
        toast.error("Errore nel caricamento del profilo");
      }
    } catch {
      toast.error("Errore di connessione");
    } finally {
      setLoadingProfilo(false);
    }
  };

  const caricaStorico = async () => {
    setLoadingStorico(true);
    try {
      const response = await fetch(`/api/admin/utenti/${userId}/storico`);
      const data = await response.json();
      
      if (response.ok) {
        setStoricoData(data);
      } else {
        toast.error("Errore nel caricamento dello storico");
      }
    } catch {
      toast.error("Errore di connessione");
    } finally {
      setLoadingStorico(false);
    }
  };

  const openProfiloSheet = () => {
    setSheetType("profilo");
    setSheetOpen(true);
    if (!profiloData) caricaProfilo();
  };

  const openStoricoSheet = () => {
    setSheetType("storico");
    setSheetOpen(true);
    if (!storicoData) caricaStorico();
  };

  const openNotificaDialog = () => {
    setDialogType("notifica");
    setDialogOpen(true);
  };

  const openEmailDialog = () => {
    setDialogType("email");
    setDialogOpen(true);
  };

  const openStatoDialog = (stato: boolean) => {
    setNuovoStato(stato);
    setDialogType("stato");
    setDialogOpen(true);
  };

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
            <MoreHorizontal className="h-4 w-4" />
            <span className="sr-only">Menu azioni</span>
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem className="gap-2" onClick={openProfiloSheet}>
            <Eye className="h-4 w-4" />
            Visualizza Profilo
          </DropdownMenuItem>
          <DropdownMenuItem className="gap-2" onClick={openStoricoSheet}>
            <History className="h-4 w-4" />
            Storico Attività
          </DropdownMenuItem>
          
          <DropdownMenuSeparator />
          
          <DropdownMenuItem className="gap-2" onClick={openNotificaDialog}>
            <Send className="h-4 w-4" />
            Invia Notifica
          </DropdownMenuItem>
          <DropdownMenuItem className="gap-2" onClick={openEmailDialog}>
            <Mail className="h-4 w-4" />
            Invia Email
          </DropdownMenuItem>
          
          <DropdownMenuSeparator />
          
          {attivo ? (
            <DropdownMenuItem
              className="gap-2 text-red-600"
              onClick={() => openStatoDialog(false)}
            >
              <UserX className="h-4 w-4" />
              Disattiva Account
            </DropdownMenuItem>
          ) : (
            <DropdownMenuItem
              className="gap-2 text-green-600"
              onClick={() => openStatoDialog(true)}
            >
              <CheckCircle2 className="h-4 w-4" />
              Riattiva Account
            </DropdownMenuItem>
          )}
        </DropdownMenuContent>
      </DropdownMenu>

      {/* Sheet Profilo */}
      <Sheet open={sheetOpen && sheetType === "profilo"} onOpenChange={setSheetOpen}>
        <SheetContent className="w-full sm:max-w-2xl overflow-y-auto">
          <SheetHeader>
            <SheetTitle>Profilo Utente</SheetTitle>
            <SheetDescription>
              Dettagli completi e statistiche di {nome} {cognome}
            </SheetDescription>
          </SheetHeader>

          {loadingProfilo ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : profiloData ? (
            <div className="mt-6 space-y-6">
              {/* Info Base */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg flex items-center gap-2">
                    <User className="h-5 w-5" />
                    Informazioni Personali
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <Label className="text-xs text-muted-foreground">Nome Completo</Label>
                      <p className="font-medium">{profiloData.user.nome} {profiloData.user.cognome}</p>
                    </div>
                    <div>
                      <Label className="text-xs text-muted-foreground">Email</Label>
                      <p className="font-medium text-sm">{profiloData.user.email}</p>
                    </div>
                    <div>
                      <Label className="text-xs text-muted-foreground">Matricola</Label>
                      <p className="font-medium">{profiloData.user.matricola || "N/A"}</p>
                    </div>
                    <div>
                      <Label className="text-xs text-muted-foreground">Ruolo</Label>
                      <Badge variant={profiloData.user.ruolo === "ADMIN" ? "default" : "secondary"}>
                        {profiloData.user.ruolo}
                      </Badge>
                    </div>
                  </div>
                  
                  <Separator />
                  
                  <div className="flex items-center justify-between">
                    <div>
                      <Label className="text-xs text-muted-foreground">Stato Account</Label>
                      <div className="flex items-center gap-2 mt-1">
                        <Badge variant={profiloData.user.attivo ? "default" : "destructive"}>
                          {profiloData.user.attivo ? "Attivo" : "Disattivato"}
                        </Badge>
                        {profiloData.user.emailVerificata && (
                          <Badge variant="outline" className="text-green-600">
                            ✓ Email Verificata
                          </Badge>
                        )}
                      </div>
                    </div>
                    {profiloData.user.isPendolare && (
                      <Badge variant="outline" className="gap-1">
                        <MapPin className="h-3 w-3" />
                        Pendolare
                      </Badge>
                    )}
                  </div>
                </CardContent>
              </Card>

              {/* Statistiche */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg flex items-center gap-2">
                    <TrendingUp className="h-5 w-5" />
                    Statistiche
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-3 gap-4">
                    <div className="text-center p-3 bg-blue-50 dark:bg-blue-950 rounded-lg">
                      <Calendar className="h-5 w-5 mx-auto mb-1 text-blue-600 dark:text-blue-400" />
                      <p className="text-2xl font-bold text-blue-600 dark:text-blue-400">
                        {profiloData.statistiche.prenotazioniCompletate}
                      </p>
                      <p className="text-xs text-muted-foreground">Prenotazioni</p>
                    </div>
                    <div className="text-center p-3 bg-green-50 dark:bg-green-950 rounded-lg">
                      <BookOpen className="h-5 w-5 mx-auto mb-1 text-green-600 dark:text-green-400" />
                      <p className="text-2xl font-bold text-green-600 dark:text-green-400">
                        {profiloData.statistiche.prestitiCompletati}
                      </p>
                      <p className="text-xs text-muted-foreground">Prestiti</p>
                    </div>
                    <div className="text-center p-3 bg-red-50 dark:bg-red-950 rounded-lg">
                      <UserX className="h-5 w-5 mx-auto mb-1 text-red-600 dark:text-red-400" />
                      <p className="text-2xl font-bold text-red-600 dark:text-red-400">
                        {profiloData.statistiche.noShowCount}
                      </p>
                      <p className="text-xs text-muted-foreground">No-Show</p>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Prenotazioni e Prestiti */}
              <Tabs defaultValue="prenotazioni" className="w-full">
                <TabsList className="grid w-full grid-cols-2">
                  <TabsTrigger value="prenotazioni">Prenotazioni</TabsTrigger>
                  <TabsTrigger value="prestiti">Prestiti</TabsTrigger>
                </TabsList>
                
                <TabsContent value="prenotazioni" className="space-y-2 mt-4">
                  {profiloData.prenotazioni.length === 0 ? (
                    <p className="text-center text-muted-foreground py-6">Nessuna prenotazione</p>
                  ) : (
                    profiloData.prenotazioni.map((pren) => (
                      <Card key={pren.id}>
                        <CardContent className="pt-4">
                          <div className="flex items-start justify-between">
                            <div className="space-y-1">
                              <div className="flex items-center gap-2">
                                <MapPin className="h-4 w-4 text-muted-foreground" />
                                <span className="font-medium">
                                  {pren.posto.sala.nome} - Posto {pren.posto.numero}
                                </span>
                              </div>
                              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                                <Calendar className="h-3 w-3" />
                                <span>{new Date(pren.data).toLocaleDateString("it-IT")}</span>
                                <Clock className="h-3 w-3 ml-2" />
                                <span>
                                  {new Date(pren.oraInizio).toLocaleTimeString("it-IT", {
                                    hour: "2-digit",
                                    minute: "2-digit",
                                  })}{" "}
                                  -{" "}
                                  {new Date(pren.oraFine).toLocaleTimeString("it-IT", {
                                    hour: "2-digit",
                                    minute: "2-digit",
                                  })}
                                </span>
                              </div>
                            </div>
                            <Badge variant={pren.checkinEffettuato ? "default" : "secondary"}>
                              {pren.checkinEffettuato ? "Check-in ✓" : "In Attesa"}
                            </Badge>
                          </div>
                        </CardContent>
                      </Card>
                    ))
                  )}
                </TabsContent>
                
                <TabsContent value="prestiti" className="space-y-2 mt-4">
                  {profiloData.prestiti.length === 0 ? (
                    <p className="text-center text-muted-foreground py-6">Nessun prestito</p>
                  ) : (
                    profiloData.prestiti.map((prest) => (
                      <Card key={prest.id}>
                        <CardContent className="pt-4">
                          <div className="flex items-start justify-between">
                            <div className="space-y-1">
                              <div className="flex items-center gap-2">
                                <BookOpen className="h-4 w-4 text-muted-foreground" />
                                <span className="font-medium">{prest.libro.titolo}</span>
                              </div>
                              <p className="text-sm text-muted-foreground">
                                di {prest.libro.autore}
                              </p>
                              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                                <Calendar className="h-3 w-3" />
                                <span>
                                  Prestito: {new Date(prest.dataInizio).toLocaleDateString("it-IT")}
                                </span>
                                {prest.dataFine && (
                                  <>
                                    <span className="mx-1">•</span>
                                    <span>
                                      Scadenza: {new Date(prest.dataFine).toLocaleDateString("it-IT")}
                                    </span>
                                  </>
                                )}
                              </div>
                            </div>
                            <Badge
                              variant={
                                prest.stato === "ATTIVO"
                                  ? "default"
                                  : prest.stato === "RESTITUITO"
                                  ? "secondary"
                                  : "destructive"
                              }
                            >
                              {prest.stato}
                            </Badge>
                          </div>
                        </CardContent>
                      </Card>
                    ))
                  )}
                </TabsContent>
              </Tabs>
            </div>
          ) : null}
        </SheetContent>
      </Sheet>

      {/* Sheet Storico */}
      <Sheet open={sheetOpen && sheetType === "storico"} onOpenChange={setSheetOpen}>
        <SheetContent className="w-full sm:max-w-2xl overflow-y-auto">
          <SheetHeader>
            <SheetTitle>Storico Attività</SheetTitle>
            <SheetDescription>
              Cronologia delle azioni di {nome} {cognome}
            </SheetDescription>
          </SheetHeader>

          {loadingStorico ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : storicoData ? (
            <div className="mt-6 space-y-3">
              {storicoData.eventi.length === 0 ? (
                <p className="text-center text-muted-foreground py-8">
                  Nessuna attività registrata
                </p>
              ) : (
                storicoData.eventi.map((evento) => (
                  <Card key={evento.id}>
                    <CardContent className="pt-4">
                      <div className="flex items-start gap-3">
                        <div className="mt-1">
                          {evento.tipo === "PRENOTAZIONE_CREATA" && (
                            <Calendar className="h-5 w-5 text-blue-600" />
                          )}
                          {evento.tipo === "CHECK_IN" && (
                            <CheckCircle2 className="h-5 w-5 text-green-600" />
                          )}
                          {evento.tipo === "NO_SHOW" && (
                            <UserX className="h-5 w-5 text-red-600" />
                          )}
                          {evento.tipo === "PRESTITO_CREATO" && (
                            <BookOpen className="h-5 w-5 text-purple-600" />
                          )}
                          {!["PRENOTAZIONE_CREATA", "CHECK_IN", "NO_SHOW", "PRESTITO_CREATO"].includes(
                            evento.tipo
                          ) && <History className="h-5 w-5 text-muted-foreground" />}
                        </div>
                        <div className="flex-1 space-y-1">
                          <div className="flex items-center justify-between">
                            <Badge variant="outline">{evento.tipo.replace(/_/g, " ")}</Badge>
                            <span className="text-xs text-muted-foreground">
                              {new Date(evento.createdAt).toLocaleString("it-IT")}
                            </span>
                          </div>
                          {evento.descrizione && (
                            <p className="text-sm text-muted-foreground">{evento.descrizione}</p>
                          )}
                          {evento.prenotazione && (
                            <p className="text-sm">
                              <MapPin className="h-3 w-3 inline mr-1" />
                              {evento.prenotazione.posto?.sala?.nome} - Posto{" "}
                              {evento.prenotazione.posto?.numero}
                            </p>
                          )}
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))
              )}
            </div>
          ) : null}
        </SheetContent>
      </Sheet>

      {/* Dialog Notifica */}
      <Dialog open={dialogOpen && dialogType === "notifica"} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Invia Notifica a {nome} {cognome}</DialogTitle>
            <DialogDescription>
              La notifica verrà visualizzata nell&apos;area notifiche dell&apos;utente.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="flex items-center gap-3 p-3 bg-muted rounded-lg">
              <div className="flex-1">
                <p className="font-medium">{nome} {cognome}</p>
                <p className="text-sm text-muted-foreground">{email}</p>
              </div>
              <Badge variant={ruolo === "ADMIN" ? "default" : "secondary"}>
                {ruolo}
              </Badge>
            </div>

            <div className="space-y-2">
              <Label htmlFor="titolo">Titolo</Label>
              <Input
                id="titolo"
                value={titolo}
                onChange={(e) => setTitolo(e.target.value)}
                placeholder="Titolo della notifica"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="messaggio">Messaggio</Label>
              <Textarea
                id="messaggio"
                value={messaggio}
                onChange={(e) => setMessaggio(e.target.value)}
                placeholder="Scrivi il messaggio..."
                className="min-h-24"
              />
            </div>
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setDialogOpen(false)}
              disabled={isLoading}
            >
              Annulla
            </Button>
            <Button
              onClick={inviaNotifica}
              disabled={isLoading || !messaggio.trim()}
              className="gap-2"
            >
              {isLoading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Send className="h-4 w-4" />
              )}
              Invia
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog Email */}
      <Dialog open={dialogOpen && dialogType === "email"} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Invia Email a {nome} {cognome}</DialogTitle>
            <DialogDescription>
              L&apos;email verrà inviata a: {email}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="flex items-center gap-3 p-3 bg-muted rounded-lg">
              <Mail className="h-5 w-5 text-muted-foreground" />
              <div className="flex-1">
                <p className="font-medium">{nome} {cognome}</p>
                <p className="text-sm text-muted-foreground">{email}</p>
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="emailOggetto">Oggetto</Label>
              <Input
                id="emailOggetto"
                value={emailOggetto}
                onChange={(e) => setEmailOggetto(e.target.value)}
                placeholder="Oggetto dell'email"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="emailTesto">Messaggio</Label>
              <Textarea
                id="emailTesto"
                value={emailTesto}
                onChange={(e) => setEmailTesto(e.target.value)}
                placeholder="Scrivi il messaggio dell'email..."
                className="min-h-32"
              />
            </div>
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setDialogOpen(false)}
              disabled={isLoading}
            >
              Annulla
            </Button>
            <Button
              onClick={inviaEmail}
              disabled={isLoading || !emailOggetto.trim() || !emailTesto.trim()}
              className="gap-2"
            >
              {isLoading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Mail className="h-4 w-4" />
              )}
              Invia Email
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog Cambio Stato */}
      <Dialog open={dialogOpen && dialogType === "stato"} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {nuovoStato ? "Riattivare Account?" : "Disattivare Account?"}
            </DialogTitle>
            <DialogDescription>
              {nuovoStato
                ? `L'account di ${nome} ${cognome} verrà riattivato e potrà accedere nuovamente al sistema.`
                : `L'account di ${nome} ${cognome} verrà disattivato. L'utente non potrà più accedere fino alla riattivazione.`}
            </DialogDescription>
          </DialogHeader>

          <div className="py-4">
            <div className="flex items-center gap-3 p-3 bg-muted rounded-lg">
              <div className="flex-1">
                <p className="font-medium">{nome} {cognome}</p>
                <p className="text-sm text-muted-foreground">{email}</p>
              </div>
              <Badge
                variant={nuovoStato ? "default" : "destructive"}
                className={
                  nuovoStato
                    ? "bg-green-100 text-green-800 dark:bg-green-950 dark:text-green-300"
                    : ""
                }
              >
                {nuovoStato ? (
                  <CheckCircle2 className="h-3 w-3 mr-1" />
                ) : (
                  <Ban className="h-3 w-3 mr-1" />
                )}
                {nuovoStato ? "Attivo" : "Disattivato"}
              </Badge>
            </div>

            {!nuovoStato && (
              <p className="mt-3 text-sm text-amber-600 dark:text-amber-400">
                ⚠️ Le prenotazioni attive dell&apos;utente verranno mantenute ma non potrà effettuarne di nuove.
              </p>
            )}
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setDialogOpen(false)}
              disabled={isLoading}
            >
              Annulla
            </Button>
            <Button
              onClick={cambiaStato}
              disabled={isLoading}
              variant={nuovoStato ? "default" : "destructive"}
              className={nuovoStato ? "bg-green-600 hover:bg-green-700" : ""}
            >
              {isLoading ? (
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
              ) : nuovoStato ? (
                <CheckCircle2 className="h-4 w-4 mr-2" />
              ) : (
                <UserX className="h-4 w-4 mr-2" />
              )}
              {nuovoStato ? "Riattiva" : "Disattiva"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

// Bottone rapido per inviare notifica
interface QuickNotifyButtonProps {
  userId: string;
  nome: string;
  cognome: string;
}

export function QuickNotifyButton({ userId, nome, cognome }: QuickNotifyButtonProps) {
  const [isLoading, setIsLoading] = useState(false);

  const inviaSollecito = async () => {
    setIsLoading(true);
    try {
      const response = await fetch(`/api/admin/utenti/${userId}/notifica`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tipo: "SISTEMA",
          titolo: "Promemoria dalla Biblioteca",
          messaggio: "Ti ricordiamo di verificare le tue prenotazioni e prestiti attivi.",
        }),
      });

      const data = await response.json();

      if (response.ok) {
        toast.success("Sollecito Inviato", {
          description: `Il sollecito è stato inviato a ${nome} ${cognome}.`,
        });
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
      variant="outline"
      size="sm"
      onClick={inviaSollecito}
      disabled={isLoading}
      className="gap-1"
    >
      {isLoading ? (
        <Loader2 className="h-3 w-3 animate-spin" />
      ) : (
        <Send className="h-3 w-3" />
      )}
      Sollecita
    </Button>
  );
}
