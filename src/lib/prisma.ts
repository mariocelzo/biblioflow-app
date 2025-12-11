import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';

// Connection pool per PostgreSQL - legge da variabile ambiente
const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  throw new Error('DATABASE_URL non configurata. Controlla il file .env');
}

const pool = new Pool({ connectionString });
const adapter = new PrismaPg(pool);

// Dichiarazione per evitare multiple istanze in development
declare global {
  var prisma: PrismaClient | undefined;
}

// Crea una singola istanza del client Prisma
export const prisma = globalThis.prisma || new PrismaClient({
  adapter,
  log: process.env.NODE_ENV === 'development' 
    ? ['query', 'error', 'warn'] 
    : ['error'],
});

// In development, salva il client nel global per evitare
// multiple istanze durante hot reload
if (process.env.NODE_ENV !== 'production') {
  globalThis.prisma = prisma;
}

export default prisma;
