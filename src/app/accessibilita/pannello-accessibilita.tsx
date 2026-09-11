"use client";

// ============================================================================
// PANNELLO DELLE PREFERENZE DI ACCESSIBILITA'
// ============================================================================
// COSA: la parte interattiva di /accessibilita. Espone le preferenze che
//       `AccessibilityProvider` sa gia' applicare (alto contrasto, testo
//       grande, riduzione del movimento, dimensione del carattere) e le rende
//       finalmente raggiungibili da una pagina, non solo dal profilo.
//
// PERCHE' UN FILE A PARTE: la pagina deve poter dichiarare i `metadata` (titolo
//       e descrizione servono a chi arriva da un motore di ricerca o da un
//       segnalibro), cosa che un componente client non puo' fare. La pagina
//       resta quindi server, e qui dentro vive tutto cio' che ha bisogno di
//       stato e di `useAccessibility()`.
//
// PERCHE' FUNZIONA ANCHE SENZA LOGIN: il link "Opzioni di accessibilita'" sta
//       nel footer di /login, cioe' viene visto soprattutto da chi NON e'
//       ancora entrato. Le preferenze si applicano subito al documento (classi
//       su <html>), senza bisogno di un account. Il salvataggio permanente
//       richiede invece un profilo, ed e' detto esplicitamente nella pagina:
//       promettere una persistenza che non c'e' sarebbe peggio che non offrirla.

import Link from "next/link";
import {
  Contrast,
  Keyboard,
  MonitorSmartphone,
  MousePointerClick,
  RotateCcw,
  Type,
  Volume2,
  Zap,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Switch } from "@/components/ui/switch";
import { useAccessibility } from "@/contexts/accessibility-context";
import { cn } from "@/lib/utils";

/** Dimensioni di testo proposte, in pixel. */
const DIMENSIONI_TESTO = [
  { valore: 16, etichetta: "Normale" },
  { valore: 18, etichetta: "Grande" },
  { valore: 20, etichetta: "Molto grande" },
  { valore: 24, etichetta: "Massima" },
] as const;

/**
 * Scorciatoie da tastiera realmente gestite da `KeyboardShortcuts`
 * (src/components/accessibility/keyboard-shortcuts.tsx). L'elenco e' scritto a
 * mano e non importato perche' quel componente e' un dialog: importarlo qui
 * significherebbe trascinare in pagina Radix Dialog e la sessione per un
 * semplice elenco di testo.
 */
const SCORCIATOIE = [
  { tasti: "Alt + H", descrizione: "Vai alla home" },
  { tasti: "Alt + P", descrizione: "Prenota un posto" },
  { tasti: "Alt + R", descrizione: "Le mie prenotazioni" },
  { tasti: "Alt + L", descrizione: "Catalogo libri" },
  { tasti: "Alt + B", descrizione: "I miei prestiti" },
  { tasti: "Alt + N", descrizione: "Notifiche" },
  { tasti: "Alt + U", descrizione: "Profilo utente" },
  { tasti: "Alt + S", descrizione: "Vai al campo di ricerca" },
  { tasti: "Alt + M", descrizione: "Salta al contenuto principale" },
  { tasti: "Alt + ?", descrizione: "Mostra tutte le scorciatoie" },
] as const;

