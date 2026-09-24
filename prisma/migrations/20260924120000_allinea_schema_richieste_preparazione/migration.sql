-- DIFETTO TROVATO PREPARANDO IL COLLAUDO (non una scheda del collaudo dal
-- vivo, ma un problema scoperto allestendo un database di prova pulito):
-- nessuna migrazione precedente crea l'enum "StatoRichiesta", le tre
-- colonne di preferenze utente (User.darkMode / User.dimensioneTesto /
-- User.riduzioneMovimento) né la tabella "RichiestaPreparazione" con i suoi
-- indici e le sue foreign key — eppure tutti questi oggetti sono nello
-- schema Prisma (prisma/schema.prisma) e ESISTONO GIA' IN PRODUZIONE,
-- creati a mano con `prisma db push` invece che con una migrazione vera.
--
-- Risultato verificato: un database creato da zero con SOLO
-- `prisma migrate deploy` (nessun db push) e' incompleto — il seed fallisce
-- con "The column riduzioneMovimento of relation User does not exist in
-- the current database" appena si prova a creare il primo utente.
--
-- Questa migrazione va applicata SIA su un database vuoto (dove crea tutto
-- da zero) SIA in produzione (dove gli oggetti esistono gia'): ogni
-- istruzione e' quindi IDEMPOTENTE — "IF NOT EXISTS" dove Postgres lo
-- supporta, un blocco `DO $$ ... EXCEPTION WHEN duplicate_object` dove no
-- (CREATE TYPE ed enum, ALTER TABLE ... ADD CONSTRAINT non supportano
-- "IF NOT EXISTS" in Postgres). Provata su due database locali nel
-- container di collaudo: (a) database vuoto -> `migrate deploy` completo ->
-- `npm run db:seed` va a buon fine; (b) database gia' allineato allo schema
-- (con lo scarto applicato a mano) -> la migrazione passa senza errori.
--
-- Contenuto generato a partire da
-- `prisma migrate diff --from-config-datasource --to-schema prisma/schema.prisma --script`
-- (diff fra un database vuoto con solo le migrazioni storiche e lo schema
-- attuale), poi reso idempotente a mano riga per riga.

-- CreateEnum
DO $$ BEGIN
    CREATE TYPE "StatoRichiesta" AS ENUM ('PENDENTE', 'IN_LAVORAZIONE', 'PRONTA_RITIRO', 'COMPLETATA', 'RIFIUTATA', 'CANCELLATA');
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;

-- AlterTable
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "darkMode" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "dimensioneTesto" INTEGER NOT NULL DEFAULT 16;
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "riduzioneMovimento" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE IF NOT EXISTS "RichiestaPreparazione" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "libroId" TEXT NOT NULL,
    "stato" "StatoRichiesta" NOT NULL DEFAULT 'PENDENTE',
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "evasaAt" TIMESTAMP(3),

    CONSTRAINT "RichiestaPreparazione_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX IF NOT EXISTS "RichiestaPreparazione_userId_idx" ON "RichiestaPreparazione"("userId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "RichiestaPreparazione_libroId_idx" ON "RichiestaPreparazione"("libroId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "RichiestaPreparazione_stato_idx" ON "RichiestaPreparazione"("stato");

-- AddForeignKey
DO $$ BEGIN
    ALTER TABLE "RichiestaPreparazione" ADD CONSTRAINT "RichiestaPreparazione_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;

-- AddForeignKey
DO $$ BEGIN
    ALTER TABLE "RichiestaPreparazione" ADD CONSTRAINT "RichiestaPreparazione_libroId_fkey" FOREIGN KEY ("libroId") REFERENCES "Libro"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;
