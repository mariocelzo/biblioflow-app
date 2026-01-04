-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('STUDENTE', 'BIBLIOTECARIO', 'ADMIN');

-- CreateEnum
CREATE TYPE "StatoPosto" AS ENUM ('DISPONIBILE', 'OCCUPATO', 'MANUTENZIONE', 'RISERVATO');

-- CreateEnum
CREATE TYPE "StatoPrenotazione" AS ENUM ('CONFERMATA', 'CHECK_IN', 'COMPLETATA', 'CANCELLATA', 'NO_SHOW', 'SCADUTA');

-- CreateEnum
CREATE TYPE "StatoPrestito" AS ENUM ('ATTIVO', 'RESTITUITO', 'SCADUTO', 'RINNOVATO');

-- CreateEnum
CREATE TYPE "TipoNotifica" AS ENUM ('PRENOTAZIONE', 'CHECK_IN_REMINDER', 'SCADENZA_PRESTITO', 'SISTEMA', 'PROMO');

-- CreateEnum
CREATE TYPE "TipoEvento" AS ENUM ('PRENOTAZIONE_CREATA', 'PRENOTAZIONE_CANCELLATA', 'CHECK_IN', 'CHECK_OUT', 'NO_SHOW', 'PRESTITO_CREATO', 'PRESTITO_RESTITUITO', 'OVERRIDE_BIBLIOTECARIO');

