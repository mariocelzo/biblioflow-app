-- AlterEnum
-- Quattro azioni scrivevano LogEvento con un tipo che non le descriveva:
--   registrazione utente   -> PRENOTAZIONE_CREATA
--   estensione prenotazione -> PRENOTAZIONE_CREATA
--   sollecito di un prestito -> PRESTITO_RESTITUITO
--   rinnovo dallo staff      -> PRESTITO_CREATO
-- La dashboard admin e lo storico utente le mostravano quindi come nuove
-- prenotazioni, nuovi prestiti o libri restituiti. Valori dedicati, aggiunta
-- additiva: nessun valore esistente viene rinominato o rimosso.
ALTER TYPE "TipoEvento" ADD VALUE 'UTENTE_REGISTRATO';
ALTER TYPE "TipoEvento" ADD VALUE 'PRENOTAZIONE_ESTESA';
ALTER TYPE "TipoEvento" ADD VALUE 'PRESTITO_SOLLECITATO';
ALTER TYPE "TipoEvento" ADD VALUE 'PRESTITO_RINNOVATO';
