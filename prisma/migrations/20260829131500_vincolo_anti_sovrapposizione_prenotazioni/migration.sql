-- btree_gist rende disponibile l'operatore di uguaglianza GiST per posto e data.
CREATE EXTENSION IF NOT EXISTS btree_gist;

-- Prisma non esprime nativamente gli exclusion constraint. Gli intervalli sono
-- semiaperti: due prenotazioni adiacenti (es. 09:00-10:00 e 10:00-11:00)
-- restano valide, mentre ogni sovrapposizione CONFERMATA sullo stesso posto e
-- giorno viene rifiutata atomicamente dal database.
ALTER TABLE "Prenotazione"
ADD CONSTRAINT "Prenotazione_no_overlap_confermata_excl"
EXCLUDE USING gist (
    "postoId" WITH =,
    "data" WITH =,
    tsrange("data" + "oraInizio", "data" + "oraFine", '[)') WITH &&
)
WHERE ("stato" = 'CONFERMATA');
