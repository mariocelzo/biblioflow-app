/**
 * Test unitari per `valutaFinestraCheckIn` / `oraDbDaMinuti`
 * (src/lib/prenotazioni-regole.ts) — difetti "checkin-fuso-orario-troppo-
 * presto-sempre", "checkin-finestra-bypassata", "checkin-finestra-oraria-
 * sempre-aperta", e la finestra UNICA introdotta dopo il collaudo dal vivo
 * di settembre 2026 (prima il check-in autonomo dello studente chiudeva
 * esattamente all'inizio — tolleranza 0 — mentre lo scanner del
 * bibliotecario concedeva 15 minuti dopo: uno studente arrivato, es., 5
 * minuti in ritardo non poteva piu' fare check-in da solo pur restando
 * "suo" il posto fino al rilascio no-show).
 *
 * PERCHE' QUESTO FILE: prima la finestra di check-in veniva ricostruita in
 * TRE punti diversi (POST /check-in, PATCH azione:"check-in", scanner
 * bibliotecario), con DUE bug distinti che condividevano la stessa causa —
 * trattare le cifre di Roma salvate in `oraInizio` come se fossero gia' UTC.
 * Questo file blinda l'unica implementazione condivisa che li sostituisce,
 * ORA con una tolleranza DOPO l'inizio identica per tutti e tre i chiamanti.
 *
 * REGOLA DEL PROGETTO PER I TEST SUL TEMPO: gira SEMPRE con
 * `process.env.TZ = "UTC"` (come il server su Vercel) e con un "adesso"
 * iniettato esplicitamente — mai `new Date()` al momento del test, mai
 * l'ora legale della macchina che esegue il test. Un test che passasse solo
 * con TZ=Europe/Rome non dimostrerebbe nulla: qui si verifica sia un caso di
 * ora legale (CEST, giugno, +2h) sia uno di ora solare (CET, dicembre, +1h),
 * cosi' un'eventuale regressione a un offset fisso verrebbe presa.
 */
import { afterAll, describe, expect, it } from "vitest";
import {
  ANTICIPO_CHECK_IN_MINUTI,
  MARGINE_PENDOLARE_MINUTI,
  oraDbDaMinuti,
  tolleranzaCheckIn,
  TOLLERANZA_CHECK_IN_MINUTI,
  valutaFinestraCheckIn,
} from "@/lib/prenotazioni-regole";

const TZ_ORIGINALE = process.env.TZ;
process.env.TZ = "UTC";
afterAll(() => {
  process.env.TZ = TZ_ORIGINALE;
});

/** oraInizio ("HH:MM" di Roma) → Date nel formato @db.Time (1970-01-01 UTC). */
function oraDb(hh: number, mm: number): Date {
  return new Date(Date.UTC(1970, 0, 1, hh, mm));
}

describe("valutaFinestraCheckIn · costanti condivise", () => {
  it("[REGR] ANTICIPO_CHECK_IN_MINUTI e TOLLERANZA_CHECK_IN_MINUTI valgono entrambe 15", () => {
    expect(ANTICIPO_CHECK_IN_MINUTI).toBe(15);
    expect(TOLLERANZA_CHECK_IN_MINUTI).toBe(15);
  });

  it("[REGR] MARGINE_PENDOLARE_MINUTI vale 30 (Margine Pendolare)", () => {
    expect(MARGINE_PENDOLARE_MINUTI).toBe(30);
  });
});

/**
 * `tolleranzaCheckIn` e' l'unico punto da cui derivare il terzo argomento di
 * `valutaFinestraCheckIn` per UNA prenotazione (i tre chiamanti reali — POST
 * check-in, PATCH check-in, scanner — e la query SQL di
 * `releaseNoShowReservations` la usano tutti): deve restituire esattamente
 * TOLLERANZA_CHECK_IN_MINUTI (15) o MARGINE_PENDOLARE_MINUTI (30) a seconda
 * SOLO di `marginePendolare`, mai di altri campi.
 */
describe("tolleranzaCheckIn · seleziona la tolleranza in base al margine pendolare", () => {
  it("[TC-TOL-001] marginePendolare:false -> TOLLERANZA_CHECK_IN_MINUTI (15)", () => {
    expect(tolleranzaCheckIn({ marginePendolare: false })).toBe(15);
  });

  it("[TC-TOL-002] marginePendolare:true -> MARGINE_PENDOLARE_MINUTI (30)", () => {
    expect(tolleranzaCheckIn({ marginePendolare: true })).toBe(30);
  });
});

/**
 * Finestra UNICA: [-ANTICIPO_CHECK_IN_MINUTI, +TOLLERANZA_CHECK_IN_MINUTI)
 * rispetto all'inizio, con la tolleranza passata ESPLICITAMENTE (come fanno
 * i tre chiamanti reali) cosi' questi test restano validi anche se in futuro
 * il default della funzione cambiasse.
 *
 * Punti di confine richiesti dal collaudo dal vivo:
 *  -16  → rifiutato (troppo presto)
 *  -15  → consentito (apertura esatta)
 *    0  → consentito (esattamente all'inizio)
 *  +10  → consentito
 *  +15  → rifiutato ("scaduto"): e' lo STESSO istante in cui
 *         `releaseNoShowReservations` (now() >= inizio + 15min, disuguaglianza
 *         NON stretta) considera il posto gia' rilasciabile per no-show — non
 *         deve esistere un istante in cui qui si direbbe "consentito" mentre
 *         il posto e' gia' stato riassegnato altrove.
 *  +16  → rifiutato (scaduto)
 */
