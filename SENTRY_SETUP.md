# Sentry Setup Instructions

Sentry è configurato per tracciare errori in produzione. È **opzionale** ma **fortemente consigliato**.

## Setup Rapido (5 minuti)

### 1. Crea Account Sentry (Free)
1. Vai su https://sentry.io/signup/
2. Crea un account gratuito
3. Crea un nuovo progetto:
   - Platform: **Next.js**
   - Nome progetto: **biblioflow-app**

### 2. Ottieni il DSN
Dopo aver creato il progetto, copia il **DSN** (Data Source Name) che appare nella pagina di setup.

Formato: `https://xxxxx@xxxxx.ingest.sentry.io/xxxxx`

### 3. Aggiungi al .env
```bash
# Nel tuo file .env locale
NEXT_PUBLIC_SENTRY_DSN="https://xxxxx@xxxxx.ingest.sentry.io/xxxxx"
```

### 4. Aggiungi su Vercel
1. Vai su https://vercel.com/dashboard
2. Seleziona il progetto **biblioflow-app**
3. Settings → Environment Variables
4. Aggiungi:
   - Key: `NEXT_PUBLIC_SENTRY_DSN`
   - Value: il tuo DSN
   - Environment: Production, Preview, Development

### 5. Deploy
```bash
git add .
git commit -m "feat: add Sentry error monitoring"
git push
```

Vercel farà automaticamente il deploy e Sentry inizierà a tracciare gli errori.

## Come Testare

### Test Locale
1. Avvia il dev server: `npm run dev`
2. Apri http://localhost:3000
3. Prova a generare un errore (es. chiama un'API che non esiste)
4. Vai su Sentry → Issues e dovresti vedere l'errore

### Test Produzione
Sentry traccia automaticamente:
- ❌ Errori JavaScript nel browser
- ❌ Errori nelle API routes
- ❌ Errori nei cron jobs
- ❌ Errori Edge Runtime (middleware)
- 📹 Session Replay (opzionale - vedi cosa ha fatto l'utente prima dell'errore)

## Benefici

1. **Notifiche Email**: Ricevi email quando ci sono errori critici
2. **Stack Traces**: Vedi esattamente dove è crashato il codice
3. **User Context**: Chi era l'utente, cosa stava facendo
4. **Performance**: Monitora performance API
5. **Cron Monitoring**: Vercel Cron jobs sono tracciati automaticamente

## Disabilitare Sentry

Se non vuoi usare Sentry (non consigliato per produzione):

1. Rimuovi `NEXT_PUBLIC_SENTRY_DSN` dal `.env`
2. Sentry non si attiverà (graceful degradation)

**Nota**: Lasciare Sentry configurato ma senza DSN NON causa problemi - semplicemente non invia dati.

## Costi

- Free tier: **5,000 errori/mese** - più che sufficiente per progetto universitario
- Nessuna carta di credito richiesta
- Dopo 5K errori, smette di tracciare fino al mese successivo (non crasha)

## Link Utili

- Dashboard: https://sentry.io/
- Docs Next.js: https://docs.sentry.io/platforms/javascript/guides/nextjs/
- Status: https://status.sentry.io/
