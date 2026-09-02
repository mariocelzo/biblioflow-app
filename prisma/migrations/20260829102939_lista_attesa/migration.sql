-- CreateEnum
CREATE TYPE "StatoListaAttesa" AS ENUM ('IN_ATTESA', 'PROMOSSA', 'SCADUTA', 'ANNULLATA');

-- CreateTable
CREATE TABLE "ListaAttesa" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "postoId" TEXT NOT NULL,
    "data" DATE NOT NULL,
    "oraInizio" TIME NOT NULL,
    "oraFine" TIME NOT NULL,
    "stato" "StatoListaAttesa" NOT NULL DEFAULT 'IN_ATTESA',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ListaAttesa_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ListaAttesa_fifo_idx"
ON "ListaAttesa"("postoId", "data", "oraInizio", "oraFine", "stato", "createdAt", "id")
WHERE "stato" = 'IN_ATTESA';

-- Impedisce soltanto duplicati attivi dello stesso intervallo. Le richieste
-- ANNULLATA, SCADUTA o PROMOSSA restano nello storico e non bloccano il rientro.
CREATE UNIQUE INDEX "ListaAttesa_in_attesa_user_intervallo_key"
ON "ListaAttesa"("userId", "postoId", "data", "oraInizio", "oraFine")
WHERE "stato" = 'IN_ATTESA';

-- AddForeignKey
ALTER TABLE "ListaAttesa" ADD CONSTRAINT "ListaAttesa_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ListaAttesa" ADD CONSTRAINT "ListaAttesa_postoId_fkey" FOREIGN KEY ("postoId") REFERENCES "Posto"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
