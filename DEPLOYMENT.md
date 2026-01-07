# 🚀 BiblioFlow - Guida al Deployment

Questa guida ti accompagna nel processo di deployment dell'applicazione BiblioFlow in ambiente di produzione.

---

## 📋 Prerequisiti

Prima di iniziare il deployment, assicurati di avere:

- ✅ Account [Vercel](https://vercel.com) (consigliato - free tier disponibile)
- ✅ Database PostgreSQL (es. [Vercel Postgres](https://vercel.com/storage/postgres) o [Neon](https://neon.tech))
- ✅ (Opzionale) Account [Upstash Redis](https://upstash.com) per rate limiting distribuito
- ✅ Node.js 18+ installato localmente

---

## 🔐 Step 1: Generazione Secrets

I secrets sono valori crittografici che proteggono l'applicazione. **Non utilizzare mai gli stessi secrets tra development e production!**

### Genera automaticamente tutti i secrets:

```bash
npm run generate:secrets
```

Questo comando genera:
- `NEXTAUTH_SECRET` - Per JWT e session encryption
- `QR_SECRET` - Per firma crittografica dei QR codes
- `CRON_SECRET` - Per proteggere gli endpoint cron

### Output esempio:

```env
NEXTAUTH_SECRET="aB3dE...fGhI="
QR_SECRET="jK8lM...nOpQ="
CRON_SECRET="550e8400-e29b-41d4-a716-446655440000"
```

**⚠️ Copia questi valori in un posto sicuro - li userai nel prossimo step!**

---

## 🗄️ Step 2: Setup Database PostgreSQL

### Opzione A: Vercel Postgres (Consigliato)

1. Vai su [Vercel Dashboard](https://vercel.com/dashboard)
2. Storage → Create Database → Postgres
3. Copia il `DATABASE_URL` (formato: `postgresql://...`)

### Opzione B: Neon.tech

1. Crea account su [Neon.tech](https://neon.tech)
2. Crea nuovo progetto → Copia connection string
3. Assicurati che includa `?sslmode=require`

### Esegui migrations:

```bash
# Imposta DATABASE_URL nel terminale (sostituisci con il tuo)
export DATABASE_URL="postgresql://user:pass@host:5432/db?sslmode=require"

# Esegui migrations
npx prisma migrate deploy

# (Opzionale) Popola con dati di esempio
npx prisma db seed
```

---

## ⚙️ Step 3: Configurazione Variabili d'Ambiente

### 3.1 Crea file `.env.production` locale

```bash
cp .env.production.example .env.production
```

### 3.2 Compila tutte le variabili

Apri `.env.production` e inserisci:

```env
# Database
DATABASE_URL="postgresql://..." # Dal Step 2

# Authentication
NEXTAUTH_SECRET="..." # Dal Step 1
NEXTAUTH_URL="https://tuo-dominio.vercel.app"

# QR Security
QR_SECRET="..." # Dal Step 1

# Cron Jobs
CRON_SECRET="..." # Dal Step 1

# (Opzionale) Rate Limiting
UPSTASH_REDIS_REST_URL="https://..."
UPSTASH_REDIS_REST_TOKEN="..."
```

**⚠️ NON committare `.env.production` nel repository!**

---

## 🚢 Step 4: Deploy su Vercel

### 4.1 Installa Vercel CLI (se non già installato)

```bash
npm i -g vercel
```

### 4.2 Login

```bash
vercel login
```

### 4.3 Deploy

```bash
# Prima volta (crea progetto)
vercel

# Deploy production
vercel --prod
```

### 4.4 Configura Environment Variables su Vercel

Vai su: **Vercel Dashboard → Tuo Progetto → Settings → Environment Variables**

Aggiungi **una per una** tutte le variabili da `.env.production`:

| Name | Value | Environment |
|------|-------|-------------|
| `DATABASE_URL` | `postgresql://...` | Production |
| `NEXTAUTH_SECRET` | `aB3dE...` | Production |
| `NEXTAUTH_URL` | `https://tuo-dominio.vercel.app` | Production |
| `QR_SECRET` | `jK8lM...` | Production |
| `CRON_SECRET` | `550e8...` | Production |

**💡 Tip:** Usa "Production" environment per tutte le variabili critiche.

---

## 🔄 Step 5: Setup Cron Jobs (Automazioni)

BiblioFlow utilizza cron jobs per:
- Controllare prestiti scaduti ogni ora
- Inviare notifiche automatiche
- Cancellare prenotazioni scadute

### Su Vercel:

1. Vai su **Vercel Dashboard → Tuo Progetto → Settings → Cron Jobs**
2. Aggiungi questi job:

| Path | Schedule | Descrizione |
|------|----------|-------------|
| `/api/cron/check-overdue-loans` | `0 * * * *` | Ogni ora |
| `/api/cron/send-notifications` | `0 8,20 * * *` | 8:00 e 20:00 |
| `/api/cron/cleanup-expired` | `0 2 * * *` | 2:00 AM |

3. Configura header di autenticazione:
   - Header: `Authorization`
   - Value: `Bearer ${CRON_SECRET}`

---

## 🌐 Step 6: Configurazione Dominio Custom (Opzionale)

### 6.1 Aggiungi dominio su Vercel

1. **Settings → Domains → Add**
2. Inserisci il tuo dominio (es. `biblioflow.it`)
3. Configura DNS secondo le istruzioni Vercel

### 6.2 Aggiorna NEXTAUTH_URL

```bash
# Su Vercel Environment Variables
NEXTAUTH_URL="https://biblioflow.it"
```

### 6.3 Redeploy

```bash
vercel --prod
```

---

## ✅ Step 7: Testing Post-Deployment

### 7.1 Verifica funzionalità base

- [ ] Homepage carica correttamente
- [ ] Login funziona (email/password)
- [ ] Registrazione nuovo utente
- [ ] Ricerca libri
- [ ] Prenotazione posto
- [ ] Check-in QR code (da mobile)
- [ ] Prestito libro
- [ ] Notifiche real-time

### 7.2 Test accessibilità

- [ ] Navigazione keyboard (Alt+H, Alt+P, etc.)
- [ ] Screen reader (VoiceOver/NVDA)
- [ ] Dark mode toggle
- [ ] Touch targets 44x44px

### 7.3 Test PWA

- [ ] Installazione da browser mobile
- [ ] Funzionamento offline
- [ ] Push notifications (se abilitate)

### 7.4 Lighthouse Audit

```bash
# Apri Chrome DevTools → Lighthouse
# Esegui audit per:
# - Performance
# - Accessibility
# - Best Practices
# - SEO
# - PWA

# Target: 90+ in tutte le categorie
```

---

## 🔧 Step 8: Monitoring & Maintenance

### 8.1 Logs Vercel

```bash
# Visualizza logs in tempo reale
vercel logs

# Filtra per errori
vercel logs --follow | grep ERROR
```

### 8.2 Database Monitoring

```bash
# Connetti a database produzione
npx prisma studio --port 5555
```

### 8.3 Backup Database (Consigliato)

```bash
# Export database
pg_dump $DATABASE_URL > backup-$(date +%Y%m%d).sql

# Automatizza con cron settimanale
0 3 * * 0 pg_dump $DATABASE_URL > backup-$(date +\%Y\%m\%d).sql
```

---

## 🆘 Troubleshooting

### Problema: "Invalid environment variables"

**Soluzione:**
```bash
# Verifica che tutte le variabili siano impostate
vercel env ls

# Aggiungi variabili mancanti
vercel env add NEXTAUTH_SECRET
```

### Problema: "Database connection failed"

**Soluzione:**
```bash
# Verifica connection string
echo $DATABASE_URL

# Testa connessione
npx prisma db pull
```

### Problema: "NextAuth callback URL mismatch"

**Soluzione:**
- Verifica che `NEXTAUTH_URL` corrisponda esattamente al dominio production
- Include `https://` e nessun trailing slash
- Redeploy dopo la modifica

### Problema: "Cron jobs non eseguiti"

**Soluzione:**
- Verifica che `CRON_SECRET` sia impostato su Vercel
- Controlla logs: `vercel logs --follow`
- Verifica che gli header Authorization siano configurati

---

## 📊 Checklist Pre-Launch

Prima di lanciare in produzione, verifica:

### Security
- [ ] Tutti i secrets generati con `npm run generate:secrets`
- [ ] `.env.production` non committato (verificare `.gitignore`)
- [ ] HTTPS configurato e funzionante
- [ ] Rate limiting attivo (Upstash Redis)
- [ ] Headers di sicurezza configurati (`next.config.ts`)

### Performance
- [ ] Lighthouse Performance score > 90
- [ ] Immagini ottimizzate (next/image)
- [ ] Code splitting implementato (lazy loading)
- [ ] PWA configurata correttamente

### Accessibility
- [ ] Lighthouse Accessibility score > 95
- [ ] Keyboard navigation funzionante
- [ ] Screen reader testato (VoiceOver/NVDA)
- [ ] ARIA labels presenti

### Database
- [ ] Migrations eseguite con `prisma migrate deploy`
- [ ] Seed eseguito (se necessario)
- [ ] Backup strategy configurata
- [ ] Connection pooling attivo

### Monitoring
- [ ] Error logging configurato (Sentry opzionale)
- [ ] Vercel Analytics attivo
- [ ] Cron jobs schedulati
- [ ] Alerts configurati

### Documentation
- [ ] README.md aggiornato
- [ ] ROADMAP.md completato
- [ ] ACCESSIBILITY.md documentato
- [ ] Deployment guide verificata

---

## 🎓 Deployment per Progetto Universitario

Se stai deployando BiblioFlow per un progetto universitario/demo:

### Setup Veloce (15 minuti)

1. **Deploy su Vercel:**
   ```bash
   vercel --prod
   ```

2. **Usa Vercel Postgres (free tier):**
   - Storage → Create Database → Postgres
   - Auto-configura `DATABASE_URL`

3. **Genera secrets su Vercel Dashboard:**
   - Settings → Environment Variables
   - Aggiungi manualmente NEXTAUTH_SECRET, QR_SECRET, CRON_SECRET

4. **Esegui migrations:**
   ```bash
   # Vercel esegue automaticamente `npm run build`
   # Aggiungi postbuild script se necessario
   ```

5. **Test rapido:**
   - Apri URL Vercel
   - Registra utente
   - Testa funzionalità base

### Demo Ready ✅

La tua app è ora live e accessibile pubblicamente!

**URL Demo:** `https://biblioflow-app.vercel.app`

---

## 🔗 Risorse Utili

- [Next.js Deployment](https://nextjs.org/docs/deployment)
- [Vercel Documentation](https://vercel.com/docs)
- [Prisma Production Best Practices](https://www.prisma.io/docs/guides/performance-and-optimization/connection-management)
- [NextAuth.js Deployment](https://next-auth.js.org/deployment)
- [Upstash Redis Setup](https://upstash.com/docs/redis/overall/getstarted)

---

## 📞 Supporto

Per problemi o domande:

1. Controlla [ROADMAP.md](./ROADMAP.md) per features implementate
2. Leggi [ACCESSIBILITY.md](./ACCESSIBILITY.md) per linee guida accessibilità
3. Consulta [README.md](./README.md) per documentazione generale

---

**🎉 Congratulazioni! BiblioFlow è ora in produzione!**
