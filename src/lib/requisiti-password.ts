// ============================================================================
// REQUISITI PASSWORD - riscontro dal vivo nel wizard di registrazione
// ============================================================================
// COSA: i quattro requisiti che una password deve soddisfare, in una forma che
//       la UI puo' mostrare uno per uno mentre l'utente digita.
//
// PERCHE': prima i requisiti comparivano solo come errori DOPO aver premuto
//       "Avanti", tutti insieme e in fondo al campo. L'utente scopriva di aver
//       sbagliato quando aveva gia' finito, e non sapeva quale delle quattro
//       regole avesse violato finche' non le rileggeva tutte. Mostrarli con una
//       spunta che si accende in tempo reale trasforma un errore in una guida
//       (HCI: feedback immediato, prevenzione dell'errore).
//
// PERCHE' UN MODULO A PARTE: `validatePassword` vive in `src/lib/password.ts`
//       insieme a bcrypt, che non puo' essere importato in un componente client.
//       Qui ci sono solo le regole (nessuna dipendenza), e un test verifica che
//       restino allineate a quelle applicate dal server: se qualcuno irrigidisse
//       la policy lato API senza aggiornare la UI, il form direbbe "va bene" e
//       la registrazione fallirebbe comunque.

export interface RequisitoPassword {
  /** Chiave stabile, usata come `key` React e negli identificativi dei test. */
  id: "lunghezza" | "maiuscola" | "minuscola" | "numero";
  /** Testo mostrato accanto alla spunta. */
  etichetta: string;
  /** Verifica il singolo requisito. */
  soddisfatto: (password: string) => boolean;
}

export const REQUISITI_PASSWORD: readonly RequisitoPassword[] = [
  {
    id: "lunghezza",
    etichetta: "Almeno 8 caratteri",
    soddisfatto: (p) => p.length >= 8,
  },
  {
    id: "maiuscola",
    etichetta: "Una lettera maiuscola",
    soddisfatto: (p) => /[A-Z]/.test(p),
  },
  {
    id: "minuscola",
    etichetta: "Una lettera minuscola",
    soddisfatto: (p) => /[a-z]/.test(p),
  },
  {
    id: "numero",
    etichetta: "Un numero",
    soddisfatto: (p) => /[0-9]/.test(p),
  },
];

/** Quanti requisiti sono gia' soddisfatti (0…4): guida la barra di forza. */
export function requisitiSoddisfatti(password: string): number {
  return REQUISITI_PASSWORD.filter((r) => r.soddisfatto(password)).length;
}

/** Le etichette dei requisiti ancora mancanti, pronte da mostrare come errori. */
export function requisitiMancanti(password: string): string[] {
  return REQUISITI_PASSWORD.filter((r) => !r.soddisfatto(password)).map(
    (r) => r.etichetta,
  );
}

/** Vera solo quando tutti i requisiti sono soddisfatti. */
export function passwordValida(password: string): boolean {
  return requisitiMancanti(password).length === 0;
}
