"use client";

// ============================================================================
// COMBOBOX - menu a tendina con ricerca
// ============================================================================
// COSA: un selettore a elenco chiuso con campo di ricerca integrato, navigabile
//       interamente da tastiera.
//
// PERCHE' NON UN <Select> RADIX: il progetto ha gia' `components/ui/select.tsx`,
//       ma Radix Select non ha un campo di ricerca. Con 341 comuni campani
//       scorrere la lista sarebbe inutilizzabile: serve poter digitare.
//
// PERCHE' SCRITTO A MANO E NON `cmdk`/`react-select`: aggiungere una dipendenza
//       per un solo campo peserebbe sul bundle di una pagina pubblica (la
//       registrazione, che deve caricare in fretta su rete mobile). Il pattern
//       ARIA da implementare e' contenuto e qui e' seguito per intero.
//
// PATTERN ACCESSIBILITA' (WAI-ARIA 1.2, "Combobox with Listbox Popup"):
//   - il pulsante di apertura porta l'`id` del campo, cosi' la <Label htmlFor>
//     della pagina lo etichetta correttamente;
//   - a menu aperto il campo di ricerca ha `role="combobox"` con
//     `aria-controls` verso la listbox e `aria-activedescendant` sull'opzione
//     evidenziata: il focus DOM resta nell'input (si continua a digitare)
//     mentre lo screen reader annuncia l'opzione corrente;
//   - ogni opzione e' `role="option"` con `aria-selected`;
//   - Frecce/Home/Fine spostano l'evidenziazione, Invio sceglie, Esc chiude e
//     riporta il focus al pulsante, Tab chiude senza scegliere;
//   - una live region `sr-only` annuncia quanti risultati sono rimasti dopo
//     ogni battuta, altrimenti chi non vede la lista non ha alcun riscontro.

import * as React from "react";
import { Check, ChevronsUpDown, Search, X } from "lucide-react";

import { cn } from "@/lib/utils";

export interface OpzioneCombobox {
  /** Valore salvato nel form (per i comuni coincide con l'etichetta). */
  valore: string;
  /** Testo principale mostrato nell'opzione. */
  etichetta: string;
  /** Testo secondario, allineato a destra (es. la provincia). */
  dettaglio?: string;
}

export interface ComboboxProps {
  /** Id del pulsante: deve combaciare con la <Label htmlFor> della pagina. */
  id: string;
  /** Valore attualmente scelto ("" = nessuno). */
  value: string;
  onChange: (valore: string) => void;
  /**
   * Funzione di ricerca. Riceve il testo digitato (anche vuoto, all'apertura)
   * e restituisce le opzioni gia' filtrate, ordinate e LIMITATE: il filtro
   * vive nel modulo dati, non qui, cosi' questo componente resta riusabile.
   */
  cerca: (query: string) => OpzioneCombobox[];
  /** Testo del pulsante quando non e' stato scelto nulla. */
  placeholder?: string;
  /** Testo di aiuto dentro il campo di ricerca. */
  placeholderRicerca?: string;
  /** Messaggio quando la ricerca non produce risultati. */
  messaggioVuoto?: string;
  /**
   * Numero massimo di risultati che `cerca` puo' restituire. Serve solo a
   * capire quando la lista e' stata troncata, per dirlo all'utente invece di
   * lasciargli credere che il resto non esista.
   */
  limiteRisultati?: number;
  /** Etichetta accessibile del campo di ricerca interno. */
  etichettaRicerca?: string;
  disabled?: boolean;
  className?: string;
  "aria-describedby"?: string;
}

// NOTA: qui NON c'e' un `aria-invalid`. Il pulsante di apertura ha gia' il
// ruolo implicito `button`, che non supporta quell'attributo (ARIA lo ignora e
// jsx-a11y lo segnala). Se un giorno servisse segnalare un errore su questo
// campo, la strada corretta e' un `data-invalid` per lo stile piu' un messaggio
// collegato via `aria-describedby`, che qui e' gia' previsto.

