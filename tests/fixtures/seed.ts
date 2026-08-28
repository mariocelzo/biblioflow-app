import {
  createTestDatabaseClient,
  DEFAULT_TEST_DATABASE_URL,
  getTestFixtureCounts,
  resetTestDatabase,
  seedTestDatabase,
} from "./database";

const databaseUrl = process.env.DATABASE_URL ?? DEFAULT_TEST_DATABASE_URL;

async function main(): Promise<void> {
  const { pool, prisma } = createTestDatabaseClient(databaseUrl);

  try {
    await resetTestDatabase(prisma);
    await seedTestDatabase(prisma);

    const counts = await getTestFixtureCounts(prisma);
    console.log("Fixture DB di test pronta:", counts);
  } finally {
    await prisma.$disconnect();
    await pool.end();
  }
}

main().catch((error: unknown) => {
  console.error("Preparazione fixture fallita:", error);
  process.exitCode = 1;
});
