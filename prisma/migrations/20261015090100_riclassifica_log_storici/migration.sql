-- Riclassifica i LogEvento storici scritti con il tipo sbagliato.
-- Migrazione separata dalla precedente: PostgreSQL non permette di usare un
-- valore di enum nella stessa transazione che lo aggiunge.
-- I criteri sono quelli con cui il codice scriveva questi eventi; tutte le
-- altre righe conservano il tipo originale.

UPDATE "LogEvento"
SET "tipo" = 'UTENTE_REGISTRATO'
WHERE "tipo" = 'PRENOTAZIONE_CREATA'
  AND "prenotazioneId" IS NULL
  AND "descrizione" LIKE 'Nuovo utente registrato:%';

UPDATE "LogEvento"
SET "tipo" = 'PRENOTAZIONE_ESTESA'
WHERE "tipo" = 'PRENOTAZIONE_CREATA'
  AND "descrizione" LIKE 'Prenotazione estesa fino alle%';

UPDATE "LogEvento"
SET "tipo" = 'PRESTITO_SOLLECITATO'
WHERE "tipo" = 'PRESTITO_RESTITUITO'
  AND "dettagli"->>'azione' IN ('sollecito', 'sollecito_batch');

UPDATE "LogEvento"
SET "tipo" = 'PRESTITO_RINNOVATO'
WHERE "tipo" = 'PRESTITO_CREATO'
  AND "dettagli"->>'azione' = 'rinnovo';