export function PannelloAccessibilita() {
  const { settings, updateSettings } = useAccessibility();

  return (
    <div className="space-y-6">
      {/* ------------------------------------------------------------------ */}
      {/* Preferenze di visualizzazione                                      */}
      {/* ------------------------------------------------------------------ */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <MonitorSmartphone className="h-5 w-5 text-primary" aria-hidden="true" />
            Preferenze di visualizzazione
          </CardTitle>
          <CardDescription>
            Le modifiche hanno effetto immediato su tutto il sito, così puoi
            valutarle mentre le attivi.
          </CardDescription>
        </CardHeader>

        <CardContent className="space-y-4">
          <PreferenzaSwitch
            id="alto-contrasto"
            icona={<Contrast className="h-4 w-4" aria-hidden="true" />}
            titolo="Alto contrasto"
            descrizione="Aumenta il contrasto tra testo e sfondo e rende i bordi più marcati."
            attiva={settings.highContrast}
            onCambia={(valore) => updateSettings({ highContrast: valore })}
          />

          <Separator />

          <PreferenzaSwitch
            id="testo-grande"
            icona={<Type className="h-4 w-4" aria-hidden="true" />}
            titolo="Testo grande"
            descrizione="Ingrandisce titoli, paragrafi e pulsanti in tutte le pagine."
            attiva={settings.largeText}
            onCambia={(valore) => updateSettings({ largeText: valore })}
          />

          <Separator />

          <PreferenzaSwitch
            id="riduzione-movimento"
            icona={<Zap className="h-4 w-4" aria-hidden="true" />}
            titolo="Riduzione del movimento"
            descrizione="Elimina animazioni e transizioni, utili a chi soffre di vertigini o chinetosi."
            attiva={settings.reducedMotion}
            onCambia={(valore) => updateSettings({ reducedMotion: valore })}
          />

          <Separator />

          <PreferenzaSwitch
            id="supporto-screen-reader"
            icona={<Volume2 className="h-4 w-4" aria-hidden="true" />}
            titolo="Ottimizza per screen reader"
            descrizione="Estende le descrizioni testuali e mantiene sempre visibile il contorno del focus."
            attiva={settings.screenReader}
            onCambia={(valore) => updateSettings({ screenReader: valore })}
          />

          <Separator />

          {/* Dimensione del carattere: pulsanti e non un cursore, perche' un
              <input type="range"> e' scomodo da usare da tastiera e quasi
              impossibile con un puntatore poco preciso. Ogni pulsante dichiara
              il proprio stato con `aria-pressed`: il colore da solo non
              basterebbe (WCAG 1.4.1). */}
          <fieldset className="space-y-3">
            <legend className="flex items-center gap-2 text-sm font-medium">
              <Type className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
              Dimensione del carattere
            </legend>
            <div className="flex flex-wrap gap-2">
              {DIMENSIONI_TESTO.map((dimensione) => {
                const selezionata = settings.fontSize === dimensione.valore;
                return (
                  <Button
                    key={dimensione.valore}
                    type="button"
                    variant={selezionata ? "default" : "outline"}
                    size="sm"
                    aria-pressed={selezionata}
                    onClick={() => updateSettings({ fontSize: dimensione.valore })}
                  >
                    {dimensione.etichetta}
                    <span className="ml-1 text-xs opacity-70">
                      {dimensione.valore}px
                    </span>
                  </Button>
                );
              })}
            </div>
          </fieldset>

          <Separator />

          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm text-muted-foreground">
              Vuoi ripartire da zero? Riporta tutto ai valori predefiniti.
            </p>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() =>
                updateSettings({
                  highContrast: false,
                  largeText: false,
                  reducedMotion: false,
                  screenReader: false,
                  fontSize: 16,
                })
              }
            >
              <RotateCcw className="mr-2 h-4 w-4" aria-hidden="true" />
              Ripristina i valori predefiniti
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* ------------------------------------------------------------------ */}
      {/* Dove si salvano queste preferenze                                  */}
      {/* ------------------------------------------------------------------ */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            Come conservare queste impostazioni
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm text-muted-foreground">
          <p>
            Le scelte fatte qui valgono per la navigazione in corso. Per
            ritrovarle a ogni accesso, salvale nel tuo profilo: da lì vengono
            memorizzate insieme agli altri dati dell&apos;account e riapplicate
            automaticamente al login.
          </p>
          <Button asChild variant="secondary" size="sm">
            <Link href="/profilo">Salva le preferenze nel profilo</Link>
          </Button>
        </CardContent>
      </Card>

      {/* ------------------------------------------------------------------ */}
      {/* Scorciatoie da tastiera                                            */}
      {/* ------------------------------------------------------------------ */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Keyboard className="h-5 w-5 text-primary" aria-hidden="true" />
            Navigazione da tastiera
          </CardTitle>
          <CardDescription>
            Tutte le funzioni di BiblioFlow sono raggiungibili senza mouse.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <ul className="space-y-2 text-sm">
            {SCORCIATOIE.map((scorciatoia) => (
              <li
                key={scorciatoia.tasti}
                className="flex items-center justify-between gap-4 border-b border-border/60 pb-2 last:border-0 last:pb-0"
              >
                <span className="text-muted-foreground">
                  {scorciatoia.descrizione}
                </span>
                <Badge variant="secondary" className="font-mono text-xs">
                  {scorciatoia.tasti}
                </Badge>
              </li>
            ))}
          </ul>

          <div className="rounded-lg bg-muted/50 p-3 text-sm text-muted-foreground">
            <p className="flex items-start gap-2">
              <MousePointerClick
                className="mt-0.5 h-4 w-4 shrink-0"
                aria-hidden="true"
              />
              <span>
                Nei menu a tendina con ricerca (per esempio il comune di
                residenza, in fase di registrazione) usa le frecce su e giù
                per scorrere le voci, Invio per confermare, Esc per chiudere,
                Inizio e Fine per saltare alla prima o all&apos;ultima.
              </span>
            </p>
          </div>
        </CardContent>
      </Card>

      {/* ------------------------------------------------------------------ */}
      {/* Dichiarazione di accessibilita'                                    */}
      {/* ------------------------------------------------------------------ */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            Dichiarazione di accessibilità
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm text-muted-foreground">
          <p>
            BiblioFlow è progettato per rispettare le linee guida WCAG 2.1
            di livello AA: struttura semantica delle pagine, contrasto adeguato,
            uso completo da tastiera, testi alternativi e riscontri annunciati
            agli screen reader.
          </p>
          <p>
            Se incontri una barriera, segnalala al personale della biblioteca:
            indica la pagina e cosa stavi provando a fare. Se hai un account,
            puoi anche annotare le tue esigenze nella sezione accessibilità
            del profilo, così il personale ne tiene conto quando prepara i
            tuoi prestiti e le tue prenotazioni.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}

/**
 * Riga "etichetta + descrizione + interruttore".
 *
 * L'interruttore e' collegato al testo con `id`/`htmlFor` e la descrizione con
 * `aria-describedby`: chi usa uno screen reader sente a cosa serve l'opzione,
 * non solo il suo nome.
 */
function PreferenzaSwitch({
  id,
  icona,
  titolo,
  descrizione,
  attiva,
  onCambia,
  className,
}: {
  id: string;
  icona: React.ReactNode;
  titolo: string;
  descrizione: string;
  attiva: boolean;
  onCambia: (valore: boolean) => void;
  className?: string;
}) {
  const idDescrizione = `${id}-descrizione`;

  return (
    <div className={cn("flex items-start justify-between gap-4", className)}>
      <div className="space-y-1">
        <Label htmlFor={id} className="flex items-center gap-2 text-sm font-medium">
          <span className="text-muted-foreground">{icona}</span>
          {titolo}
        </Label>
        <p id={idDescrizione} className="text-sm text-muted-foreground">
          {descrizione}
        </p>
      </div>
      <Switch
        id={id}
        checked={attiva}
        onCheckedChange={onCambia}
        aria-describedby={idDescrizione}
      />
    </div>
  );
}
