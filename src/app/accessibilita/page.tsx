// ============================================================================
// PAGINA /accessibilita
// ============================================================================
// PERCHE' ESISTE: il footer di /login rimanda da sempre a "Opzioni di
// accessibilita'", ma la rotta non era mai stata creata: ogni visita finiva in
// un 404 e il solo prefetch di Next generava un errore in console su tutte le
// pagine che mostrano quel link. La rotta era gia' dichiarata pubblica in
// `src/middleware.ts`, segno che era prevista.
//
// PERCHE' CREARLA INVECE DI TOGLIERE IL LINK: le preferenze di accessibilita'
// esistono gia' e funzionano (`src/contexts/accessibility-context.tsx` applica
// alto contrasto, testo grande, riduzione del movimento e dimensione del
// carattere), ma erano raggiungibili SOLO dal profilo, cioe' solo dopo il
// login. Chi ha bisogno dell'alto contrasto per riuscire a leggere la pagina di
// accesso ne aveva bisogno prima di entrare, non dopo. Togliere il link avrebbe
// eliminato il 404 lasciando pero' il problema vero.
//
// Questo file resta un componente SERVER per poter esportare i `metadata`; la
// parte interattiva vive in `pannello-accessibilita.tsx`.

import type { Metadata } from "next";
import { Accessibility } from "lucide-react";

import { Header } from "@/components/layout/header";
import { BackButton } from "@/components/ui/back-button";

import { PannelloAccessibilita } from "./pannello-accessibilita";

export const metadata: Metadata = {
  title: "Accessibilità · BiblioFlow",
  description:
    "Preferenze di visualizzazione, scorciatoie da tastiera e dichiarazione di accessibilità di BiblioFlow, la biblioteca dell'Università di Salerno.",
};

export default function AccessibilitaPage() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-background to-primary/5">
      <Header />

      {/* `tabIndex={-1}`: senza, il salto al contenuto (link "Vai al contenuto"
          e scorciatoia Alt+M) sposterebbe la vista ma non il focus, e chi
          naviga da tastiera ripartirebbe comunque dall'inizio della pagina. */}
      <main
        id="main-content"
        tabIndex={-1}
        className="container mx-auto max-w-3xl px-4 py-8 outline-none"
      >
        <div className="mb-6">
          <BackButton href="/" />
        </div>

        <header className="mb-8 space-y-3">
          <div className="flex items-center gap-3">
            <span className="rounded-2xl bg-primary/10 p-3">
              <Accessibility className="h-7 w-7 text-primary" aria-hidden="true" />
            </span>
            <h1 className="text-3xl font-bold tracking-tight">Accessibilità</h1>
          </div>
          <p className="text-muted-foreground">
            Adatta BiblioFlow a come leggi e navighi tu. Le opzioni qui sotto
            valgono per tutto il sito e non richiedono un account.
          </p>
        </header>

        <PannelloAccessibilita />
      </main>
    </div>
  );
}
