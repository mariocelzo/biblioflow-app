"use client";

/**
 * Le richieste in lista d'attesa dello studente, con posizione e uscita.
 *
 * PERCHE' ESISTE: la CR02 permette di entrare in coda dalla mappa, dalla
 * griglia mobile e dal dialog di conflitto, e l'API espone da sempre anche
 * l'elenco (`GET /api/prenotazioni/coda`) e l'uscita
 * (`DELETE /api/prenotazioni/coda?id=`). Nessuna schermata pero' li usava:
 * dopo essere entrato in coda lo studente non poteva piu' vedere le proprie
 * richieste ne' rinunciarvi, e restava in coda finche' la fascia non passava.
 * Uscire per tempo e' anche cio' che permette a chi sta dietro di avanzare.
 */

import { useEffect, useState } from "react";
import { Loader2, LogOut, Users } from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { ETICHETTE_CODA } from "@/hooks/use-ingresso-coda";
import { formattaDataDb, formattaOraDb } from "@/lib/tempo-db";

export interface RichiestaInCoda {
  id: string;
  data: string;
  oraInizio: string;
  oraFine: string;
  posizione: number;
  posto: { id: string; numero: string; sala: { nome: string; piano: number } };
}

interface ListaAttesaUtenteProps {
  /** Notifica al chiamante quante richieste sono attive (per l'etichetta della scheda). */
  onConteggio?: (numero: number) => void;
}

export function ListaAttesaUtente({ onConteggio }: ListaAttesaUtenteProps) {
  const [richieste, setRichieste] = useState<RichiestaInCoda[]>([]);
  const [caricamento, setCaricamento] = useState(true);
  const [errore, setErrore] = useState(false);
  const [inUscita, setInUscita] = useState<string | null>(null);
  // Incrementato per rileggere l'elenco dal server (dopo un'uscita o un errore).
  const [versione, setVersione] = useState(0);

  useEffect(() => {
    let annullato = false;
    const carica = async () => {
      try {
        const risposta = await fetch("/api/prenotazioni/coda");
        if (!risposta.ok) throw new Error(String(risposta.status));
        const corpo = await risposta.json();
        if (annullato) return;
        setRichieste(Array.isArray(corpo.data) ? corpo.data : []);
        setErrore(false);
      } catch {
        if (!annullato) setErrore(true);
      } finally {
        if (!annullato) setCaricamento(false);
      }
    };
    void carica();
    return () => {
      annullato = true;
    };
  }, [versione]);

  useEffect(() => {
    onConteggio?.(richieste.length);
  }, [richieste.length, onConteggio]);

  const esci = async (richiesta: RichiestaInCoda) => {
    setInUscita(richiesta.id);
    try {
      const risposta = await fetch(`/api/prenotazioni/coda?id=${encodeURIComponent(richiesta.id)}`, {
        method: "DELETE",
      });
      const corpo = await risposta.json().catch(() => ({}));
      if (!risposta.ok) {
        throw new Error(corpo.error || "Impossibile uscire dalla lista d'attesa");
      }
      toast.success("Sei uscito dalla lista d'attesa", {
        description: `Posto ${richiesta.posto.numero}, ${formattaDataDb(richiesta.data)}`,
      });
      // Le posizioni di chi resta possono essere cambiate: si rilegge dal server.
      setVersione((v) => v + 1);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Errore di connessione");
    } finally {
      setInUscita(null);
    }
  };

  if (caricamento) {
    return (
      <div className="flex items-center gap-2 text-muted-foreground" role="status">
        <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
        Caricamento della lista d&apos;attesa…
      </div>
    );
  }

  if (errore) {
    return (
      <Card>
        <CardContent className="py-8 text-center">
          <p className="text-muted-foreground">Non è stato possibile caricare la lista d&apos;attesa.</p>
          <Button
            variant="outline"
            className="mt-4"
            onClick={() => {
              setCaricamento(true);
              setVersione((v) => v + 1);
            }}
          >
            Riprova
          </Button>
        </CardContent>
      </Card>
    );
  }

  if (richieste.length === 0) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center justify-center py-12">
          <Users className="h-12 w-12 text-muted-foreground mb-4" aria-hidden="true" />
          <h3 className="text-lg font-medium mb-2">Non sei in nessuna lista d&apos;attesa</h3>
          <p className="text-muted-foreground text-center">
            Se un posto è occupato nella fascia che ti serve, puoi entrare in coda dalla mappa: verrai promosso
            automaticamente quando si libera.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <ul className="space-y-4" aria-label="Le tue richieste in lista d'attesa">
      {richieste.map((richiesta) => (
        <li key={richiesta.id}>
          <Card>
            <CardContent className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="font-semibold">
                  Posto {richiesta.posto.numero} · {richiesta.posto.sala.nome}
                </p>
                <p className="text-sm text-muted-foreground capitalize">
                  {formattaDataDb(richiesta.data, { weekday: "long", day: "numeric", month: "long" })},{" "}
                  {formattaOraDb(richiesta.oraInizio)} – {formattaOraDb(richiesta.oraFine)}
                </p>
              </div>
              <div className="flex items-center gap-3">
                <Badge variant="secondary" aria-label={ETICHETTE_CODA.ariaPosizione(richiesta.posizione)}>
                  {ETICHETTE_CODA.badgePosizione(richiesta.posizione)}
                </Badge>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => esci(richiesta)}
                  disabled={inUscita !== null}
                  aria-label={`Esci dalla lista d'attesa per il posto ${richiesta.posto.numero}`}
                >
                  {inUscita === richiesta.id ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />
                  ) : (
                    <LogOut className="mr-2 h-4 w-4" aria-hidden="true" />
                  )}
                  Esci dalla lista
                </Button>
              </div>
            </CardContent>
          </Card>
        </li>
      ))}
    </ul>
  );
}
