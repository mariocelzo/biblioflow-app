/**
 * Test unitari per `valutaFinestraCheckIn` / `oraDbDaMinuti`
 * (src/lib/prenotazioni-regole.ts) — difetti "checkin-fuso-orario-troppo-
 * presto-sempre", "checkin-finestra-bypassata", "checkin-finestra-oraria-
 * sempre-aperta".
 *
 * PERCHE' QUESTO FILE: prima la finestra di check-in veniva ricostruita in
 * TRE punti diversi (POST /check-in, PATCH azione:"check-in", scanner
 * bibliotecario), con DUE bug distinti che condividevano la stessa causa —
 * trattare le cifre di Roma salvate in `oraInizio` come se fossero gia' UTC.
 * Questo file blinda l'unica implementazione condivisa che li sostituisce.
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
  oraDbDaMinuti,
  TOLLERANZA_CHECK_IN_SCANNER_MINUTI,
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

describe("valutaFinestraCheckIn · ANTICIPO_CHECK_IN_MINUTI e' 15", () => {
  it("[REGR] la costante condivisa vale 15 minuti", () => {
    expect(ANTICIPO_CHECK_IN_MINUTI).toBe(15);
    expect(TOLLERANZA_CHECK_IN_SCANNER_MINUTI).toBe(15);
  });
});

describe("valutaFinestraCheckIn · ora legale (CEST, Roma = UTC+2, 15 giugno)", () => {
  // oraInizio "10:00" di Roma == 08:00 UTC reali, in giugno.
  const DATA = new Date(Date.UTC(2030, 5, 15));
  const ORA_INIZIO = oraDb(10, 0);

  it("[TC-FIN-001] BUG STORICO: un istante ricostruito con Date.UTC() (senza offset Europe/Rome) avrebbe detto 'troppo presto' anche a slot gia' iniziato da 10 minuti reali — qui deve essere 'scaduto' (tolleranza 0), MAI 'troppo_presto'", () => {
    // 08:10 UTC = 10:10 di Roma: 10 minuti REALI dopo l'inizio dichiarato
    // (10:00 di Roma). Il difetto storico (Date.UTC(..., oraInizio.getUTCHours())
    // senza offset) avrebbe qui risposto "troppo presto" perche' confrontava
    // 08:10 UTC con un "inizio" ricostruito come 10:00 UTC (le cifre di Roma
    // lette come se fossero gia' UTC): 08:10 < 10:00 → sempre "troppo presto",
    // anche a slot ampiamente iniziato in orario REALE di Roma.
    const adesso = new Date("2030-06-15T08:10:00.000Z");
    const esito = valutaFinestraCheckIn(DATA, ORA_INIZIO, adesso);
    expect(esito).toEqual({ consentito: false, motivo: "scaduto", minutiRitardo: 10 });
  });

  it("[TC-FIN-002] 15 minuti PRIMA (apertura esatta della finestra): consentito", () => {
    // 07:45 UTC = 09:45 di Roma.
    const adesso = new Date("2030-06-15T07:45:00.000Z");
    expect(valutaFinestraCheckIn(DATA, ORA_INIZIO, adesso)).toEqual({ consentito: true });
  });

  it("[TC-FIN-003] 16 minuti prima: troppo presto (tolleranza 0 di default)", () => {
    // 07:44 UTC = 09:44 di Roma.
    const adesso = new Date("2030-06-15T07:44:00.000Z");
    const esito = valutaFinestraCheckIn(DATA, ORA_INIZIO, adesso);
    expect(esito).toEqual({ consentito: false, motivo: "troppo_presto", minutiMancanti: 1 });
  });

  it("[TC-FIN-004] esattamente all'inizio: ancora consentito (chiude ALL'inizio, non prima)", () => {
    const adesso = new Date("2030-06-15T08:00:00.000Z");
    expect(valutaFinestraCheckIn(DATA, ORA_INIZIO, adesso)).toEqual({ consentito: true });
  });

  it("[TC-FIN-005] 1 minuto dopo l'inizio: scaduto con tolleranza 0 (check-in autonomo)", () => {
    const adesso = new Date("2030-06-15T08:01:00.000Z");
    const esito = valutaFinestraCheckIn(DATA, ORA_INIZIO, adesso);
    expect(esito).toEqual({ consentito: false, motivo: "scaduto", minutiRitardo: 1 });
  });

  it("[TC-FIN-006] 1 minuto dopo l'inizio ma con la tolleranza dello SCANNER (15): ancora consentito", () => {
    const adesso = new Date("2030-06-15T08:01:00.000Z");
    const esito = valutaFinestraCheckIn(
      DATA,
      ORA_INIZIO,
      adesso,
      TOLLERANZA_CHECK_IN_SCANNER_MINUTI,
    );
    expect(esito).toEqual({ consentito: true });
  });

  it("[TC-FIN-007] 16 minuti dopo l'inizio, anche con la tolleranza dello scanner: scaduto", () => {
    const adesso = new Date("2030-06-15T08:16:00.000Z");
    const esito = valutaFinestraCheckIn(
      DATA,
      ORA_INIZIO,
      adesso,
      TOLLERANZA_CHECK_IN_SCANNER_MINUTI,
    );
    expect(esito).toEqual({ consentito: false, motivo: "scaduto", minutiRitardo: 16 });
  });
});

describe("valutaFinestraCheckIn · ora solare (CET, Roma = UTC+1, 15 dicembre) — l'offset non e' fisso", () => {
  // Stesse cifre di Roma ("10:00"), ma qui l'offset e' +1h, non +2h: se la
  // correzione avesse un offset scritto a mano, uno dei due describe fallirebbe.
  const DATA = new Date(Date.UTC(2030, 11, 15));
  const ORA_INIZIO = oraDb(10, 0);

  it("[TC-FIN-008] con la tolleranza dello scanner (15), 10 minuti dopo l'inizio reale (09:00 UTC = 10:00 Roma, CET) e' ancora consentito", () => {
    const adesso = new Date("2030-12-15T09:10:00.000Z");
    const esito = valutaFinestraCheckIn(
      DATA,
      ORA_INIZIO,
      adesso,
      TOLLERANZA_CHECK_IN_SCANNER_MINUTI,
    );
    expect(esito).toEqual({ consentito: true });
  });

  it("[TC-FIN-009] 40 minuti dopo l'inizio reale, anche con la tolleranza dello scanner: scaduto (conferma che l'offset CET e' applicato correttamente, non ignorato)", () => {
    const adesso = new Date("2030-12-15T09:40:00.000Z"); // 40 min dopo le 09:00 UTC reali
    const esito = valutaFinestraCheckIn(
      DATA,
      ORA_INIZIO,
      adesso,
      TOLLERANZA_CHECK_IN_SCANNER_MINUTI,
    );
    expect(esito).toEqual({ consentito: false, motivo: "scaduto", minutiRitardo: 40 });
  });
});

describe("valutaFinestraCheckIn · giorno diverso da oggi (fuso Roma)", () => {
  it("[TC-FIN-010] prenotazione di domani: sempre troppo presto, qualunque sia l'ora", () => {
    const oggi = new Date(Date.UTC(2030, 5, 15));
    const domani = new Date(Date.UTC(2030, 5, 16));
    const adesso = new Date("2030-06-15T20:00:00.000Z"); // tarda sera, comunque "oggi"
    const esito = valutaFinestraCheckIn(domani, oraDb(9, 0), adesso);
    expect(esito).toEqual({ consentito: false, motivo: "troppo_presto" });
    // sanity: `oggi` qui sopra non e' usato nell'asserzione ma documenta lo scenario.
    void oggi;
  });

  it("[TC-FIN-011] prenotazione di ieri: sempre scaduta, qualunque sia l'ora", () => {
    const ieri = new Date(Date.UTC(2030, 5, 14));
    const adesso = new Date("2030-06-15T06:00:00.000Z"); // presto al mattino, comunque "oggi"
    const esito = valutaFinestraCheckIn(ieri, oraDb(9, 0), adesso);
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