export function Combobox({
  id,
  value,
  onChange,
  cerca,
  placeholder = "Seleziona…",
  placeholderRicerca = "Cerca…",
  messaggioVuoto = "Nessun risultato",
  limiteRisultati = 50,
  etichettaRicerca = "Cerca",
  disabled = false,
  className,
  "aria-describedby": ariaDescribedBy,
}: ComboboxProps) {
  const [aperto, setAperto] = React.useState(false);
  const [query, setQuery] = React.useState("");
  const [indiceAttivo, setIndiceAttivo] = React.useState(0);

  const contenitoreRef = React.useRef<HTMLDivElement>(null);
  const pulsanteRef = React.useRef<HTMLButtonElement>(null);
  const inputRef = React.useRef<HTMLInputElement>(null);
  const listboxRef = React.useRef<HTMLUListElement>(null);

  const idListbox = `${id}-listbox`;
  const idOpzione = (indice: number) => `${id}-opzione-${indice}`;

  // La ricerca gira a ogni battuta: la memoizziamo sul testo digitato per non
  // rifiltrare centinaia di voci a ogni render dovuto ad altro (es. hover).
  const opzioni = React.useMemo(
    () => (aperto ? cerca(query) : []),
    [aperto, cerca, query],
  );

  const troncata = opzioni.length >= limiteRisultati;

  // --- apertura / chiusura -------------------------------------------------

  const apri = React.useCallback(() => {
    if (disabled) return;
    setAperto(true);
    setQuery("");
    setIndiceAttivo(0);
    // Il focus va spostato dopo il render, quando l'input esiste davvero.
    requestAnimationFrame(() => inputRef.current?.focus());
  }, [disabled]);

  const chiudi = React.useCallback((riportaIlFocus: boolean) => {
    setAperto(false);
    setQuery("");
    // Riportare il focus al pulsante e' obbligatorio quando si chiude con Esc
    // o scegliendo: senza, il focus tornerebbe al <body> e chi naviga da
    // tastiera dovrebbe ripercorrere tutta la pagina da capo.
    if (riportaIlFocus) requestAnimationFrame(() => pulsanteRef.current?.focus());
  }, []);

  const scegli = React.useCallback(
    (opzione: OpzioneCombobox) => {
      onChange(opzione.valore);
      chiudi(true);
    },
    [chiudi, onChange],
  );

  // Chiusura al clic fuori. Si usa `pointerdown` e non `click` perche' deve
  // scattare PRIMA che il browser sposti il focus, altrimenti il pannello
  // resterebbe aperto sopra l'elemento appena cliccato.
  React.useEffect(() => {
    if (!aperto) return;

    const alClicFuori = (evento: PointerEvent) => {
      if (!contenitoreRef.current?.contains(evento.target as Node)) {
        setAperto(false);
        setQuery("");
      }
    };

    document.addEventListener("pointerdown", alClicFuori);
    return () => document.removeEventListener("pointerdown", alClicFuori);
  }, [aperto]);

  // Tiene l'opzione evidenziata dentro l'area visibile: navigando con le frecce
  // su una lista di 50 voci l'evidenziazione uscirebbe subito dallo scroll.
  React.useEffect(() => {
    if (!aperto) return;
    const nodo = listboxRef.current?.children[indiceAttivo] as
      | HTMLElement
      | undefined;
    nodo?.scrollIntoView({ block: "nearest" });
  }, [aperto, indiceAttivo]);

  // --- tastiera ------------------------------------------------------------

  const tastiPulsante = (evento: React.KeyboardEvent<HTMLButtonElement>) => {
    // Freccia giu'/su aprono il menu direttamente sulla lista: e' la scorciatoia
    // che chi naviga da tastiera si aspetta da un combobox.
    if (evento.key === "ArrowDown" || evento.key === "ArrowUp") {
      evento.preventDefault();
      apri();
    }
  };

  const tastiRicerca = (evento: React.KeyboardEvent<HTMLInputElement>) => {
    switch (evento.key) {
      case "ArrowDown":
        evento.preventDefault();
        // Scorrimento circolare: da fondo lista si torna in cima.
        setIndiceAttivo((i) => (opzioni.length === 0 ? 0 : (i + 1) % opzioni.length));
        break;
      case "ArrowUp":
        evento.preventDefault();
        setIndiceAttivo((i) =>
          opzioni.length === 0 ? 0 : (i - 1 + opzioni.length) % opzioni.length,
        );
        break;
      case "Home":
        evento.preventDefault();
        setIndiceAttivo(0);
        break;
      case "End":
        evento.preventDefault();
        setIndiceAttivo(Math.max(0, opzioni.length - 1));
        break;
      case "Enter": {
        evento.preventDefault();
        const scelta = opzioni[indiceAttivo];
        if (scelta) scegli(scelta);
        break;
      }
      case "Escape":
        evento.preventDefault();
        chiudi(true);
        break;
      case "Tab":
        // Tab NON viene bloccato: chiude il menu e lascia proseguire la
        // navigazione, com'e' previsto dal pattern ARIA.
        setAperto(false);
        setQuery("");
        break;
    }
  };

  // --- resa ----------------------------------------------------------------

  return (
    <div ref={contenitoreRef} className={cn("relative", className)}>
      <button
        ref={pulsanteRef}
        id={id}
        type="button"
        disabled={disabled}
        onClick={() => (aperto ? chiudi(true) : apri())}
        onKeyDown={tastiPulsante}
        aria-haspopup="listbox"
        aria-expanded={aperto}
        aria-describedby={ariaDescribedBy}
        className={cn(
          "border-input dark:bg-input/30 dark:hover:bg-input/50 flex h-9 w-full items-center justify-between gap-2 rounded-md border bg-transparent py-2 pl-3 text-sm shadow-xs transition-[color,box-shadow,background-color] outline-none",
          "focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px]",
          "disabled:cursor-not-allowed disabled:opacity-50",
          // Spazio a destra per la "x" di azzeramento, che e' un pulsante a se'
          // stante (un <button> dentro un <button> non sarebbe HTML valido).
          value ? "pr-16" : "pr-3",
        )}
      >
        <span
          className={cn("truncate text-left", !value && "text-muted-foreground")}
        >
          {value || placeholder}
        </span>
        <ChevronsUpDown
          className="size-4 shrink-0 opacity-50"
          aria-hidden="true"
        />
      </button>

      {/* Azzeramento rapido: il campo e' facoltativo, quindi deve essere
          possibile tornare indietro senza ricaricare la pagina. */}
      {value && !disabled && (
        <button
          type="button"
          onClick={() => {
            onChange("");
            pulsanteRef.current?.focus();
          }}
          aria-label="Cancella la selezione"
          className="text-muted-foreground hover:text-foreground focus-visible:ring-ring/50 absolute top-1/2 right-8 -translate-y-1/2 rounded-sm p-0.5 outline-none focus-visible:ring-[3px]"
        >
          <X className="size-4" aria-hidden="true" />
        </button>
      )}

      {aperto && (
        <div className="bg-popover text-popover-foreground animate-in fade-in-0 zoom-in-95 absolute z-50 mt-1 w-full overflow-hidden rounded-md border shadow-md">
          <div className="flex items-center gap-2 border-b px-3">
            <Search
              className="text-muted-foreground size-4 shrink-0"
              aria-hidden="true"
            />
            <input
              ref={inputRef}
              type="text"
              role="combobox"
              aria-expanded="true"
              aria-controls={idListbox}
              aria-autocomplete="list"
              aria-label={etichettaRicerca}
              aria-activedescendant={
                opzioni.length > 0 ? idOpzione(indiceAttivo) : undefined
              }
              autoComplete="off"
              value={query}
              placeholder={placeholderRicerca}
              onChange={(e) => {
                setQuery(e.target.value);
                // Ogni nuova ricerca riparte dalla prima voce: e' quella con
                // il punteggio migliore, quindi Invio subito dopo aver digitato
                // sceglie il risultato piu' probabile.
                setIndiceAttivo(0);
              }}
              onKeyDown={tastiRicerca}
              className="placeholder:text-muted-foreground h-9 w-full bg-transparent text-sm outline-none"
            />
          </div>

          <ul
            ref={listboxRef}
            id={idListbox}
            role="listbox"
            aria-label={etichettaRicerca}
            className="max-h-60 overflow-y-auto overscroll-contain p-1"
          >
            {opzioni.map((opzione, indice) => {
              const attiva = indice === indiceAttivo;
              const scelta = opzione.valore === value;
              return (
                <li
                  key={opzione.valore}
                  id={idOpzione(indice)}
                  role="option"
                  aria-selected={scelta}
                  // `pointerdown` invece di `click`: il click farebbe prima
                  // perdere il focus all'input e chiuderebbe il pannello.
                  onPointerDown={(e) => {
                    e.preventDefault();
                    scegli(opzione);
                  }}
                  onPointerMove={() => setIndiceAttivo(indice)}
                  className={cn(
                    "flex cursor-pointer items-center gap-2 rounded-sm px-2 py-1.5 text-sm",
                    attiva && "bg-accent text-accent-foreground",
                  )}
                >
                  <Check
                    className={cn(
                      "size-4 shrink-0",
                      scelta ? "opacity-100" : "opacity-0",
                    )}
                    aria-hidden="true"
                  />
                  <span className="truncate">{opzione.etichetta}</span>
                  {opzione.dettaglio && (
                    <span className="text-muted-foreground ml-auto shrink-0 text-xs">
                      {opzione.dettaglio}
                    </span>
                  )}
                </li>
              );
            })}
          </ul>

          {opzioni.length === 0 && (
            <p className="text-muted-foreground px-3 py-6 text-center text-sm">
              {messaggioVuoto}
            </p>
          )}

          {troncata && (
            <p className="text-muted-foreground border-t px-3 py-2 text-xs">
              Continua a digitare per restringere i risultati.
            </p>
          )}
        </div>
      )}

      {/* Riscontro per gli screen reader: senza, chi non vede la lista non ha
          modo di sapere se quello che ha digitato abbia prodotto qualcosa. */}
      <span role="status" aria-live="polite" className="sr-only">
        {aperto
          ? opzioni.length === 0
            ? messaggioVuoto
            : `${opzioni.length} risultati disponibili`
          : ""}
      </span>
    </div>
  );
}
