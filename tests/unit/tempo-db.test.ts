// ============================================================================
// formattaOraDb/formattaDataDb devono ignorare il fuso orario di chi legge
// ============================================================================
// COSA: verifica che gli helper di src/lib/tempo-db.ts formattino sempre gli
//       stessi valori "da parete" (orari e date salvati da Prisma) a
//       prescindere dal fuso orario del processo che li legge (browser o
//       server Node).
//
// PERCHE' ESISTE QUESTO TEST (difetto reale, verificato in produzione):
// una prenotazione confermata dall'API come `oraInizio: "1970-01-01T10:00:00.000Z"`
// (le colonne @db.Time sono salvate come istante UTC sulla data fittizia
// 1970-01-01) veniva mostrata come "11:00" invece di "10:00": il codice
// vecchio faceva `new Date(x).toLocaleTimeString("it-IT", {...})` SENZA
// `timeZone: "UTC"`, quindi il valore veniva convertito nel fuso LOCALE
// (Europe/Rome e' UTC+1 d'inverno, UTC+2 con l'ora legale - lo slittamento
// cambia con la data). Lo stesso vale per il campo `data` (@db.Date, salvata
// a mezzanotte UTC): in un fuso negativo (es. America/New_York, UTC-4/-5)
// scivola al giorno PRIMA.
//
// Il test impone il fuso col processo (`process.env.TZ`) invece di passare
// `timeZone` come opzione: e' cosi' che il difetto si manifestava davvero,
// dato che ne' il browser ne' il runtime Node di Vercel sono forzati su UTC
// da chi chiama `formatData`/`formatOra` nelle pagine.
//
// Nota tecnica: Node rilegge `process.env.TZ` a ogni chiamata di
// `Date/Intl` (verificato empiricamente su questo runtime), quindi cambiarlo
// a runtime nei test e' sufficiente - non serve riavviare il processo.

import { afterEach, describe, expect, it } from "vitest";
import { formattaOraDb, formattaDataDb } from "@/lib/tempo-db";

const TZ_ORIGINALE = process.env.TZ;

function conFuso<T>(fuso: string, esegui: () => T): T {
  process.env.TZ = fuso;
  try {
    return esegui();
  } finally {
    process.env.TZ = TZ_ORIGINALE;
  }
}

afterEach(() => {
  // Rete di sicurezza: se un test fallisse a meta' `conFuso` ripristina gia'
  // il fuso originale nel suo `finally`, ma un `afterEach` esplicito evita che
  // un futuro test scritto senza `conFuso` erediti un TZ alterato.
  process.env.TZ = TZ_ORIGINALE;
});

const FUSI_DA_VERIFICARE = ["Europe/Rome", "America/New_York"] as const;

describe("formattaOraDb: un orario @db.Time non dipende dal fuso di chi legge", () => {
  for (const fuso of FUSI_DA_VERIFICARE) {
    it(`[TC-TEMPO-ORA-001] con TZ=${fuso}, 1970-01-01T10:00:00.000Z resta "10:00"`, () => {
      const risultato = conFuso(fuso, () =>
        formattaOraDb("1970-01-01T10:00:00.000Z"),
      );

      expect(risultato).toBe("10:00");
    });
  }

  it("[TC-TEMPO-ORA-002] accetta anche un vero oggetto Date (Server Component)", () => {
    const risultato = conFuso("Europe/Rome", () =>
      formattaOraDb(new Date("1970-01-01T14:30:00.000Z")),
    );

    expect(risultato).toBe("14:30");
  });

  it("[TC-TEMPO-ORA-003] una stringa gia' \"HH:MM\" viene troncata senza passare da Date", () => {
    // Fallback difensivo (vedi src/components/admin/prenotazioni-actions.tsx):
    // deve funzionare anche con un fuso che sposterebbe l'ora se, per errore,
    // finisse comunque dentro `new Date(...)`.
    const risultato = conFuso("America/New_York", () => formattaOraDb("09:15:00"));

    expect(risultato).toBe("09:15");
  });

  it("[TC-TEMPO-ORA-004] valori assenti o non validi tornano il placeholder, non 'Invalid Date'", () => {
    expect(formattaOraDb(null)).toBe("--:--");
    expect(formattaOraDb(undefined)).toBe("--:--");
    expect(formattaOraDb("non-una-data")).toBe("--:--");
  });
});

describe("formattaDataDb: una data @db.Date non scivola al giorno prima in fusi negativi", () => {
  for (const fuso of FUSI_DA_VERIFICARE) {
    it(`[TC-TEMPO-DATA-001] con TZ=${fuso}, 2026-09-23T00:00:00.000Z resta il 23 settembre`, () => {
      const risultato = conFuso(fuso, () =>
        formattaDataDb("2026-09-23T00:00:00.000Z", { day: "numeric", month: "numeric", year: "numeric" }),
      );

      // "23/9/2026", mai "22/9/2026": il giorno numerico e' la prova diretta
      // che non e' scivolato indietro per effetto del fuso locale.
      expect(risultato).toContain("23");
      expect(risultato).not.toContain("22/9");
    });
  }

  it("[TC-TEMPO-DATA-002] con opzioni 'weekday long' il 23/09/2026 e' un mercoledi', mai un giovedi'", () => {
    // Stesso bug della pagina prenotazioni, versione data: il 1970-01-01
    // (data fittizia usata per un'ORA) e' un giovedi', motivo per cui
    // passare per sbaglio un campo oraInizio/oraFine a formattaDataDb
    // produrrebbe sempre "giovedi'" a prescindere dalla prenotazione reale.
    const risultato = conFuso("America/New_York", () =>
      formattaDataDb("2026-09-23T00:00:00.000Z", { weekday: "long", day: "numeric", month: "long" }),
    );

    expect(risultato.toLowerCase()).toContain("mercoled");
    expect(risultato.toLowerCase()).not.toContain("gioved");
  });

  it("[TC-TEMPO-DATA-003] non e' possibile sovrascrivere il fuso UTC dalle opzioni del chiamante", () => {
    // `timeZone` viene applicato DOPO lo spread di `opzioni` in
    // src/lib/tempo-db.ts: un chiamante che passasse per errore un proprio
    // `timeZone` non deve poter reintrodurre il difetto.
    const risultato = conFuso("America/New_York", () =>
      formattaDataDb("2026-09-23T00:00:00.000Z", {
        day: "numeric",
        month: "numeric",
        // `timeZone` e' un'opzione valida di Intl.DateTimeFormatOptions, ma
        // formattaDataDb la sovrascrive sempre con "UTC" dopo lo spread:
        // questo valore, se non venisse ignorato, farebbe scivolare la data
        // al 22 settembre.
        timeZone: "America/New_York",
      }),
    );

    expect(risultato).toContain("23");
  });

  it("[TC-TEMPO-DATA-004] valori assenti o non validi tornano il placeholder", () => {
    expect(formattaDataDb(null)).toBe("--");
    expect(formattaDataDb(undefined)).toBe("--");
    expect(formattaDataDb("non-una-data")).toBe("--");
  });
});
