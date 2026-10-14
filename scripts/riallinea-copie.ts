// Riallinea Libro.copieDisponibili ai prestiti realmente in corso.
//
//   npx tsx scripts/riallinea-copie.ts            # dry-run: mostra le differenze
//   npx tsx scripts/riallinea-copie.ts --applica  # le corregge sul database
//
// Usa DATABASE_URL (file .env o variabile d'ambiente): per correggere
// produzione va lanciato con la sua stringa di connessione.
import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";
import pg from "pg";
import { riallineaCopieDisponibili } from "../src/lib/copie-libri";

async function main() {
  const applica = process.argv.includes("--applica");
  const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
  const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });

  try {
    const correzioni = await riallineaCopieDisponibili(prisma, { applica });
    if (correzioni.length === 0) {
      console.log("✓ Nessuna differenza: tutti i contatori sono coerenti con i prestiti.");
      return;
    }
    for (const c of correzioni) {
      console.log(`${applica ? "corretto" : "da correggere"}: "${c.titolo}" ${c.prima} -> ${c.dopo}`);
    }
    if (!applica) console.log(`\n${correzioni.length} libri da correggere. Rilancia con --applica.`);
  } finally {
    await prisma.$disconnect();
    await pool.end();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
