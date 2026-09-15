// ============================================================================
// HOME - Server Component
// ============================================================================
// DIFETTO 1 (verificato in produzione): il riquadro "Stato Biblioteca in
// Tempo Reale" mostrava SEMPRE 0 posti disponibili / 0 utenti attivi / 0%
// occupazione, con "su 150 totali" scritto a mano nel JSX. La causa: lo stato
// React era inizializzato a 0 e le uniche `setStats` esistenti in tutto il
// file aggiornavano solo `prenotazioniAttive` — nessun percorso di codice
// calcolava mai quei tre numeri. Un pannello "in tempo reale" fermo a zero e'
// peggio dell'assenza del pannello: qui si calcolano i numeri VERI dal DB.
//
// PERCHE' QUI E NON IN UNA ROUTE /api/statistiche PUBBLICA:
// il primo tentativo e' stato proprio una GET /api/statistiche pubblica,
// chiamata dal client. Verificata con una richiesta reale (`curl`), pero',
// la rotta risultava comunque bloccata con 401 "Non autenticato": il
// middleware (`src/middleware.ts`) nega di default OGNI `/api/...` che non
// sia in `publicApiPrefixes`, e quella lista vive in un file fuori dal
// perimetro di questo intervento (assegnato in esclusiva a un altro agente
// in questo CR). Estendere quella lista avrebbe richiesto di toccare
// `src/middleware.ts`, esplicitamente vietato qui.
//
// La soluzione che NON richiede quel file: calcolare le statistiche
// direttamente qui, lato server, dentro il rendering della pagina `/` —
// che e' gia' nella lista delle rotte pubbliche (`publicRoutes`) e quindi
// non passa mai dal controllo di sessione. Nessuna richiesta HTTP separata,
// nessun round-trip client, nessun problema di autorizzazione: i dati sono
// gia' nell'HTML della prima risposta, calcolati al momento della richiesta.
import { prisma } from "@/lib/prisma";
import { HomeClient } from "./home-client";

// La home e' descritta come "in tempo reale": senza questa direttiva Next.js
// potrebbe servire una versione statica/cacheata della pagina (nessuna delle
// funzioni usate qui sotto la rende dinamica di per se', dato che non legge
// cookie/headers), congelando i numeri al momento della build invece di
// ricalcolarli ad ogni richiesta.
export const dynamic = "force-dynamic";

export interface StatisticheBiblioteca {
  postiTotali: number;
  postiDisponibili: number;
  utentiAttivi: number;
  percentualeOccupazione: number;
}

const STATISTICHE_VUOTE: StatisticheBiblioteca = {
  postiTotali: 0,
  postiDisponibili: 0,
  utentiAttivi: 0,
  percentualeOccupazione: 0,
};

/**
 * Calcola lo stato reale della biblioteca dal DB.
 *
 * Nessun dato personale qui dentro: solo conteggi aggregati (quanti posti,
 * quanti liberi, quante persone hanno fatto check-in adesso). E' per questo
 * che puo' restare senza autenticazione — non c'e' nulla da proteggere.
 */
async function caricaStatisticheBiblioteca(): Promise<{
  statistiche: StatisticheBiblioteca;
  disponibili: boolean;
}> {
  try {
    // "Totali" = posti effettivamente in servizio. Un posto disattivato
    // (`attivo: false`, es. rimosso o dismesso) non e' capacita' reale della
    // biblioteca, quindi non deve contare ne' al totale ne' ai disponibili.
    const [postiTotali, postiDisponibili, utentiAttivi] = await Promise.all([
      prisma.posto.count({ where: { attivo: true } }),
      prisma.posto.count({ where: { attivo: true, stato: "DISPONIBILE" } }),
      // "Utenti attivi in questo momento" = prenotazioni con check-in gia'
      // effettuato: e' l'unico stato che rappresenta una presenza fisica
      // reale adesso, a differenza di "CONFERMATA" (prenotazione futura/
      // odierna non ancora iniziata).
      prisma.prenotazione.count({ where: { stato: "CHECK_IN" } }),
    ]);

    // Occupazione = tutto cio' che non e' liberamente prenotabile ora
    // (OCCUPATO, RISERVATO, MANUTENZIONE), sui soli posti attivi.
    const postiOccupati = Math.max(0, postiTotali - postiDisponibili);
    const percentualeOccupazione =
      postiTotali > 0 ? Math.round((postiOccupati / postiTotali) * 100) : 0;

    return {
      statistiche: { postiTotali, postiDisponibili, utentiAttivi, percentualeOccupazione },
      disponibili: true,
    };
  } catch (error) {
    // Se il calcolo fallisce (es. DB temporaneamente irraggiungibile), NON si
    // mostra uno zero finto: si segnala al client che il dato non e'
    // disponibile, cosi' la UI puo' dirlo esplicitamente invece di mentire.
    console.error("Errore nel calcolo delle statistiche biblioteca:", error);
    return { statistiche: STATISTICHE_VUOTE, disponibili: false };
  }
}

export default async function HomePage() {
  const { statistiche, disponibili } = await caricaStatisticheBiblioteca();

  return (
    <HomeClient statistiche={statistiche} statisticheDisponibili={disponibili} />
  );
}
