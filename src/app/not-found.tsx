// ============================================================================
// PAGINA 404 - "pagina non trovata"
// ============================================================================
// PERCHE' ESISTE: senza un `not-found.tsx` Next mostra la sua schermata
// predefinita: fondo nero, "This page could not be found." e nessun riferimento
// a BiblioFlow. In un'applicazione interamente in italiano e con un proprio
// design system e' un salto brusco, e chi ci finisce non ha nemmeno un modo
// evidente per tornare indietro: la pagina predefinita non offre alcun link.
//
// PERCHE' E' UN COMPONENTE SERVER: non serve alcuno stato. Cosi' la 404 non
// trascina JavaScript aggiuntivo e resta utilizzabile anche se il bundle client
// non si carica - proprio il caso in cui e' piu' probabile finire su un errore.
//
// SCELTE DI ACCESSIBILITA':
//   - un solo <h1>, che dice cos'e' successo ("Pagina non trovata"), mentre il
//     "404" resta decorativo (`aria-hidden`): letto da uno screen reader sarebbe
//     rumore, il contenuto informativo e' il titolo;
//   - i due percorsi di uscita sono link veri (<Link>), quindi navigabili da
//     tastiera e apribili in una nuova scheda, non pulsanti con `onClick`;
//   - lo sfondo usa le stesse varianti chiaro/scuro delle pagine di
//     autenticazione, cosi' la 404 rispetta il tema come il resto del sito.

import type { Metadata } from "next";
import Link from "next/link";
import { BookOpen, Compass, Home, LibraryBig, Search } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
} from "@/components/ui/card";

export const metadata: Metadata = {
  title: "Pagina non trovata · BiblioFlow",
  description:
    "La pagina che cerchi non esiste o è stata spostata. Torna alla home di BiblioFlow o cerca nel catalogo della biblioteca.",
};

/** Scorciatoie verso le sezioni piu' usate: una 404 senza vie d'uscita e' un
 *  vicolo cieco, e l'utente puo' solo premere "indietro" o abbandonare.
 *  Sono rotte protette: a chi non ha ancora fatto l'accesso il middleware
 *  propone il login conservando `callbackUrl`, quindi il percorso si conclude
 *  comunque sulla pagina scelta. */
const DESTINAZIONI = [
  {
    href: "/libri",
    icona: BookOpen,
    titolo: "Catalogo libri",
    descrizione: "Cerca un titolo e richiedi un prestito",
  },
  {
    href: "/prenota",
    icona: Compass,
    titolo: "Prenota un posto",
    descrizione: "Scegli aula, posto e orario in biblioteca",
  },
  {
    href: "/prenotazioni",
    icona: LibraryBig,
    titolo: "Le mie prenotazioni",
    descrizione: "Controlla o modifica le prenotazioni attive",
  },
] as const;

export default function NotFound() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-50 via-white to-blue-50 dark:from-slate-950 dark:via-background dark:to-slate-900 p-4">
      <div className="w-full max-w-xl space-y-6">
        <Card className="border-0 shadow-xl">
          <CardHeader className="space-y-4 text-center">
            <div className="flex justify-center">
              <div className="rounded-2xl bg-blue-100 dark:bg-blue-900 p-4">
                <Search
                  className="h-10 w-10 text-blue-600 dark:text-blue-400"
                  aria-hidden="true"
                />
              </div>
            </div>

            {/* Decorativo: l'informazione utile la da' il titolo qui sotto. */}
            <p
              className="text-5xl font-bold tracking-tight text-muted-foreground/40"
              aria-hidden="true"
            >
              404
            </p>

            {/* Un <h1> vero e non <CardTitle>: quel componente rende un <div>,
                quindi la pagina sarebbe rimasta senza intestazione di primo
                livello e chi naviga per titoli con lo screen reader non
                avrebbe trovato nulla da cui partire. */}
            <h1 className="text-3xl font-bold tracking-tight text-foreground">
              Pagina non trovata
            </h1>
            <CardDescription className="text-base text-muted-foreground">
              L&apos;indirizzo che hai aperto non esiste, oppure la pagina è
              stata spostata. Può succedere con un vecchio segnalibro o con un
              link incompleto.
            </CardDescription>
          </CardHeader>

          <CardContent className="space-y-6">
            <div className="flex flex-col gap-3 sm:flex-row">
              <Button asChild className="w-full sm:flex-1">
                <Link href="/">
                  <Home className="mr-2 h-4 w-4" aria-hidden="true" />
                  Torna alla home
                </Link>
              </Button>
              <Button asChild variant="outline" className="w-full sm:flex-1">
                <Link href="/libri">
                  <Search className="mr-2 h-4 w-4" aria-hidden="true" />
                  Cerca nel catalogo
                </Link>
              </Button>
            </div>

            <nav aria-label="Sezioni principali di BiblioFlow">
              <h2 className="mb-3 text-sm font-medium text-muted-foreground">
                Forse stavi cercando
              </h2>
              <ul className="space-y-2">
                {DESTINAZIONI.map((destinazione) => {
                  const Icona = destinazione.icona;
                  return (
                    <li key={destinazione.href}>
                      <Link
                        href={destinazione.href}
                        className="flex items-start gap-3 rounded-lg border border-border p-3 transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
                      >
                        <Icona
                          className="mt-0.5 h-5 w-5 shrink-0 text-primary"
                          aria-hidden="true"
                        />
                        <span>
                          <span className="block text-sm font-medium">
                            {destinazione.titolo}
                          </span>
                          <span className="block text-sm text-muted-foreground">
                            {destinazione.descrizione}
                          </span>
                        </span>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </nav>
          </CardContent>
        </Card>

        <p className="text-center text-sm text-muted-foreground">
          Hai bisogno di impostazioni di lettura diverse?{" "}
          <Link href="/accessibilita" className="text-primary hover:underline">
            Opzioni di accessibilità
          </Link>
        </p>
      </div>
    </div>
  );
}
