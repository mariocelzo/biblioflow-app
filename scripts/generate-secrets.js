#!/usr/bin/env node

/**
 * Script per generare secrets sicuri per produzione
 * 
 * Uso:
 *   npm run generate:secrets
 *   node scripts/generate-secrets.js
 * 
 * Genera:
 *   - NEXTAUTH_SECRET (32 bytes base64)
 *   - QR_SECRET (32 bytes base64)
 *   - CRON_SECRET (UUID v4)
 */

const crypto = require('crypto');

console.log('🔐 BiblioFlow - Generatore Secrets Produzione\n');
console.log('='.repeat(60));
console.log('');

// Genera NEXTAUTH_SECRET
const nextAuthSecret = crypto.randomBytes(32).toString('base64');
console.log('📌 NEXTAUTH_SECRET (JWT e session encryption):');
console.log(`NEXTAUTH_SECRET="${nextAuthSecret}"`);
console.log('');

// Genera QR_SECRET
const qrSecret = crypto.randomBytes(32).toString('base64');
console.log('📌 QR_SECRET (Firma crittografica QR codes):');
console.log(`QR_SECRET="${qrSecret}"`);
console.log('');

// Genera CRON_SECRET
const cronSecret = crypto.randomUUID();
console.log('📌 CRON_SECRET (Protezione endpoint cron):');
console.log(`CRON_SECRET="${cronSecret}"`);
console.log('');

console.log('='.repeat(60));
console.log('');
console.log('✅ Secrets generati con successo!');
console.log('');
console.log('📋 Prossimi passi:');
console.log('');
console.log('1. Copia i secrets sopra nel tuo file .env.production');
console.log('2. Aggiungi DATABASE_URL e NEXTAUTH_URL');
console.log('3. (Opzionale) Aggiungi UPSTASH_REDIS_REST_URL/TOKEN');
console.log('');
console.log('💡 Per Vercel deployment:');
console.log('   - Vai su: Vercel Dashboard → Settings → Environment Variables');
console.log('   - Aggiungi ogni variabile manualmente');
console.log('   - Seleziona Environment: Production');
console.log('');
console.log('⚠️  IMPORTANTE: Non committare mai i secrets nel repository!');
console.log('   Assicurati che .env.production sia in .gitignore');
console.log('');
