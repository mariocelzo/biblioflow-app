"use client";

/**
 * Hook condiviso: ingresso in lista d'attesa (coda) per un posto occupato/prenotato.
 *
 * PERCHE' ESISTE
 * - CR-BF-01 / CA-03 richiede che l'opzione "entra in coda" sia identica in TUTTE
 *   le viste dei posti: la mappa SVG (desktop) e la griglia (mobile).
 * - BIB-52 aveva implementato la logica inline dentro `MappaBiblioteca`.
 * - BIB-53 la estrae qui, così mappa e griglia mobile condividono LO STESSO
 *   codice e LE STESSE etichette (AC esplicito: "Nessuna divergenza di etichette
 *   fra le due viste").
 *
 * COSA FORNISCE
 * - stato locale della coda: `postoCoda` / `setPostoCoda`, `posizioniCoda`, `codaLoading`;
 * - `caricaPosizioneCoda(posto)` -> GET  /api/prenotazioni/coda (posizione se già in coda);
 * - `handleEntraInCoda(posto)`   -> POST /api/prenotazioni/coda (entra in coda);
 * - helper puri riusabili: `isPostoAccodabile`, `creaPayloadCoda`, `etichettaPosto`;
 * - copy centralizzato del flusso coda: `ETICHETTE_CODA` (unica fonte di verità).
 */

import { useCallback, useState, type Dispatch, type SetStateAction } from "react";
import { toast } from "sonner";

/** Stato possibile di un posto in biblioteca (allineato al dominio Prisma/mappa). */
export type StatoPosto = "DISPONIBILE" | "OCCUPATO" | "PRENOTATO" | "MANUTENZIONE";

/** Intervallo (data + fascia oraria) per cui si chiede/verifica la coda. */
export interface IntervalloCoda {
  /** Formato "YYYY-MM-DD". */
  data: string;
  /** Formato "HH:mm". */
  oraInizio: string;
  /** Formato "HH:mm". */
  oraFine: string;
}

/**
 * Sottoinsieme minimo di "Posto" richiesto dalla logica coda. Entrambe le viste
 * (mappa e mobile) hanno oggetti posto più ricchi ma strutturalmente compatibili
 * con questo tipo, quindi possono passarli direttamente all'hook.
 */
export interface PostoAccodabile {
  id: string;
  numero: string;
  stato: StatoPosto;
}

/**
 * Un posto è "accodabile" solo se OCCUPATO o PRENOTATO nell'intervallo scelto:
 * se è DISPONIBILE si prenota, se è in MANUTENZIONE non è selezionabile.
 */
export function isPostoAccodabile(posto: { stato: StatoPosto }): boolean {
  return posto.stato === "OCCUPATO" || posto.stato === "PRENOTATO";
}

/** Costruisce il body atteso da POST /api/prenotazioni/coda. */
export function creaPayloadCoda(postoId: string, intervallo: IntervalloCoda) {
  return { postoId, ...intervallo };
}

/**
 * Etichetta testuale unica di un posto: usata sia come tooltip SVG nella mappa
 * sia come `aria-label` del bottone nella griglia mobile. Essendo l'unica fonte,
 * qualunque divergenza di copy fra le due viste è impossibile per costruzione.
 * (Preserva 1:1 le stringhe introdotte da BIB-52.)
 */
export function etichettaPosto(posto: { numero: string; stato: StatoPosto }): string {
  switch (posto.stato) {
    case "DISPONIBILE":
      return `Posto ${posto.numero} - Disponibile (clicca per selezionare)`;
    case "OCCUPATO":
      return `Posto ${posto.numero} - Occupato, coda disponibile (clicca per entrare)`;
    case "PRENOTATO":
      return `Posto ${posto.numero} - Prenotato, coda disponibile (clicca per entrare)`;
    case "MANUTENZIONE":
      return `Posto ${posto.numero} - In manutenzione`;
    default:
      return `Posto ${posto.numero}`;
  }
}

/**
 * Copy centralizzato del flusso "lista d'attesa": voce di legenda, pannello,
 * azione, badge posizione, toast ed errori. Mappa e mobile importano SOLO da qui:
 * è la garanzia dell'AC "Nessuna divergenza di etichette fra le due viste".
 */
export const ETICHETTE_CODA = {
  /** Voce di legenda accanto al badge "+". */
  legenda: "Coda disponibile",
  /** Titolo del pannello mostrato sotto la vista posti. */
  titoloPannello: (numero: string) => `Lista d'attesa · Posto ${numero}`,
  /** Testo quando il posto è occupato ma l'utente non è ancora in coda. */
  descrizioneLibera:
    "Il posto è occupato per l'intervallo scelto. Puoi entrare in coda.",
  /** Testo quando l'utente è già in coda per quel posto/intervallo. */
  descrizioneInCoda: (posizione: number) =>
    `Sei già in lista. Posizione attuale: ${posizione}.`,
  /** Etichetta del bottone d'azione. */
  azioneEntra: "Entra in lista d'attesa",
  /** Contenuto del badge che mostra la posizione in coda. */
  badgePosizione: (posizione: number) => `Posizione ${posizione}`,
  /** `aria-label` del badge posizione (più esplicito per gli screen reader). */
  ariaPosizione: (posizione: number) => `Posizione in coda ${posizione}`,
  /** Toast di conferma dell'ingresso in coda. */
  toastSuccessTitolo: "Sei in lista d'attesa",
  toastSuccessDescrizione: (posizione: number) => `Posizione attuale: ${posizione}`,
  toastSuccessDescrizionePosto: (numero: string) => `Posto ${numero}`,
  /** Messaggi di errore. */
  erroreGenerico: "Impossibile entrare in lista d'attesa",
  erroreConnessione: "Errore di connessione",
} as const;

