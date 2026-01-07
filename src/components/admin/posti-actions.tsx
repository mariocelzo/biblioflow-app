"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
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
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { toast } from "sonner";
import {
  MoreHorizontal,
  Loader2,
  Wrench,
  CheckCircle2,
  Eye,
  Ban,
  RefreshCw,
  MapPin,
  Zap,
  Users,
  Calendar,
  TrendingUp,
  Clock,
  User,
  History,
} from "lucide-react";

interface DettagliPostoData {
  posto: {
    id: string;
    numero: string;
    stato: string;
    haPresaElettrica: boolean;
    haFinestra: boolean;
    isAccessibile: boolean;
    tavoloRegolabile: boolean;
    sala: {
      nome: string;
      piano: number;
      isSilenziosa: boolean;
      isGruppi: boolean;
    };
  };
  statistiche: {
    prenotazioniTotali: number;
    prenotazioniCompletate: number;
    noShowCount: number;
    tassoUtilizzo: number;
    tassoNoShow: number;
  };
  prenotazioneAttuale?: {
    id: string;
    data: string;
    oraInizio: string;
    oraFine: string;
    user: {
      nome: string;
      cognome: string;
      email: string;
    };
  };
  prenotazioniRecenti: Array<{
    id: string;
    data: string;
    oraInizio: string;
    oraFine: string;
    stato: string;
    user: {
      nome: string;
      cognome: string;
    };
  }>;
  logEventi: Array<{
    id: string;
    tipo: string;
    descrizione: string;
    createdAt: string;
  }>;
}

interface PostoActionButtonProps {
  postoId: string;
  numero: string;
  stato: string;
  sala: string;
  onSuccess?: () => void;
}

