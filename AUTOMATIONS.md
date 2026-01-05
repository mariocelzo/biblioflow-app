# 🤖 Sistema Automazioni BiblioFlow

Sistema di automazioni periodiche per gestire notifiche e azioni automatiche.

## 📋 Automazioni Implementate

### 1️⃣ Reminder Check-in (15 min prima)

- **Quando**: 15 minuti prima dell'ora di inizio prenotazione
- **Cosa fa**: Invia notifica in-app all'utente per ricordare il check-in
- **Messaggio**: "⏰ Check-in tra 15 minuti - Non dimenticare di fare check-in per il posto X in Sala Y"

### 2️⃣ Alert Scadenza Prestiti

- **Quando**: 3 giorni prima E 1 giorno prima della scadenza
- **Cosa fa**: Invia 2 notifiche progressive (avviso + urgente)
- **Messaggio**:
  - 3 giorni: "📚 Prestito in scadenza - Il libro X scade tra 3 giorni"
  - 1 giorno: "⚠️ Prestito scade domani! - URGENTE: Restituisci o rinnova oggi"

### 3️⃣ Rilascio Automatico No-Show

- **Quando**: 15 minuti dopo l'ora di inizio senza check-in
- **Cosa fa**:
  - Cambia stato prenotazione da CONFERMATA → NO_SHOW
  - Libera il posto (OCCUPATO → DISPONIBILE)
  - Invia notifica di cancellazione all'utente
  - Crea log evento per audit
- **Messaggio**: "❌ Prenotazione annullata per no-show - Non hai fatto check-in entro 15 minuti"

### 4️⃣ Notifica Posto Liberato

- **Quando**: Un utente cancella una prenotazione in anticipo
- **Cosa fa**: Notifica fino a 10 utenti con preferenze simili
- **Messaggio**: "✨ Posto disponibile! - Un posto simile a quelli che prenoti è appena diventato disponibile"

---

## 🚀 Come Funziona

### Architettura

```
vercel.json (cron config)
    ↓
    Ogni 5 minuti
    ↓
GET /api/cron/automations (con Authorization header)
    ↓
runAllAutomations() in automation-service.ts
    ↓
    ┌─────────────────────────────────┐
    │  sendCheckInReminders()         │
    │  sendLoanExpiryAlerts()         │
    │  releaseNoShowReservations()    │
    └─────────────────────────────────┘
    ↓
Crea Notifiche + LogEvento in DB
```

### Vercel Cron

Il file `vercel.json` configura un cron job che esegue ogni 5 minuti:

```json
{
  "crons": [
    {
      "path": "/api/cron/automations",
      "schedule": "*/5 * * * *"
    }
  ]
}
```

**Formato schedule (cron syntax):**

- `*/5` = ogni 5 minuti
- `*` = ogni ora
- `*` = ogni giorno del mese
- `*` = ogni mese
- `*` = ogni giorno della settimana

---

## 🔒 Sicurezza

### Authorization Header

L'endpoint è protetto da un secret token:

```bash
Authorization: Bearer <CRON_SECRET>
```

**Setup del secret:**

1. Genera un token sicuro:

```bash
openssl rand -base64 32
```

2. Aggiungi a `.env`:

```bash
CRON_SECRET="il-tuo-secret-generato"
```

3. Aggiungi su Vercel:

```bash
vercel env add CRON_SECRET
```

### Protezione da Accessi Non Autorizzati

- ❌ Nessun header → 401 Unauthorized
- ❌ Token sbagliato → 401 Unauthorized
- ✅ Token corretto → 200 OK + esecuzione

---

## 🧪 Testing

### Test Manuale Locale

```bash
# 1. Avvia il server
npm run dev

# 2. Chiama l'endpoint con curl
curl -X POST http://localhost:3000/api/cron/automations \
  -H "Authorization: Bearer dev-secret-change-in-production"

# Output esempio:
{
  "success": true,
  "message": "Automazioni eseguite con successo",
  "results": {
    "timestamp": "2026-01-05T14:30:00.000Z",
    "reminders": { "sent": 3, "message": "3 reminder check-in inviati" },
    "loanAlerts": { "sent": 5, "message": "5 alert scadenza prestiti inviati" },
    "noShows": { "released": 2, "message": "2 posti liberati per no-show" },
    "errors": []
  }
}
```

### Test su Vercel

Una volta deployato, Vercel eseguirà automaticamente il cron ogni 5 minuti.

**Verifica logs su Vercel:**

1. Dashboard Vercel → tuo progetto
2. Tab "Logs"
3. Filtra per `/api/cron/automations`
4. Verifica output delle esecuzioni

---

## 📊 Monitoring

### Log Console

Ogni esecuzione logga:

```
🤖 Avvio automazioni: 2026-01-05T14:30:00.000Z
✅ Reminders: { sent: 3, message: '3 reminder check-in inviati' }
✅ Loan alerts: { sent: 5, message: '5 alert scadenza prestiti inviati' }
✅ No-shows: { released: 2, message: '2 posti liberati per no-show' }
🎯 Automazioni completate
```

### Database LogEvento

Ogni automation crea un record in `LogEvento`:

```typescript
{
  tipo: 'AUTOMATION',
  descrizione: 'Reminder check-in inviato per prenotazione 123',
  dettagli: {
    prenotazioneId: '123',
    userId: '456',
    oraInizio: '14:00'
  }
}
```

**Query per analisi:**

```sql
-- Automazioni eseguite oggi
SELECT * FROM "LogEvento"
WHERE tipo = 'AUTOMATION'
  AND "createdAt" >= CURRENT_DATE;

-- No-show automatici ultimi 7 giorni
SELECT * FROM "LogEvento"
WHERE tipo = 'NO_SHOW_AUTO'
  AND "createdAt" >= NOW() - INTERVAL '7 days';
```

---

## 🛠️ Configurazione Avanzata

### Cambiare Frequenza Cron

Modifica `vercel.json`:

```json
{
  "crons": [
    {
      "path": "/api/cron/automations",
      "schedule": "*/10 * * * *" // Ogni 10 minuti
    }
  ]
}
```

**Esempi schedule:**

- `*/5 * * * *` → Ogni 5 minuti
- `0 * * * *` → Ogni ora (al minuto 0)
- `0 8 * * *` → Ogni giorno alle 8:00
- `0 0 * * 0` → Ogni domenica a mezzanotte

### Disabilitare Singola Automation

In `automation-service.ts`, commenta la chiamata:

```typescript
export async function runAllAutomations() {
  // const reminders = await sendCheckInReminders(); // DISABILITATO
  const loanAlerts = await sendLoanExpiryAlerts();
  const noShows = await releaseNoShowReservations();
}
```

### Aggiungere Nuova Automation

1. Crea funzione in `automation-service.ts`:

```typescript
export async function myNewAutomation() {
  // Logica...
  return { count: 0, message: "Done" };
}
```

2. Aggiungila a `runAllAutomations()`:

```typescript
const myResult = await myNewAutomation();
```

---

## 🚨 Troubleshooting

### Cron non si esegue su Vercel

**Cause comuni:**

1. ❌ `vercel.json` non presente in root
2. ❌ Schedule syntax sbagliato
3. ❌ Endpoint ritorna errore 500
4. ❌ Piano Vercel non supporta cron (richiede Hobby o Pro)

**Soluzioni:**

- Verifica `vercel.json` sia committato
- Testa endpoint manualmente con curl
- Controlla logs Vercel per errori
- Verifica piano Vercel

### Notifiche duplicate

**Causa:** Cron si esegue più volte per stessa condizione

**Soluzione:** Aggiungi controllo per evitare duplicati:

```typescript
// Esempio in sendCheckInReminders()
user: {
  notifiche: {
    none: {  // ← Evita duplicati
      tipo: TipoNotifica.REMINDER,
      createdAt: { gte: new Date(now.setHours(0, 0, 0, 0)) }
    }
  }
}
```

### No-show non vengono rilasciati

**Causa:** Timezone mismatch tra server e DB

**Soluzione:** Usa sempre `new Date()` JS e Prisma gestisce timezone

---

## 📈 Metriche & KPI

Query utili per dashboard admin:

```sql
-- Tasso no-show (ultimi 30 giorni)
SELECT
  COUNT(CASE WHEN stato = 'NO_SHOW' THEN 1 END) AS noshow,
  COUNT(*) AS totale,
  ROUND(COUNT(CASE WHEN stato = 'NO_SHOW' THEN 1 END) * 100.0 / COUNT(*), 2) AS percentuale
FROM "Prenotazione"
WHERE "createdAt" >= NOW() - INTERVAL '30 days';

-- Efficacia reminder (check-in dopo reminder)
SELECT
  COUNT(CASE WHEN "checkInAt" IS NOT NULL THEN 1 END) AS checkin_effettuati,
  COUNT(*) AS reminder_inviati,
  ROUND(COUNT(CASE WHEN "checkInAt" IS NOT NULL THEN 1 END) * 100.0 / COUNT(*), 2) AS tasso_conversione
FROM "Prenotazione" p
JOIN "Notifica" n ON n."userId" = p."userId"
WHERE n.tipo = 'REMINDER'
  AND n."createdAt" >= NOW() - INTERVAL '30 days';
```

---

## 🎯 Roadmap Future

- [ ] Webhook per notifiche push browser
- [ ] Email notifiche (Resend)
- [ ] SMS per urgenze (Twilio)
- [ ] ML per predire no-show
- [ ] Coda intelligente posti liberati
- [ ] Reminder personalizzati per utente

---

**Documentazione aggiornata:** 5 Gennaio 2026  
**Versione:** 1.0.0