/** Normalizza una data ISO (o "YYYY-MM-DD...") a "YYYY-MM-DD". */
function dataNormalizzata(value: string): string {
  return value.slice(0, 10);
}

/** Normalizza un orario ("HH:mm...", oppure ISO con "T") a "HH:mm". */
function oraNormalizzata(value: string): string {
  if (value.includes("T")) {
    return new Date(value).toISOString().slice(11, 16);
  }
  return value.slice(0, 5);
}

/** Valore restituito dall'hook: stato + azioni della coda. */
export interface UseIngressoCodaResult {
  /** Posto attualmente "in focus" per la coda (null = pannello nascosto). */
  postoCoda: PostoAccodabile | null;
  setPostoCoda: Dispatch<SetStateAction<PostoAccodabile | null>>;
  /** Mappa postoId -> posizione in coda (da GET o dalla risposta POST). */
  posizioniCoda: Record<string, number>;
  /** Flag di caricamento condiviso da GET e POST. */
  codaLoading: boolean;
  caricaPosizioneCoda: (posto: PostoAccodabile) => Promise<void>;
  handleEntraInCoda: (posto: PostoAccodabile) => Promise<void>;
}

/**
 * Hook riusabile per l'ingresso in lista d'attesa.
 * @param intervalloCoda intervallo (data + fascia) selezionato dall'utente.
 */
export function useIngressoCoda(
  intervalloCoda: IntervalloCoda,
): UseIngressoCodaResult {
  const [postoCoda, setPostoCoda] = useState<PostoAccodabile | null>(null);
  const [posizioniCoda, setPosizioniCoda] = useState<Record<string, number>>({});
  const [codaLoading, setCodaLoading] = useState(false);

  /**
   * GET /api/prenotazioni/coda: se l'utente è già in coda per questo posto e
   * questo intervallo, memorizza la posizione. È un caricamento "di supporto":
   * se fallisce, l'azione POST resta comunque disponibile.
   */
  const caricaPosizioneCoda = useCallback(
    async (posto: PostoAccodabile) => {
      setCodaLoading(true);
      try {
        const response = await fetch("/api/prenotazioni/coda");
        if (!response.ok) return;

        const payload = await response.json();
        // Confronto normalizzando data/ora: l'API può restituirle in formato ISO.
        const richiesta = (payload.data ?? []).find(
          (item: {
            postoId: string;
            data: string;
            oraInizio: string;
            oraFine: string;
            posizione: number;
          }) =>
            item.postoId === posto.id &&
            dataNormalizzata(item.data) === intervalloCoda.data &&
            oraNormalizzata(item.oraInizio) === intervalloCoda.oraInizio &&
            oraNormalizzata(item.oraFine) === intervalloCoda.oraFine,
        );

        if (richiesta) {
          setPosizioniCoda((correnti) => ({
            ...correnti,
            [posto.id]: richiesta.posizione,
          }));
        }
      } catch {
        // Silenzioso di proposito: il POST resta comunque disponibile.
      } finally {
        setCodaLoading(false);
      }
    },
    [intervalloCoda],
  );

  /**
   * POST /api/prenotazioni/coda: inserisce l'utente in lista d'attesa per il
   * posto indicato e mostra un toast con la posizione ottenuta.
   */
  const handleEntraInCoda = useCallback(
    async (posto: PostoAccodabile) => {
      setCodaLoading(true);
      try {
        const response = await fetch("/api/prenotazioni/coda", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(creaPayloadCoda(posto.id, intervalloCoda)),
        });
        const payload = await response.json();

        if (!response.ok) {
          throw new Error(payload.error || ETICHETTE_CODA.erroreGenerico);
        }

        const posizione = payload.data?.posizione;
        if (typeof posizione === "number") {
          setPosizioniCoda((correnti) => ({
            ...correnti,
            [posto.id]: posizione,
          }));
        }
        toast.success(ETICHETTE_CODA.toastSuccessTitolo, {
          description:
            typeof posizione === "number"
              ? ETICHETTE_CODA.toastSuccessDescrizione(posizione)
              : ETICHETTE_CODA.toastSuccessDescrizionePosto(posto.numero),
        });
      } catch (error) {
        toast.error(
          error instanceof Error
            ? error.message
            : ETICHETTE_CODA.erroreConnessione,
        );
      } finally {
        setCodaLoading(false);
      }
    },
    [intervalloCoda],
  );

  return {
    postoCoda,
    setPostoCoda,
    posizioniCoda,
    codaLoading,
    caricaPosizioneCoda,
    handleEntraInCoda,
  };
}
