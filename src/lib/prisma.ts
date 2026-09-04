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

// ── Sicurezza (fix(security) A-3) ──────────────────────────────────────────
// COSA: `omit` globale che esclude `passwordHash` da OGNI risultato di LETTURA
//   del modello `User` prodotto da questo client (findUnique, findMany,
//   include: { user: ... }, ecc.).
// PERCHÉ: alcuni handler admin (`/api/admin/utenti/[id]`,
//   `/api/admin/utenti/[id]/profilo`, ...) interrogavano l'utente SENZA un
//   `select` esplicito e serializzavano l'hash della password direttamente
//   nella risposta HTTP (information disclosure delle credenziali).
// PERCHÉ È SICURO: l'`omit` globale agisce solo sulle letture e viene scavalcato
//   da un `select`/`omit` esplicito a livello di singola query. L'unico punto
//   che ha davvero bisogno dell'hash è `authorize()` in `src/lib/auth.ts`, che
//   usa `select: { ..., passwordHash: true, ... }`: quel percorso di login
//   continua a ricevere il campo. Le SCRITTURE (`create`/`update` con
//   `data.passwordHash`) non sono toccate da `omit`, quindi registrazione e
//   reset password restano invariati.
//
// NOTA TIPI: passare `omit` restringe il tipo generico del client a
//   `PrismaClient<{ omit: ... }>`, che TypeScript non considera assegnabile al
//   `PrismaClient` "nudo" usato altrove (global singleton qui sotto, annotazioni
//   nei test di baseline). L'`omit` è una barriera difensiva di RUNTIME e nessun
//   codice deve dipenderne a livello di tipo, quindi riportiamo esplicitamente
//   il tipo a `PrismaClient` con un cast.
function creaPrismaClient(): PrismaClient {
  const client = new PrismaClient({
    adapter,
    omit: {
      user: {
        passwordHash: true,
      },
    },
    log: process.env.NODE_ENV === 'development'
      ? ['query', 'error', 'warn']
      : ['error'],
  });

  return client as unknown as PrismaClient;
}

// Crea una singola istanza del client Prisma
export const prisma = globalThis.prisma || creaPrismaClient();

// In development, salva il client nel global per evitare
// multiple istanze durante hot reload
if (process.env.NODE_ENV !== 'production') {
  globalThis.prisma = prisma;
}

export default prisma;