describe("valutaFinestraCheckIn · finestra unica, ora legale (CEST, Roma = UTC+2, 15 giugno)", () => {
  // oraInizio "10:00" di Roma == 08:00 UTC reali, in giugno.
  const DATA = new Date(Date.UTC(2030, 5, 15));
  const ORA_INIZIO = oraDb(10, 0);

  function esitoA(minutiDallInizio: number) {
    const adesso = new Date(
      Date.UTC(2030, 5, 15, 8, 0, 0) + minutiDallInizio * 60_000,
    );
    return valutaFinestraCheckIn(DATA, ORA_INIZIO, adesso, TOLLERANZA_CHECK_IN_MINUTI);
  }

  it("[TC-FIN-001] -16 minuti: rifiutato (troppo presto)", () => {
    expect(esitoA(-16)).toEqual({
      consentito: false,
      motivo: "troppo_presto",
      minutiMancanti: 1,
    });
  });

  it("[TC-FIN-002] -15 minuti (apertura esatta della finestra): consentito", () => {
    expect(esitoA(-15)).toEqual({ consentito: true });
  });

  it("[TC-FIN-003] 0 minuti (esattamente all'inizio): consentito", () => {
    expect(esitoA(0)).toEqual({ consentito: true });
  });

  it("[TC-FIN-004] +10 minuti: consentito", () => {
    expect(esitoA(10)).toEqual({ consentito: true });
  });

  it("[TC-FIN-005] +15 minuti: rifiutato (scaduto) — confine coerente col rilascio no-show", () => {
    expect(esitoA(15)).toEqual({
      consentito: false,
      motivo: "scaduto",
      minutiRitardo: 15,
    });
  });

  it("[TC-FIN-006] +16 minuti: rifiutato (scaduto)", () => {
    expect(esitoA(16)).toEqual({
      consentito: false,
      motivo: "scaduto",
      minutiRitardo: 16,
    });
  });
});

/**
 * Stesso scenario (ora legale, stessa prenotazione) ma con la tolleranza del
 * Margine Pendolare (30, da `MARGINE_PENDOLARE_MINUTI`/`tolleranzaCheckIn`)
 * al posto dei normali 15: la finestra si chiude 15 minuti più tardi, stesso
 * confine (disuguaglianza NON stretta) — e' lo stesso istante in cui
 * `releaseNoShowReservations` libera il posto per QUESTA prenotazione, perche'
 * la query SQL usa `CASE WHEN "marginePendolare" THEN 30 ELSE 15 END` (vedi
 * il commento in src/lib/automation-service.ts).
 *
 *  +29  → consentito (ultimo minuto valido)
 *  +30  → rifiutato ("scaduto"): confine, stesso principio di TC-FIN-005
 *  +31  → rifiutato (scaduto)
 */
describe("valutaFinestraCheckIn · Margine Pendolare (30 min), ora legale — stesso confine, tolleranza estesa", () => {
  const DATA = new Date(Date.UTC(2030, 5, 15));
  const ORA_INIZIO = oraDb(10, 0);

  function esitoConMargine(minutiDallInizio: number) {
    const adesso = new Date(
      Date.UTC(2030, 5, 15, 8, 0, 0) + minutiDallInizio * 60_000,
    );
    return valutaFinestraCheckIn(
      DATA,
      ORA_INIZIO,
      adesso,
      tolleranzaCheckIn({ marginePendolare: true }),
    );
  }

  it("[TC-TOL-003] +29 minuti: consentito (il margine pendolare estende la finestra oltre i +15 normali)", () => {
    expect(esitoConMargine(29)).toEqual({ consentito: true });
  });

  it("[TC-TOL-004] +30 minuti: rifiutato (scaduto) — confine coerente col rilascio no-show con margine attivo", () => {
    expect(esitoConMargine(30)).toEqual({
      consentito: false,
      motivo: "scaduto",
      minutiRitardo: 30,
    });
  });

  it("[TC-TOL-005] +31 minuti: rifiutato (scaduto)", () => {
    expect(esitoConMargine(31)).toEqual({
      consentito: false,
      motivo: "scaduto",
      minutiRitardo: 31,
    });
  });
});

