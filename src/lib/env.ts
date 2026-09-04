/**
 * 🔒 Environment Variables Validation
 * 
 * Valida le variabili d'ambiente all'avvio dell'app.
 * Se manca qualcosa o il formato è sbagliato, l'app non parte.
 * 
 * Meglio crashare all'avvio che in produzione con errori strani.
 */

import { z } from 'zod';

const envSchema = z.object({
  // Database
  DATABASE_URL: z.string().min(1, 'DATABASE_URL è obbligatoria'),
  
  // NextAuth
  NEXTAUTH_URL: z.string().url('NEXTAUTH_URL deve essere un URL valido'),
  NEXTAUTH_SECRET: z.string().min(32, 'NEXTAUTH_SECRET deve essere almeno 32 caratteri'),
  
  // Google OAuth (opzionali)
  GOOGLE_CLIENT_ID: z.string().optional(),
  GOOGLE_CLIENT_SECRET: z.string().optional(),
  
  // Cron Jobs
  CRON_SECRET: z.string().min(16, 'CRON_SECRET deve essere almeno 16 caratteri').optional(),

  // Firma dei QR code (opzionale, generalo con `npm run generate:secrets`).
  // Resta OPZIONALE di proposito: la CI di GitHub Actions non puo' ricevere
  // nuovi secret, quindi renderlo obbligatorio bloccherebbe build e test.
  // Se non e' configurato, src/lib/qr-signature.ts deriva la chiave da
  // NEXTAUTH_SECRET (che e' obbligatorio): nessun default hardcoded.
  QR_SECRET: z.string().optional(),

  // Redis (opzionale)
  REDIS_URL: z.string().optional(),
  
  // App Config
  NEXT_PUBLIC_APP_NAME: z.string().default('BiblioFlow'),
  NEXT_PUBLIC_APP_URL: z.string().url().optional(),
  
  // Node Environment
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
});

// Valida le variabili d'ambiente
function validateEnv() {
  try {
    const parsed = envSchema.parse(process.env);
    
    // Validazioni aggiuntive
    if (parsed.GOOGLE_CLIENT_ID && !parsed.GOOGLE_CLIENT_SECRET) {
      throw new Error('GOOGLE_CLIENT_SECRET è richiesta se GOOGLE_CLIENT_ID è presente');
    }
    if (parsed.GOOGLE_CLIENT_SECRET && !parsed.GOOGLE_CLIENT_ID) {
      throw new Error('GOOGLE_CLIENT_ID è richiesta se GOOGLE_CLIENT_SECRET è presente');
    }
    
    return parsed;
  } catch (error) {
    console.error('❌ Errore validazione variabili d\'ambiente:');
    if (error instanceof z.ZodError) {
      error.issues.forEach((err: z.ZodIssue) => {
        console.error(`  - ${err.path.join('.')}: ${err.message}`);
      });
    } else if (error instanceof Error) {
      console.error(`  - ${error.message}`);
    }
    
    console.error('\n💡 Verifica il file .env e .env.example\n');
    process.exit(1);
  }
}

// Esporta le variabili validate
export const env = validateEnv();

// Type-safe environment variables
export type Env = z.infer<typeof envSchema>;