-- CreateEnum
CREATE TYPE "TokenType" AS ENUM ('VERIF', 'RESET');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT,
    "nome" TEXT NOT NULL,
    "cognome" TEXT NOT NULL,
    "matricola" TEXT,
    "ruolo" "UserRole" NOT NULL DEFAULT 'STUDENTE',
    "isPendolare" BOOLEAN NOT NULL DEFAULT false,
    "tragittoPendolare" TEXT,
    "postoPreferito" TEXT,
    "salaPreferita" TEXT,
    "necessitaAccessibilita" BOOLEAN NOT NULL DEFAULT false,
    "preferenzeAccessibilita" TEXT,
    "altoContrasto" BOOLEAN NOT NULL DEFAULT false,
    "notifichePush" BOOLEAN NOT NULL DEFAULT true,
    "notificheEmail" BOOLEAN NOT NULL DEFAULT true,
    "emailVerificata" BOOLEAN NOT NULL DEFAULT false,
    "attivo" BOOLEAN NOT NULL DEFAULT true,
    "ultimoAccesso" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Sala" (
    "id" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "piano" INTEGER NOT NULL,
    "descrizione" TEXT,
    "isSilenziosa" BOOLEAN NOT NULL DEFAULT false,
    "isGruppi" BOOLEAN NOT NULL DEFAULT false,
    "capienzaMax" INTEGER NOT NULL,
    "orarioApertura" TEXT NOT NULL DEFAULT '08:00',
    "orarioChiusura" TEXT NOT NULL DEFAULT '22:00',
    "attiva" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Sala_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Posto" (
    "id" TEXT NOT NULL,
    "numero" TEXT NOT NULL,
    "salaId" TEXT NOT NULL,
    "coordinataX" DOUBLE PRECISION NOT NULL,
    "coordinataY" DOUBLE PRECISION NOT NULL,
    "haPresaElettrica" BOOLEAN NOT NULL DEFAULT false,
    "haFinestra" BOOLEAN NOT NULL DEFAULT false,
    "isAccessibile" BOOLEAN NOT NULL DEFAULT false,
    "tavoloRegolabile" BOOLEAN NOT NULL DEFAULT false,
    "stato" "StatoPosto" NOT NULL DEFAULT 'DISPONIBILE',
    "attivo" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Posto_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Prenotazione" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "postoId" TEXT NOT NULL,
    "data" DATE NOT NULL,
    "oraInizio" TIME NOT NULL,
    "oraFine" TIME NOT NULL,
    "stato" "StatoPrenotazione" NOT NULL DEFAULT 'CONFERMATA',
    "checkInAt" TIMESTAMP(3),
    "checkOutAt" TIMESTAMP(3),
    "marginePendolare" BOOLEAN NOT NULL DEFAULT false,
    "minutiMarginePendolare" INTEGER NOT NULL DEFAULT 30,
    "estesa" BOOLEAN NOT NULL DEFAULT false,
    "oraFineOriginale" TIME,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Prenotazione_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Libro" (
    "id" TEXT NOT NULL,
    "isbn" TEXT NOT NULL,
    "titolo" TEXT NOT NULL,
    "autore" TEXT NOT NULL,
    "editore" TEXT,
    "anno" INTEGER,
    "categoria" TEXT,
    "descrizione" TEXT,
    "scaffale" TEXT,
    "piano" INTEGER,
    "copieTotali" INTEGER NOT NULL DEFAULT 1,
    "copieDisponibili" INTEGER NOT NULL DEFAULT 1,
    "copertina" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Libro_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Prestito" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "libroId" TEXT NOT NULL,
    "dataPrestito" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "dataScadenza" TIMESTAMP(3) NOT NULL,
    "dataRestituzione" TIMESTAMP(3),
    "stato" "StatoPrestito" NOT NULL DEFAULT 'ATTIVO',
    "rinnovi" INTEGER NOT NULL DEFAULT 0,
    "maxRinnovi" INTEGER NOT NULL DEFAULT 2,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Prestito_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Notifica" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "tipo" "TipoNotifica" NOT NULL,
    "titolo" TEXT NOT NULL,
    "messaggio" TEXT NOT NULL,
    "actionUrl" TEXT,
    "actionLabel" TEXT,
    "letta" BOOLEAN NOT NULL DEFAULT false,
    "lettaAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Notifica_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LogEvento" (
    "id" TEXT NOT NULL,
    "tipo" "TipoEvento" NOT NULL,
    "userId" TEXT,
    "targetUserId" TEXT,
    "prenotazioneId" TEXT,
    "descrizione" TEXT,
    "dettagli" JSONB,
    "ip" TEXT,
    "userAgent" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LogEvento_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ConfigurazioneSistema" (
    "id" TEXT NOT NULL,
    "chiave" TEXT NOT NULL,
    "valore" TEXT NOT NULL,
    "tipo" TEXT NOT NULL DEFAULT 'string',
    "descrizione" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ConfigurazioneSistema_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuthToken" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "type" "TokenType" NOT NULL,
    "used" BOOLEAN NOT NULL DEFAULT false,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuthToken_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "User_matricola_key" ON "User"("matricola");

-- CreateIndex
CREATE INDEX "User_email_idx" ON "User"("email");

-- CreateIndex
CREATE INDEX "User_matricola_idx" ON "User"("matricola");

-- CreateIndex
CREATE INDEX "User_ruolo_idx" ON "User"("ruolo");

-- CreateIndex
CREATE INDEX "Sala_piano_idx" ON "Sala"("piano");

-- CreateIndex
CREATE INDEX "Posto_stato_idx" ON "Posto"("stato");

-- CreateIndex
CREATE INDEX "Posto_salaId_idx" ON "Posto"("salaId");

-- CreateIndex
CREATE UNIQUE INDEX "Posto_salaId_numero_key" ON "Posto"("salaId", "numero");

-- CreateIndex
CREATE INDEX "Prenotazione_userId_idx" ON "Prenotazione"("userId");

-- CreateIndex
CREATE INDEX "Prenotazione_postoId_idx" ON "Prenotazione"("postoId");

-- CreateIndex
CREATE INDEX "Prenotazione_data_idx" ON "Prenotazione"("data");

-- CreateIndex
CREATE INDEX "Prenotazione_stato_idx" ON "Prenotazione"("stato");

-- CreateIndex
CREATE UNIQUE INDEX "Libro_isbn_key" ON "Libro"("isbn");

-- CreateIndex
CREATE INDEX "Libro_titolo_idx" ON "Libro"("titolo");

-- CreateIndex
CREATE INDEX "Libro_autore_idx" ON "Libro"("autore");

-- CreateIndex
CREATE INDEX "Libro_isbn_idx" ON "Libro"("isbn");

-- CreateIndex
CREATE INDEX "Prestito_userId_idx" ON "Prestito"("userId");

-- CreateIndex
CREATE INDEX "Prestito_libroId_idx" ON "Prestito"("libroId");

-- CreateIndex
CREATE INDEX "Prestito_stato_idx" ON "Prestito"("stato");

-- CreateIndex
CREATE INDEX "Prestito_dataScadenza_idx" ON "Prestito"("dataScadenza");

-- CreateIndex
CREATE INDEX "Notifica_userId_idx" ON "Notifica"("userId");

-- CreateIndex
CREATE INDEX "Notifica_letta_idx" ON "Notifica"("letta");

-- CreateIndex
CREATE INDEX "Notifica_createdAt_idx" ON "Notifica"("createdAt");

-- CreateIndex
CREATE INDEX "LogEvento_tipo_idx" ON "LogEvento"("tipo");

-- CreateIndex
CREATE INDEX "LogEvento_userId_idx" ON "LogEvento"("userId");

-- CreateIndex
CREATE INDEX "LogEvento_createdAt_idx" ON "LogEvento"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "ConfigurazioneSistema_chiave_key" ON "ConfigurazioneSistema"("chiave");

-- CreateIndex
CREATE INDEX "ConfigurazioneSistema_chiave_idx" ON "ConfigurazioneSistema"("chiave");

-- CreateIndex
CREATE UNIQUE INDEX "AuthToken_token_key" ON "AuthToken"("token");

-- CreateIndex
CREATE INDEX "AuthToken_userId_idx" ON "AuthToken"("userId");

-- CreateIndex
CREATE INDEX "AuthToken_type_idx" ON "AuthToken"("type");

-- CreateIndex
CREATE INDEX "AuthToken_expiresAt_idx" ON "AuthToken"("expiresAt");

-- AddForeignKey
ALTER TABLE "Posto" ADD CONSTRAINT "Posto_salaId_fkey" FOREIGN KEY ("salaId") REFERENCES "Sala"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Prenotazione" ADD CONSTRAINT "Prenotazione_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Prenotazione" ADD CONSTRAINT "Prenotazione_postoId_fkey" FOREIGN KEY ("postoId") REFERENCES "Posto"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Prestito" ADD CONSTRAINT "Prestito_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Prestito" ADD CONSTRAINT "Prestito_libroId_fkey" FOREIGN KEY ("libroId") REFERENCES "Libro"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Notifica" ADD CONSTRAINT "Notifica_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LogEvento" ADD CONSTRAINT "LogEvento_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LogEvento" ADD CONSTRAINT "LogEvento_targetUserId_fkey" FOREIGN KEY ("targetUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LogEvento" ADD CONSTRAINT "LogEvento_prenotazioneId_fkey" FOREIGN KEY ("prenotazioneId") REFERENCES "Prenotazione"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuthToken" ADD CONSTRAINT "AuthToken_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
