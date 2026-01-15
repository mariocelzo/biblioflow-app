# 🚀 Deployment Checklist - Sentry Setup Completato

## ✅ Cosa è stato fatto (Locale)

1. ✅ Sentry installato e configurato
2. ✅ Environment validation con Zod implementata
3. ✅ .warpindexingignore creato
4. ✅ DSN aggiunto al `.env` locale
5. ✅ Build testato e funzionante

## 🔴 STEP CRITICI - Da fare ORA

### 1. Aggiungi il DSN a Vercel (OBBLIGATORIO)

**Vai su**: https://vercel.com/dashboard

1. Seleziona il progetto **biblioflow-app**
2. Vai su **Settings** → **Environment Variables**
3. Clicca **Add New**
4. Aggiungi questa variabile:

```
Name: NEXT_PUBLIC_SENTRY_DSN
Value: https://073473d3b37a501882ba03a1e1ecf598@o4510714552057856.ingest.de.sentry.io/4510714556317776
Environment: ✅ Production ✅ Preview ✅ Development
```

5. Clicca **Save**

⚠️ **IMPORTANTE**: Se non aggiungi il DSN su Vercel, Sentry NON funzionerà in produzione!

---

### 2. Commit e Deploy

```bash
# Verifica cosa stai committando
git status

# Aggiungi i file
git add .

# Commit
git commit -m "feat: add Sentry monitoring + environment validation

- Setup Sentry error tracking (client, server, edge)
- Add environment validation with Zod schema
- Add .warpindexingignore for better indexing
- Integrate env validation in auth and cron routes
- Update .env.example with Sentry DSN placeholder"

# Push su main (triggera deploy automatico su Vercel)
git push origin main
```

---

### 3. Verifica Deploy

1. Vai su https://vercel.com/dashboard
2. Aspetta che il deploy finisca (~2 minuti)
3. Clicca sul deployment
4. Verifica nei logs che non ci siano errori

---

### 4. Testa Sentry in Produzione

#### Test 1: Verifica connessione
1. Vai su https://sentry.io/organizations/mario-celzo/projects/
2. Dovresti vedere **javascript-nextjs** con status "Waiting for events"

#### Test 2: Genera un errore di test
1. Apri https://biblioflow-app.vercel.app/
2. Apri la console del browser (F12)
3. Digita questo comando:
   ```javascript
   throw new Error("Test Sentry - tutto funziona!");
   ```
4. Vai su Sentry → Issues
5. Dovresti vedere l'errore di test entro 10 secondi

#### Test 3: Email notification
1. Su Sentry, vai su **Settings** → **Notifications**
2. Abilita "Email notifications for new issues"
3. La prossima volta che c'è un errore, ricevi email

---

## 📊 Cosa monitora Sentry

Ora Sentry traccia automaticamente:

- ❌ **Errori JavaScript** nel browser (React components, event handlers)
- ❌ **Errori API Routes** (`/api/*`)
- ❌ **Errori Middleware** (authentication guard)
- ❌ **Errori Cron Jobs** (`/api/cron/automations`)
- 📹 **Session Replay** (opzionale - vedi cosa ha fatto l'utente prima dell'errore)
- 📈 **Performance** (slow API calls, render times)

---

## 🎯 Esempi di Errori che Sentry catturerà

### Esempio 1: User fa azione non permessa
```
Error: Non autorizzato
  at /api/admin/utenti/[id]/route.ts:15
  User: mario.celzo@example.com (STUDENTE)
  URL: /api/admin/utenti/123
```

### Esempio 2: Database connection fail
```
PrismaClientInitializationError: Can't reach database
  at prisma.prenotazione.create
  URL: /api/prenotazioni
  User: (anonymous)
```

### Esempio 3: Bug nel frontend
```
TypeError: Cannot read property 'nome' of undefined
  at MappaInterfaccia.tsx:45
  User: mario.celzo@example.com
  Browser: Chrome 120.0.0 on macOS
  Session Replay: [Guarda cosa ha fatto] ← 🔥 Questa è la killer feature!
```

---

## 🔥 Pro Tips

### 1. Aggiungi contesto utente (opzionale)
In `src/lib/auth.ts`, dopo il login, aggiungi:

```typescript
import * as Sentry from "@sentry/nextjs";

// Dopo autenticazione successful
Sentry.setUser({
  id: user.id,
  email: user.email,
  username: `${user.nome} ${user.cognome}`,
});
```

### 2. Cattura errori custom
Quando vuoi tracciare qualcosa di specifico:

```typescript
try {
  await riskyOperation();
} catch (error) {
  Sentry.captureException(error, {
    tags: { operation: "prenotazione" },
    extra: { postoId: "123", userId: "456" },
  });
  throw error;
}
```

### 3. Breadcrumbs (traccia flusso utente)
```typescript
Sentry.addBreadcrumb({
  message: "Utente ha cliccato su posto 15B",
  level: "info",
  data: { salaId: "sala-1", postoId: "posto-123" },
});
```

---

## 📱 Dashboard Sentry

Vai su: https://sentry.io/organizations/mario-celzo/projects/javascript-nextjs/

Sezioni utili:
- **Issues**: Tutti gli errori, raggruppati
- **Performance**: Tempi di risposta API
- **Releases**: Traccia quale versione ha quale bug
- **Alerts**: Configura notifiche Slack/Email

---

## 🆘 Troubleshooting

### "Non vedo errori su Sentry"
1. Verifica DSN su Vercel: Settings → Env Variables
2. Check che `NEXT_PUBLIC_SENTRY_DSN` sia presente
3. Redeploy: Vercel → Project → Redeploy

### "Troppi errori!"
1. Sentry → Project Settings → Rate Limits
2. Imposta limite: max 100 eventi/minuto
3. O filtra errori noti: Settings → Inbound Filters

### "Voglio disabilitare Session Replay"
In `sentry.client.config.ts`, rimuovi `replayIntegration`

---

## 🎉 Fatto!

Ora hai:
- ✅ Monitoring errori 24/7
- ✅ Email quando qualcosa si rompe
- ✅ Stack traces completi
- ✅ Session replay per debug
- ✅ Performance monitoring

**Costo**: $0/mese (free tier 5K errori/mese)

---

## 📞 Link Utili

- Sentry Dashboard: https://sentry.io/organizations/mario-celzo/
- Documentazione: https://docs.sentry.io/platforms/javascript/guides/nextjs/
- Vercel Dashboard: https://vercel.com/dashboard
- BiblioFlow Prod: https://biblioflow-app.vercel.app/

---

**Domande?** Controlla `SENTRY_SETUP.md` per dettagli setup iniziale.