export function PostoActionButton({
  postoId,
  numero,
  stato,
  sala,
  onSuccess,
}: PostoActionButtonProps) {
  const [isLoading, setIsLoading] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [actionType, setActionType] = useState<"MANUTENZIONE" | "DISPONIBILE" | null>(null);
  
  // Dati dettagli posto
  const [dettagliData, setDettagliData] = useState<DettagliPostoData | null>(null);
  const [loadingDettagli, setLoadingDettagli] = useState(false);

  const cambiaStato = async (nuovoStato: "MANUTENZIONE" | "DISPONIBILE") => {
    setIsLoading(true);
    try {
      const response = await fetch(`/api/admin/posti/${postoId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ stato: nuovoStato }),
      });

      const data = await response.json();

      if (response.ok) {
        toast.success("Stato aggiornato", {
          description: `Il posto ${numero} è ora ${nuovoStato === "MANUTENZIONE" ? "in manutenzione" : "disponibile"}`,
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

  const caricaDettagli = async () => {
    setLoadingDettagli(true);
    try {
      const response = await fetch(`/api/admin/posti/${postoId}/dettagli`);
      const data = await response.json();
      
      if (response.ok) {
        setDettagliData(data);
      } else {
        toast.error("Errore nel caricamento dei dettagli");
      }
    } catch {
      toast.error("Errore di connessione");
    } finally {
      setLoadingDettagli(false);
    }
  };

  const openDialog = (type: "MANUTENZIONE" | "DISPONIBILE") => {
    setActionType(type);
    setDialogOpen(true);
  };

  const openDettagliSheet = () => {
    setSheetOpen(true);
    if (!dettagliData) caricaDettagli();
  };

  const statoCorrente = stato;

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
          <DropdownMenuItem className="gap-2" onClick={openDettagliSheet}>
            <Eye className="h-4 w-4" />
            Visualizza Dettagli
          </DropdownMenuItem>
          
          {statoCorrente !== "MANUTENZIONE" && (
            <DropdownMenuItem
              className="gap-2 text-orange-600"
              onClick={() => openDialog("MANUTENZIONE")}
            >
              <Wrench className="h-4 w-4" />
              Metti in Manutenzione
            </DropdownMenuItem>
          )}
          
          {statoCorrente === "MANUTENZIONE" && (
            <DropdownMenuItem
              className="gap-2 text-green-600"
              onClick={() => openDialog("DISPONIBILE")}
            >
              <CheckCircle2 className="h-4 w-4" />
              Rendi Disponibile
            </DropdownMenuItem>
          )}
          
          {statoCorrente === "OCCUPATO" && (
            <DropdownMenuItem className="gap-2 text-red-600" disabled>
              <Ban className="h-4 w-4" />
              Libera Posto (attivo)
            </DropdownMenuItem>
          )}
        </DropdownMenuContent>
      </DropdownMenu>

      {/* Sheet Dettagli Posto */}
      <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
        <SheetContent className="w-full sm:max-w-2xl overflow-y-auto">
          <SheetHeader>
            <SheetTitle>Dettagli Posto {numero}</SheetTitle>
            <SheetDescription>
              Informazioni complete e statistiche del posto
            </SheetDescription>
          </SheetHeader>

          {loadingDettagli ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : dettagliData ? (
            <div className="mt-6 space-y-6">
              {/* Info Base */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg flex items-center gap-2">
                    <MapPin className="h-5 w-5" />
                    Informazioni Posto
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <Label className="text-xs text-muted-foreground">Numero Posto</Label>
                      <p className="font-medium text-lg">{dettagliData.posto.numero}</p>
                    </div>
                    <div>
                      <Label className="text-xs text-muted-foreground">Sala</Label>
                      <p className="font-medium">{dettagliData.posto.sala.nome}</p>
                    </div>
                    <div>
                      <Label className="text-xs text-muted-foreground">Piano</Label>
                      <p className="font-medium">Piano {dettagliData.posto.sala.piano}</p>
                    </div>
                    <div>
                      <Label className="text-xs text-muted-foreground">Stato</Label>
                      <Badge
                        variant={
                          dettagliData.posto.stato === "DISPONIBILE"
                            ? "default"
                            : dettagliData.posto.stato === "OCCUPATO"
                            ? "secondary"
                            : "destructive"
                        }
                      >
                        {dettagliData.posto.stato}
                      </Badge>
                    </div>
                  </div>

                  <Separator />

                  {/* Caratteristiche */}
                  <div>
                    <Label className="text-xs text-muted-foreground mb-2 block">Caratteristiche</Label>
                    <div className="flex flex-wrap gap-2">
                      {dettagliData.posto.haPresaElettrica && (
                        <Badge variant="outline" className="gap-1">
                          <Zap className="h-3 w-3" />
                          Presa Elettrica
                        </Badge>
                      )}
                      {dettagliData.posto.haFinestra && (
                        <Badge variant="outline" className="gap-1">
                          <MapPin className="h-3 w-3" />
                          Finestra
                        </Badge>
                      )}
                      {dettagliData.posto.isAccessibile && (
                        <Badge variant="outline" className="gap-1">
                          <Users className="h-3 w-3" />
                          Accessibile
                        </Badge>
                      )}
                      {dettagliData.posto.tavoloRegolabile && (
                        <Badge variant="outline" className="gap-1">
                          <TrendingUp className="h-3 w-3" />
                          Tavolo Regolabile
                        </Badge>
                      )}
                    </div>
                  </div>

                  {/* Caratteristiche Sala */}
                  <div>
                    <Label className="text-xs text-muted-foreground mb-2 block">Tipo Sala</Label>
                    <div className="flex flex-wrap gap-2">
                      {dettagliData.posto.sala.isSilenziosa && (
                        <Badge variant="secondary">🤫 Sala Silenziosa</Badge>
                      )}
                      {dettagliData.posto.sala.isGruppi && (
                        <Badge variant="secondary">👥 Sala Gruppi</Badge>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Statistiche */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg flex items-center gap-2">
                    <TrendingUp className="h-5 w-5" />
                    Statistiche Utilizzo
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="text-center p-4 bg-blue-50 dark:bg-blue-950 rounded-lg">
                      <Calendar className="h-6 w-6 mx-auto mb-2 text-blue-600 dark:text-blue-400" />
                      <p className="text-3xl font-bold text-blue-600 dark:text-blue-400">
                        {dettagliData.statistiche.prenotazioniTotali}
                      </p>
                      <p className="text-xs text-muted-foreground mt-1">Prenotazioni Totali</p>
                    </div>
                    <div className="text-center p-4 bg-green-50 dark:bg-green-950 rounded-lg">
                      <CheckCircle2 className="h-6 w-6 mx-auto mb-2 text-green-600 dark:text-green-400" />
                      <p className="text-3xl font-bold text-green-600 dark:text-green-400">
                        {dettagliData.statistiche.prenotazioniCompletate}
                      </p>
                      <p className="text-xs text-muted-foreground mt-1">Completate</p>
                    </div>
                    <div className="text-center p-4 bg-red-50 dark:bg-red-950 rounded-lg">
                      <Ban className="h-6 w-6 mx-auto mb-2 text-red-600 dark:text-red-400" />
                      <p className="text-3xl font-bold text-red-600 dark:text-red-400">
                        {dettagliData.statistiche.noShowCount}
                      </p>
                      <p className="text-xs text-muted-foreground mt-1">No-Show</p>
                    </div>
                    <div className="text-center p-4 bg-purple-50 dark:bg-purple-950 rounded-lg">
                      <TrendingUp className="h-6 w-6 mx-auto mb-2 text-purple-600 dark:text-purple-400" />
                      <p className="text-3xl font-bold text-purple-600 dark:text-purple-400">
                        {dettagliData.statistiche.tassoUtilizzo}%
                      </p>
                      <p className="text-xs text-muted-foreground mt-1">Tasso Utilizzo</p>
                    </div>
                  </div>

                  {dettagliData.statistiche.tassoNoShow > 0 && (
                    <div className="mt-4 p-3 bg-amber-50 dark:bg-amber-950 rounded-lg">
                      <p className="text-sm text-amber-800 dark:text-amber-200">
                        ⚠️ Tasso No-Show: <strong>{dettagliData.statistiche.tassoNoShow}%</strong>
                      </p>
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* Prenotazione Attuale */}
              {dettagliData.prenotazioneAttuale && (
                <Card>
                  <CardHeader>
                    <CardTitle className="text-lg flex items-center gap-2">
                      <User className="h-5 w-5" />
                      Prenotazione Attuale
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="flex items-start justify-between p-3 bg-muted rounded-lg">
                      <div className="space-y-1">
                        <p className="font-medium">
                          {dettagliData.prenotazioneAttuale.user.nome}{" "}
                          {dettagliData.prenotazioneAttuale.user.cognome}
                        </p>
                        <p className="text-sm text-muted-foreground">
                          {dettagliData.prenotazioneAttuale.user.email}
                        </p>
                        <div className="flex items-center gap-2 text-sm text-muted-foreground mt-2">
                          <Clock className="h-3 w-3" />
                          <span>
                            {new Date(`1970-01-01T${dettagliData.prenotazioneAttuale.oraInizio}`).toLocaleTimeString("it-IT", {
                              hour: "2-digit",
                              minute: "2-digit",
                            })}{" "}
                            -{" "}
                            {new Date(`1970-01-01T${dettagliData.prenotazioneAttuale.oraFine}`).toLocaleTimeString("it-IT", {
                              hour: "2-digit",
                              minute: "2-digit",
                            })}
                          </span>
                        </div>
                      </div>
                      <Badge variant="default">In Uso</Badge>
                    </div>
                  </CardContent>
                </Card>
              )}

              {/* Prenotazioni Recenti */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg flex items-center gap-2">
                    <History className="h-5 w-5" />
                    Prenotazioni Recenti
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-2">
                  {dettagliData.prenotazioniRecenti.length === 0 ? (
                    <p className="text-center text-muted-foreground py-4">
                      Nessuna prenotazione recente
                    </p>
                  ) : (
                    dettagliData.prenotazioniRecenti.slice(0, 5).map((pren) => (
                      <div key={pren.id} className="flex items-start justify-between p-2 border rounded-lg">
                        <div className="space-y-1">
                          <p className="text-sm font-medium">
                            {pren.user.nome} {pren.user.cognome}
                          </p>
                          <div className="flex items-center gap-2 text-xs text-muted-foreground">
                            <Calendar className="h-3 w-3" />
                            <span>{new Date(pren.data).toLocaleDateString("it-IT")}</span>
                            <Clock className="h-3 w-3 ml-2" />
                            <span>
                              {new Date(`1970-01-01T${pren.oraInizio}`).toLocaleTimeString("it-IT", {
                                hour: "2-digit",
                                minute: "2-digit",
                              })}
                            </span>
                          </div>
                        </div>
                        <Badge variant={pren.stato === "CHECK_IN" || pren.stato === "COMPLETATA" ? "default" : "secondary"} className="text-xs">
                          {pren.stato === "CHECK_IN" || pren.stato === "COMPLETATA" ? "✓" : "⏳"}
                        </Badge>
                      </div>
                    ))
                  )}
                </CardContent>
              </Card>

              {/* Log Eventi */}
              {dettagliData.logEventi.length > 0 && (
                <Card>
                  <CardHeader>
                    <CardTitle className="text-lg flex items-center gap-2">
                      <History className="h-5 w-5" />
                      Storico Modifiche
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-2">
                    {dettagliData.logEventi.slice(0, 5).map((evento) => (
                      <div key={evento.id} className="flex items-start gap-2 p-2 border rounded-lg">
                        <Badge variant="outline" className="text-xs">
                          {evento.tipo.replace(/_/g, " ")}
                        </Badge>
                        <div className="flex-1">
                          {evento.descrizione && (
                            <p className="text-sm text-muted-foreground">{evento.descrizione}</p>
                          )}
                          <p className="text-xs text-muted-foreground mt-1">
                            {new Date(evento.createdAt).toLocaleString("it-IT")}
                          </p>
                        </div>
                      </div>
                    ))}
                  </CardContent>
                </Card>
              )}
            </div>
          ) : null}
        </SheetContent>
      </Sheet>

      {/* Dialog di conferma cambio stato */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {actionType === "MANUTENZIONE"
                ? "Mettere in Manutenzione?"
                : "Rendere Disponibile?"}
            </DialogTitle>
            <DialogDescription>
              {actionType === "MANUTENZIONE"
                ? `Il posto ${numero} nella ${sala} verrà messo in manutenzione e non sarà prenotabile.`
                : `Il posto ${numero} nella ${sala} tornerà disponibile per le prenotazioni.`}
            </DialogDescription>
          </DialogHeader>

          <div className="py-4">
            <div className="flex items-center gap-3 p-3 bg-muted rounded-lg">
              <div className="flex-1">
                <p className="font-medium">Posto {numero}</p>
                <p className="text-sm text-muted-foreground">{sala}</p>
              </div>
              <Badge
                variant={
                  actionType === "MANUTENZIONE" ? "destructive" : "default"
                }
                className={
                  actionType === "DISPONIBILE"
                    ? "bg-green-100 text-green-800 dark:bg-green-950 dark:text-green-300"
                    : ""
                }
              >
                {actionType === "MANUTENZIONE" ? (
                  <Wrench className="h-3 w-3 mr-1" />
                ) : (
                  <CheckCircle2 className="h-3 w-3 mr-1" />
                )}
                {actionType === "MANUTENZIONE" ? "Manutenzione" : "Disponibile"}
              </Badge>
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
              onClick={() => actionType && cambiaStato(actionType)}
              disabled={isLoading}
              variant={actionType === "MANUTENZIONE" ? "destructive" : "default"}
              className={
                actionType === "DISPONIBILE"
                  ? "bg-green-600 hover:bg-green-700"
                  : ""
              }
            >
              {isLoading ? (
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
              ) : actionType === "MANUTENZIONE" ? (
                <Wrench className="h-4 w-4 mr-2" />
              ) : (
                <CheckCircle2 className="h-4 w-4 mr-2" />
              )}
              Conferma
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

// Bottone per refresh manuale
export function RefreshButton() {
  const [isLoading, setIsLoading] = useState(false);

  const refresh = () => {
    setIsLoading(true);
    window.location.reload();
  };

  return (
    <Button variant="outline" size="sm" onClick={refresh} disabled={isLoading}>
      {isLoading ? (
        <Loader2 className="h-4 w-4 animate-spin" />
      ) : (
        <RefreshCw className="h-4 w-4" />
      )}
    </Button>
  );
}
