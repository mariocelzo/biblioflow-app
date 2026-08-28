import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";
import pg from "pg";

export const DEFAULT_TEST_DATABASE_URL =
  "postgresql://biblioflow_test@127.0.0.1:5433/biblioflow_test";

export function assertTestDatabaseUrl(databaseUrl: string): void {
  const parsedUrl = new URL(databaseUrl);
  const databaseName = parsedUrl.pathname.replace(/^\/+/, "").split("/")[0];

  if (!databaseName || !/(^|[_-])test($|[_-])/.test(databaseName.toLowerCase())) {
    throw new Error(
      `Fixture rifiutata: il database "${databaseName || "<mancante>"}" non e' identificato come database di test.`,
    );
  }
}

export function createTestDatabaseClient(databaseUrl: string): {
  pool: pg.Pool;
  prisma: PrismaClient;
} {
  assertTestDatabaseUrl(databaseUrl);

  const pool = new pg.Pool({ connectionString: databaseUrl });
  const adapter = new PrismaPg(pool);

  return {
    pool,
    prisma: new PrismaClient({ adapter }),
  };
}

export async function resetTestDatabase(prisma: PrismaClient): Promise<void> {
  await prisma.$transaction([
    prisma.logEvento.deleteMany(),
    prisma.notifica.deleteMany(),
    prisma.authToken.deleteMany(),
    prisma.prestito.deleteMany(),
    prisma.richiestaPreparazione.deleteMany(),
    prisma.prenotazione.deleteMany(),
    prisma.posto.deleteMany(),
    prisma.libro.deleteMany(),
    prisma.sala.deleteMany(),
    prisma.user.deleteMany(),
    prisma.configurazioneSistema.deleteMany(),
  ]);
}

export async function seedTestDatabase(prisma: PrismaClient): Promise<void> {
  const user = await prisma.user.create({
    data: {
      id: "test-user-studente",
      email: "studente.fixture@biblioflow.test",
      nome: "Studente",
      cognome: "Fixture",
      matricola: "TEST0001",
      ruolo: "STUDENTE",
      emailVerificata: true,
    },
  });

  const sala = await prisma.sala.create({
    data: {
      id: "test-sala-principale",
      nome: "Sala fixture",
      piano: 1,
      capienzaMax: 1,
    },
  });

  const posto = await prisma.posto.create({
    data: {
      id: "test-posto-a1",
      numero: "A1",
      salaId: sala.id,
      coordinataX: 10,
      coordinataY: 20,
    },
  });

  await prisma.prenotazione.create({
    data: {
      id: "test-prenotazione-confermata",
      userId: user.id,
      postoId: posto.id,
      data: new Date("2030-01-15T00:00:00.000Z"),
      oraInizio: new Date("1970-01-01T09:00:00.000Z"),
      oraFine: new Date("1970-01-01T11:00:00.000Z"),
      stato: "CONFERMATA",
    },
  });
}

export async function getTestFixtureCounts(prisma: PrismaClient): Promise<{
  utenti: number;
  sale: number;
  posti: number;
  prenotazioni: number;
}> {
  const [utenti, sale, posti, prenotazioni] = await Promise.all([
    prisma.user.count(),
    prisma.sala.count(),
    prisma.posto.count(),
    prisma.prenotazione.count(),
  ]);

  return { utenti, sale, posti, prenotazioni };
}
