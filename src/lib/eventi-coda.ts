import type { TipoEvento } from "@prisma/client";

/**
 * 🧾 EVENTI_CODA — elenco condiviso dei `LogEvento.tipo` introdotti dalla
 * lista d'attesa (CR-BF-01, Fase 3/4).
 *
 * PERCHÉ ESISTE (BIB-55 / CA-06)
 * ─────────────────────────────
 * La CR aggiunge quattro valori all'enum Prisma `TipoEvento`:
 *   - `CODA_INGRESSO`   → scritto da `POST /api/prenotazioni/coda`
 *   - `CODA_PROMOZIONE` → scritto dal dominio quando il primo in coda ottiene il posto
 *   - `CODA_SCADENZA`   → scritto dal cron quando una promozione non confermata decade
 *   - `CODA_ANNULLATA`  → scritto da `annullaRichiestaCoda`
 *
 * Questi eventi vivono nella STESSA tabella `LogEvento` usata dalle metriche
 * preesistenti (dashboard admin, feed anomalie, ecc.). Il rischio descritto in
 * BIB-55 è che una query che fa uno *scan ampio* di `LogEvento` — cioè senza
 * fissare `tipo` a una allow-list — finisca per contarli come "occupazione" o
 * come "anomalie", falsando i numeri storici.
 *
 * COME USARLA
 * ───────────
 * Qualsiasi NUOVA aggregazione che legga `LogEvento` senza restringere `tipo`
 * a valori "positivi" deve escludere esplicitamente questi tipi:
 *
 *   await db.logEvento.findMany({ where: { tipo: { notIn: [...EVENTI_CODA] } } });
 *
 * NOTA sullo stato attuale del codice
 * ───────────────────────────────────
 * Alla data di BIB-55 nessuna metrica preesistente fa uno scan ampio: le query
 * di dashboard/anomalie fissano già `tipo: "NO_SHOW"` (allow-list a valore
 * singolo), quindi sono immuni per costruzione e NON vanno modificate. Questa
 * costante è quindi soprattutto una *rete di sicurezza documentata* per il
 * futuro, oltre a essere il riferimento unico usato dal test di regressione
 * `tests/integration/statistiche-coda.test.ts`.
 *
 * NON includere qui `OVERRIDE_BIBLIOTECARIO`: è un tipo PREESISTENTE e
 * legittimo (logger batch di `/api/admin/anomalie`, azioni admin varie). Se un
 * feed di anomalie dovesse mai mostrare le promozioni innescate dall'admin,
 * il sottoinsieme da escludere si riconosce da `dettagli.azione ===
 * "CANCELLAZIONE_ADMIN"`, non dal tipo.
 */
export const EVENTI_CODA = [
  "CODA_INGRESSO",
  "CODA_PROMOZIONE",
  "CODA_SCADENZA",
  "CODA_ANNULLATA",
] as const satisfies readonly TipoEvento[];

/** Union dei soli tipi di evento legati alla lista d'attesa. */
export type EventoCoda = (typeof EVENTI_CODA)[number];

/**
 * Marcatore usato da BIB-49 nel `dettagli` del `LogEvento`
 * `OVERRIDE_BIBLIOTECARIO` scritto quando una cancellazione admin promuove
 * qualcuno dalla coda. Serve a isolare quel singolo sotto-caso *senza*
 * escludere l'intero tipo `OVERRIDE_BIBLIOTECARIO` dalle metriche.
 */
export const AZIONE_PROMOZIONE_ADMIN = "CANCELLAZIONE_ADMIN" as const;