describe("valutaFinestraCheckIn · finestra unica, ora solare (CET, Roma = UTC+1, 15 dicembre) — l'offset non e' fisso", () => {
  // Stesse cifre di Roma ("10:00"), ma qui l'offset e' +1h, non +2h: se la
  // correzione avesse un offset scritto a mano, uno dei due describe fallirebbe.
  const DATA = new Date(Date.UTC(2030, 11, 15));
  const ORA_INIZIO = oraDb(10, 0);

  function esitoA(minutiDallInizio: number) {
    // 10:00 di Roma (CET, +1h) = 09:00 UTC.
    const adesso = new Date(
      Date.UTC(2030, 11, 15, 9, 0, 0) + minutiDallInizio * 60_000,
    );
    return valutaFinestraCheckIn(DATA, ORA_INIZIO, adesso, TOLLERANZA_CHECK_IN_MINUTI);
  }

  it("[TC-FIN-007] -16 minuti: rifiutato (troppo presto)", () => {
    expect(esitoA(-16)).toEqual({
      consentito: false,
      motivo: "troppo_presto",
      minutiMancanti: 1,
    });
  });

  it("[TC-FIN-008] -15 minuti: consentito", () => {
    expect(esitoA(-15)).toEqual({ consentito: true });
  });

  it("[TC-FIN-009] 0 minuti: consentito", () => {
    expect(esitoA(0)).toEqual({ consentito: true });
  });

  it("[TC-FIN-010] +10 minuti: consentito", () => {
    expect(esitoA(10)).toEqual({ consentito: true });
  });

  it("[TC-FIN-011] +15 minuti: rifiutato (scaduto) — confine coerente col rilascio no-show", () => {
    expect(esitoA(15)).toEqual({
      consentito: false,
      motivo: "scaduto",
      minutiRitardo: 15,
    });
  });

  it("[TC-FIN-012] +16 minuti: rifiutato (scaduto)", () => {
    expect(esitoA(16)).toEqual({
      consentito: false,
      motivo: "scaduto",
      minutiRitardo: 16,
    });
  });
});

describe("valutaFinestraCheckIn · default della funzione == TOLLERANZA_CHECK_IN_MINUTI", () => {
  // oraInizio "10:00" di Roma == 08:00 UTC reali, in giugno (CEST).
  const DATA = new Date(Date.UTC(2030, 5, 15));
  const ORA_INIZIO = oraDb(10, 0);

  it("[TC-FIN-013] senza passare tolleranzaDopoMinuti, +10 minuti e' comunque consentito (default = 15, non piu' 0)", () => {
    const adesso = new Date("2030-06-15T08:10:00.000Z");
    // Nessun 4° argomento: usa il default della funzione.
    expect(valutaFinestraCheckIn(DATA, ORA_INIZIO, adesso)).toEqual({ consentito: true });
  });

  it("[TC-FIN-014] senza passare tolleranzaDopoMinuti, +15 minuti e' comunque rifiutato (stesso confine dei chiamanti espliciti)", () => {
    const adesso = new Date("2030-06-15T08:15:00.000Z");
    expect(valutaFinestraCheckIn(DATA, ORA_INIZIO, adesso)).toEqual({
      consentito: false,
      motivo: "scaduto",
      minutiRitardo: 15,
    });
  });
});

describe("valutaFinestraCheckIn · giorno diverso da oggi (fuso Roma)", () => {
  it("[TC-FIN-015] prenotazione di domani: sempre troppo presto, qualunque sia l'ora", () => {
    const oggi = new Date(Date.UTC(2030, 5, 15));
    const domani = new Date(Date.UTC(2030, 5, 16));
    const adesso = new Date("2030-06-15T20:00:00.000Z"); // tarda sera, comunque "oggi"
    const esito = valutaFinestraCheckIn(domani, oraDb(9, 0), adesso, TOLLERANZA_CHECK_IN_MINUTI);
    expect(esito).toEqual({ consentito: false, motivo: "troppo_presto" });
    // sanity: `oggi` qui sopra non e' usato nell'asserzione ma documenta lo scenario.
    void oggi;
  });

  it("[TC-FIN-016] prenotazione di ieri: sempre scaduta, qualunque sia l'ora", () => {
    const ieri = new Date(Date.UTC(2030, 5, 14));
    const adesso = new Date("2030-06-15T06:00:00.000Z"); // presto al mattino, comunque "oggi"
    const esito = valutaFinestraCheckIn(ieri, oraDb(9, 0), adesso, TOLLERANZA_CHECK_IN_MINUTI);
    expect(esito).toEqual({ consentito: false, motivo: "scaduto" });
  });
});

describe("oraDbDaMinuti · inverso parziale di minutiCorrentiBiblioteca", () => {
  it("[REGR] converte minuti dalla mezzanotte in un Date 1970-01-01 UTC (formato @db.Time)", () => {
    expect(oraDbDaMinuti(9 * 60 + 30)).toEqual(new Date(Date.UTC(1970, 0, 1, 9, 30)));
  });

  it("[REGR] normalizza modulo 1440 (un giorno): non genera mai un'ora fuori range", () => {
    expect(oraDbDaMinuti(24 * 60 + 15)).toEqual(new Date(Date.UTC(1970, 0, 1, 0, 15)));
    expect(oraDbDaMinuti(-15)).toEqual(new Date(Date.UTC(1970, 0, 1, 23, 45)));
  });
});
