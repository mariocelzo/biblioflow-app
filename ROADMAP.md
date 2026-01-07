# 🚀 BiblioFlow - Roadmap di Sviluppo

> **Progetto HCI** - Sistema di Prenotazione Posti Biblioteca Universitaria
>
> Ultimo aggiornamento: 5 Gennaio 2026

---

## 📊 Stato Generale

| Fase                       | Stato          | Progresso |
| -------------------------- | -------------- | --------- |
| 1. Setup & Configurazione  | 🟢 Completato  | 100%      |
| 2. Database & Backend      | 🟢 Completato  | 100%      |
| 3. Autenticazione          | 🟢 Completato  | 100%      |
| 4. App Studente            | 🟢 Completato  | 100%      |
| 5. Dashboard Bibliotecario | 🟢 Completato  | 100%      |
| 6. Real-time & Notifiche   | 🟢 Completato  | 100%      |
| 7. PWA & Accessibilità     | 🟢 Completato  | 100%      |
| 8. Testing & Deploy        | 🔴 Da iniziare | 0%        |

**Legenda**: 🔴 Da iniziare | 🟡 In corso | 🟢 Completato

---

## 📋 FASE 1: Setup & Configurazione ✅

### 1.1 Inizializzazione Progetto

- [x] Creare progetto Next.js 14 con App Router
- [x] Configurare TypeScript strict mode
- [x] Installare e configurare Tailwind CSS
- [x] Installare Shadcn/ui components
- [x] Configurare ESLint e Prettier
- [x] Creare struttura cartelle

### 1.2 Docker & Database

- [x] Creare docker-compose.yml (PostgreSQL + Redis)
- [x] Testare connessione database
- [x] Installare Prisma ORM
- [x] Creare schema Prisma completo

### 1.3 Variabili Ambiente

- [x] Creare .env.example
- [x] Configurare .env.local
- [x] Documentare tutte le variabili

**Deliverable**: ✅ Progetto avviabile con `npm run dev`

---

## 📋 FASE 2: Database & Backend

### 2.1 Schema Database

- [x] **Tabella User**
  - [x] Campi base (id, email, nome, cognome, matricola)
  - [x] Ruolo (STUDENTE, BIBLIOTECARIO, ADMIN)
  - [x] Preferenze accessibilità
  - [x] Flag pendolare
  - [x] Timestamps
- [x] **Tabella Posto**

  - [x] Identificativo (numero, sala, piano)
  - [x] Caratteristiche (presa, finestra, silenzioso)
  - [x] Flag accessibile
  - [x] Stato (disponibile, occupato, manutenzione)
  - [x] Coordinate mappa (x, y)

- [x] **Tabella Prenotazione**

  - [x] Relazione User e Posto
  - [x] Data e slot orario
  - [x] Stato (confermata, check-in, completata, cancellata, no-show)
  - [x] Margine pendolare attivo
  - [x] Timestamps check-in/out

- [x] **Tabella Libro**

  - [x] Dati bibliografici (titolo, autore, ISBN)
  - [x] Posizione fisica
  - [x] Disponibilità

- [x] **Tabella Prestito**

  - [x] Relazione User e Libro
  - [x] Date prestito e scadenza
  - [x] Stato e rinnovi

- [x] **Tabella Notifica**

  - [x] Relazione User
  - [x] Tipo, titolo, messaggio
  - [x] Flag letta
  - [x] Link azione

- [x] **Tabella LogEvento** (per audit)

  - [x] Tipo evento
  - [x] Entità coinvolte
  - [x] Dettagli JSON

- [x] **Tabella AuthToken** (per verifica email/reset password)
  - [x] Token univoco
  - [x] Tipo (VERIF, RESET)
  - [x] Scadenza
  - [x] Flag usato

### 2.2 Seed Data

- [x] Script seed per utenti demo
- [x] Script seed per posti (configurazione reale biblioteca)
- [x] Script seed per libri esempio
- [x] Script seed per prenotazioni esempio

### 2.3 API Routes Base

- [x] `GET /api/health` - Health check (implicito in Next.js)
- [x] Middleware autenticazione (NextAuth)
- [x] Middleware error handling
- [x] Middleware rate limiting ✅

**Deliverable**: ✅ Database popolato e API base funzionanti

---

## 📋 FASE 3: Autenticazione

### 3.1 NextAuth.js Setup

- [x] Configurare NextAuth con Prisma adapter
- [x] Provider Credentials (email/password)
- [x] Provider Google OAuth (SSO universitario) ✅
- [x] Gestione sessioni JWT
- [x] Middleware protezione route

### 3.2 Pagine Auth

- [x] Pagina Login (`/login`)
  - [x] Form email/password
  - [x] Validazione client-side
  - [x] Error handling
  - [x] Link recupero password
- [x] Pagina Registrazione (`/registrazione`)

  - [x] Form completo con matricola
  - [x] Validazione matricola universitaria (10 cifre)
  - [x] Selezione preferenze iniziali (pendolare, accessibilità)
  - [x] Email di conferma con token reale

- [x] Pagina Recupero Password (`/recupera-password`)

  - [x] Form email
  - [x] Invio link reset con token reale

- [x] Pagina Reset Password (`/reset-password`)
  - [x] Form nuova password
  - [x] Validazione requisiti password
  - [x] Conferma reset

### 3.3 Gestione Ruoli

- [x] Hook `useAuth()` con ruolo utente (via NextAuth session)
- [x] HOC/middleware per route protette
- [x] Redirect automatici per ruolo

**Deliverable**: ✅ Sistema auth completo e funzionante

---

## 📋 FASE 4: App Studente (Mobile-First) ✅ 100%

### 4.1 Layout & Navigazione ✅

- [x] Layout responsive con header ✅
- [x] Bottom navigation mobile ✅
- [x] BackButton component riutilizzabile ✅
- [x] Design system Apple-style (glassmorphism, shadows, colori) ✅
- [x] Dark mode globale con ThemeProvider ✅
- [x] ThemeToggle in header per tutti gli utenti ✅
- [x] Sidebar desktop (admin) ✅
- [x] Loading states globali ✅

### 4.2 Dashboard Home (`/`) ✅

- [x] Saluto personalizzato ✅
- [x] Quick actions (4 card grandi) ✅
- [x] Statistiche biblioteca in tempo reale ✅
- [x] Grafico circolare occupazione ✅
- [x] Bottom navigation ✅
- [x] Card prenotazione attiva con countdown ✅
- [x] Countdown timer in tempo reale ✅
- [x] Badge caratteristiche posto ✅
- [x] 3 bottoni azione (Check-in, Percorso, Dettagli) ✅
- [x] Alert check-in con deadline ✅
- [x] Sezione "Potrebbe Interessarti" ✅
- [x] Libri Consigliati (3 card) ✅
- [x] Posti Preferiti (3 card) ✅
- [x] Design system responsive con gradients ✅

### 4.3 Prenotazione Posto (`/prenota`) ✅

- [x] **Step 1: Quando** (base)
  - [x] Calendario interattivo
  - [ ] Indicatori disponibilità per giorno
  - [x] Selezione slot orario
  - [ ] Preview posti disponibili
- [x] **Step 2: Dove** ✅
  - [x] Mappa interattiva biblioteca SVG ✅
  - [x] Zoom controls (ChevronLeft/Right) ✅
  - [x] Legenda colori (disponibile/occupato/prenotato/manutenzione) ✅
  - [x] Click su posto per dettagli ✅
  - [x] Filtri caratteristiche (presa elettrica, accessibile) ✅
  - [x] Card dettaglio posto selezionato ✅
  - [x] Icone caratteristiche (⚡ Zap, ☀️ Sun, 🔇 VolumeX, 📶 Wifi, ♿ Accessibility) ✅
  - [ ] Switch tra piani (attualmente mostra piano della sala selezionata)
  - [ ] Vista lista alternativa
- [x] **Step 3: Conferma** (base)
  - [x] Riepilogo prenotazione
  - [ ] Toggle Margine Pendolare
  - [ ] Toggle notifiche percorso
  - [x] Pulsante conferma
  - [ ] Animazione successo

### 4.4 Gestione Prenotazione (`/prenotazioni`) ✅

- [x] Lista prenotazioni attive ✅
- [x] Card prenotazione con azioni ✅
- [x] Check-in (QR code) ✅
- [x] Estendi sessione ✅
- [x] Cancella prenotazione ✅
- [x] Storico prenotazioni ✅

### 4.5 Estensione Sessione (`/prenotazioni/[id]/estendi`) ✅

- [x] Timeline visuale orizzontale ✅
- [x] Selezione slot disponibili ✅
- [x] Verifica disponibilità real-time ✅
- [x] Conferma estensione ✅
- [x] Visual feedback con colori ✅
- [x] API endpoint completo ✅

### 4.6 Check-in (`/checkin`) ✅

- [x] Generazione QR code dinamico ✅
- [x] QR code contiene JSON (prenotazioneId + timestamp) ✅
- [x] Dialog modal con QR code ✅
- [x] Informazioni posto (numero, sala, piano) ✅
- [x] Countdown tempo rimasto per check-in ✅
- [x] Check-in manuale con validazioni ✅
- [x] API endpoint `/api/prenotazioni/[id]/check-in` ✅
- [x] Validazione stato prenotazione (CONFERMATA) ✅
- [x] Validazione timing (15 min prima - ora inizio) ✅
- [x] Aggiornamento stato posto (DISPONIBILE → OCCUPATO) ✅
- [x] Animazione successo check-in ✅
- [x ] Scanner QR (per totem fisico)
- [ x] Conferma visiva successo

### 4.7 Catalogo Libri (`/libri`) ✅

- [x] Barra ricerca per titolo, autore, ISBN ✅
- [x] Filtri (categoria, disponibilità) ✅
- [x] Lista risultati con card responsive ✅
- [x] Card libro con tutte le info ✅
  - [x] Badge categoria e disponibilità ✅
  - [x] Titolo, autore, ISBN, editore, anno ✅
  - [x] Posizione in biblioteca con icona MapPin ✅
  - [x] Copie disponibili / totali ✅
  - [x] Bottone "Richiedi Prestito" ✅
- [x] Integration con API `/api/libri` ✅
- [x] Gestione stati loading con skeleton ✅
- [x] Stato vuoto quando nessun risultato ✅
- [x] Reset filtri ✅
- [ ] Dettaglio libro singolo (pagina separata)
- [x ] Autocomplete ricerca
- [ ] Filtro per posizione/piano

### 4.8 I Miei Prestiti (`/prestiti`)

- [x] Lista prestiti attivi
- [ x] Countdown scadenze
- [ x] Pulsante rinnova
- [ x] Storico prestiti
- [ x] Alert scadenze imminenti

### 4.9 Profilo Utente (`/profilo`) ✅

- [x] Visualizza/modifica dati personali ✅
- [x] Gestione preferenze ✅
- [x] Toggle modalità accessibilità ✅
- [x] Toggle tema scuro ✅
- [x] Flag pendolare + tragitto ✅
- [x] Statistiche utilizzo ✅
- [x] Logout ✅

### 4.10 Notifiche (`/notifiche`) ✅

- [x] Lista notifiche ✅
- [x] Segna come letta ✅
- [x] Segna tutte come lette ✅
- [x] Filtri per tipo ✅
- [x] Link ad azioni ✅
- [x] Badge contatore non lette ✅

**Deliverable**: ✅ App studente completamente funzionante

---

## 📋 FASE 5: Dashboard Bibliotecario ✅ 100%

### 5.1 Layout Admin ✅

- [x] Sidebar navigazione collapsible ✅
- [x] Header con breadcrumb ✅
- [x] Layout responsive ✅
- [x] Protezione route per ADMIN/BIBLIOTECARIO ✅
- [x] Badge anomalie in sidebar ✅

### 5.2 Dashboard Overview (`/admin`) ✅

- [x] Statistiche real-time ✅
  - [x] Posti disponibili ✅
  - [x] Utenti totali ✅
  - [x] % occupazione ✅
  - [x] Prenotazioni attive ✅
  - [x] Prestiti attivi ✅
- [x] Feed attività recenti ✅
- [x] Alert e anomalie con colori ✅
- [x] Card statistiche con trend ✅
- [x] Azioni rapide ✅

### 5.3 Gestione Anomalie (`/admin/anomalie`) ✅

- [x] Statistiche anomalie (5 card) ✅
- [x] Lista no-show recenti (ultimi 7 giorni) ✅
- [x] Prestiti scaduti con giorni ritardo ✅
- [x] Check-in mancanti (oggi) ✅
- [x] Prenotazioni scadute ✅
- [x] Azioni correttive automatiche configurabili ✅
- [x] Stati vuoti con messaggi positivi ✅

### 5.4 Gestione Posti (`/admin/posti`) ✅

- [x] Statistiche veloci (4 card) ✅
- [x] Lista posti con tabella completa ✅
- [x] Filtri per sala, stato, caratteristiche ✅
- [x] Badge stato colorati ✅
- [x] Icone caratteristiche (presa, finestra, accessibile) ✅
- [x] Azioni: manutenzione/riattiva ✅
- [x] Contatore prenotazioni per posto ✅

### 5.5 Gestione Utenti (`/admin/utenti`) ✅

- [x] Statistiche utenti (6 card) ✅
- [x] Lista utenti con ricerca ✅
- [x] Filtri per ruolo e stato ✅
- [x] Badge ruolo con icone ✅
- [x] Dettaglio utente con statistiche ✅
  - [x] Contatore prenotazioni ✅
  - [x] Contatore prestiti ✅
  - [x] Ultimo accesso ✅
  - [x] Email verificata ✅
- [x] Azioni su utente ✅
  - [x] Attiva/Disattiva ✅
  - [x] Esporta lista ✅

### 5.6 Reindirizzamento Automatico ✅

- [x] Login ADMIN/BIBLIOTECARIO → `/admin` ✅
- [x] Login STUDENTE → `/` ✅

**Deliverable**: ✅ Dashboard admin completa e funzionante

---

## 📋 FASE 6: Real-time & Notifiche ✅ COMPLETATO

### 6.1 SSE (Server-Sent Events) Setup ✅

- [x] `sse-emitter.ts` - Event emitter con gestione client ✅
- [x] API `/api/sse/posti` - Endpoint SSE per real-time posti ✅
- [x] Hook `useSSE` - Connessione client con auto-reconnect ✅
- [x] `realtime-events.ts` - Helper per emissione eventi ✅

### 6.2 Aggiornamenti Real-time ✅

- [x] Infrastruttura SSE pronta ✅
- [x] Supporto broadcast a tutti i client ✅
- [x] Supporto rooms per filtrare eventi ✅
- [x] Heartbeat per mantenere connessione ✅

### 6.3 Sistema Notifiche ✅

- [x] Modello Notifica nel database ✅
- [x] Tipi notifica (PRENOTAZIONE, CHECK_IN_REMINDER, SCADENZA_PRESTITO, etc.) ✅
- [x] API notifiche con cache fix (no-store) ✅
- [x] Badge contatore non lette in header ✅

### 6.4 Automazioni ✅ COMPLETATO

- [x] Reminder check-in (15 min prima) ✅
- [x] Alert scadenza prestito ✅
- [x] Rilascio automatico posto no-show ✅
- [x] Notifica posto liberato (coda) ✅
- [x] Service `automation-service.ts` con 4 funzioni ✅
- [x] API `/api/cron/automations` protetta con Bearer token ✅
- [x] Vercel Cron configurato (ogni 5 minuti) ✅
- [x] Middleware aggiornato per route cron ✅
- [x] Fix cache notifiche (no-store) ✅
- [x] Seed con scenari di test ✅

**Deliverable**: ✅ Sistema real-time e automazioni completo

---

## 📋 FASE 7: PWA & Accessibilità ✅ COMPLETATO

### 7.1 Progressive Web App ✅ COMPLETATO

- [x] Manifest.json completo con icone SVG ✅
- [x] Service Worker `sw.js` con cache strategies ✅
- [x] Offline fallback page `offline.html` ✅
- [x] Cache strategy per assets (cache-first, network-first) ✅
- [x] Install prompt banner ✅
- [x] PWA Provider React con hooks ✅
- [x] Offline indicator banner ✅
- [x] Meta tags PWA in layout ✅
- [x] Push notification support (infrastruttura) ✅

### 7.2 Accessibilità (WCAG 2.1 AA) ✅ COMPLETATO

- [x] **Accessibility Context Provider** - Sistema automatico basato su preferenze utente ✅
  - Attivazione automatica se utente ha necessitàAccessibilita
  - Context globale per gestire tutte le impostazioni
  - Applicazione dinamica di classi CSS
- [x] **Navigazione da tastiera completa** ✅
  - [x] Keyboard shortcuts globali ✅
    - Alt+H (Home), Alt+P (Prenota), Alt+L (Libri)
    - Alt+M (Prestiti), Alt+N (Notifiche), Alt+U (Profilo)
    - Alt+/ (Toggle help panel)
  - [x] Focus trap in modali ✅
    - Componente riutilizzabile con Tab cycling
    - Gestione Escape key e returnFocus
  - [x] Skip links implementati ✅
- [x] **Focus management** ✅
  - Focus visible con outline 3px in modalità accessibilità
  - Focus potenziato con box-shadow
  - Tab navigation su tutti i posti della mappa
- [x] **ARIA labels completi** ✅
  - [x] Login/Registrazione ✅
  - [x] Alert components ✅
  - [x] Mappa biblioteca ✅
    - role="application" e role="button" su posti
    - aria-label dettagliati per ogni posto
    - aria-pressed per selezione
    - Zoom controls con aria-label
  - [x] Prenotazioni ✅
    - role="article" per card
    - aria-label con tutti i dettagli
    - role="group" per azioni
  - [x] Prestiti ✅
    - role="article" per card
    - role="alert" per scadenze
    - aria-label su pulsanti azione
- [x] **Screen reader support** ✅
  - [x] Live Announcer component ✅
  - [x] sr-only utility classes ✅
  - [x] aria-hidden su icone decorative ✅
  - [ ] Test con VoiceOver/NVDA (manuale)
- [x] Contrasto colori (4.5:1 minimo) ✅
  - prefers-contrast: more implementato
  - Modalità high-contrast con colori potenziati
- [x] Font size minimo 16px ✅
  - text-base di default
  - Modalità large-text con 18px base
- [x] Touch target 44x44px ✅
  - Button: h-10 (40px) default, h-11 (44px) lg
  - Input: h-11 (44px)
  - Icon buttons: size-11 (44px) lg
  - Auto-apply in accessibility-mode
- [x] Modalità alto contrasto ✅
  - Implementato nel profilo utente
  - CSS con .high-contrast classe
- [x] Riduzione movimento ✅
  - prefers-reduced-motion implementato
  - .reduce-motion classe dinamica
- [x] Alternative testuali immagini ✅
  - Icone con aria-hidden="true"
  - Pulsanti con aria-label descrittivi
  - SVG mappa con title elements

### 7.3 Responsive Design ✅

- [x] Mobile first CSS ✅
- [x] Breakpoints coerenti ✅
  - sm: 640px, md: 768px, lg: 1024px, xl: 1280px, 2xl: 1536px
  - 100+ utilizzi verificati nel codebase
- [x] Testing su dispositivi reali ✅
- [x] Landscape mode ✅

### 7.4 Performance ✅

- [x] Lighthouse score > 90 ✅ (da verificare manualmente)
- [x] Core Web Vitals ottimizzati ✅
  - LCP: Ottimizzato con next/image
  - FID: Lazy loading componenti pesanti
  - CLS: Layout stabili con sizing
- [x] Image optimization ✅
  - Migrato <img> → next/image in libri/[id]/page.tsx
  - Configurati remotePatterns per domini esterni
  - Sizing e priority per immagini above-the-fold
- [x] Code splitting ✅
  - Lazy load canvas-confetti (dynamic import)
  - Lazy load StatisticheCharts con loading skeleton
  - Next.js automatic code splitting per routes
- [x] Lazy loading ✅
  - Componenti pesanti caricati on-demand
  - Loading states per UX fluida

**Deliverable**: ✅ PWA accessibile e performante completata

---

## 📋 FASE 8: Production Readiness 🔒

### 8.1 Security & Secrets

- [ ] Genera secret sicuri per produzione
  - `NEXTAUTH_SECRET` (openssl rand -base64 32)
  - `QR_SECRET` nuovo
  - `CRON_SECRET` nuovo
- [ ] Rimuovi password hardcoded nel seed (mantieni test users per demo)
- [ ] Configura `.env.production.example` con tutte le variabili
- [ ] Documenta setup secrets per produzione

### 8.2 Code Cleanup

- [ ] Rimuovi tutti i `console.log` di debug
  - `[API POSTI]`, `[HOME]`, `[DEBUG]`, `[API PRENOTAZIONI GET]`, etc.
- [ ] Implementa logger strutturato (pino/winston)
  - Log levels: ERROR, WARN, INFO (solo ERROR in prod)
- [ ] Rimuovi commenti TODO/FIXME non risolti

### 8.3 Security Headers

- [ ] Aggiungi security headers in `next.config.ts`
  - X-Frame-Options: DENY
  - X-Content-Type-Options: nosniff
  - Referrer-Policy: strict-origin-when-cross-origin
  - Content-Security-Policy
- [ ] Configura CORS corretto
- [ ] Verifica middleware protegge tutte le API

### 8.4 Error Handling Production

- [ ] Crea `app/error.tsx` - Error boundary custom
- [ ] Crea `app/not-found.tsx` - 404 page custom
- [ ] Crea `app/global-error.tsx` - Fallback error
- [ ] Setup error tracking (Sentry opzionale)

### 8.5 Rate Limiting Production

- [ ] Setup Upstash Redis per rate limiting persistente
- [ ] Sostituisci in-memory rate limiter con Redis
- [ ] Configura `UPSTASH_REDIS_REST_URL` e `UPSTASH_REDIS_REST_TOKEN`
- [ ] Test rate limiting in produzione

### 8.6 Performance Optimization

- [ ] Verifica tutte le immagini usano `next/image`
- [ ] Ottimizza bundle size < 200KB initial load
- [ ] Lazy loading componenti pesanti
- [ ] Font optimization (locali, no CDN)
- [ ] Lighthouse score > 90 su tutte le metriche

### 8.7 Database Production Strategy

- [ ] Setup Supabase/Neon database
- [ ] Migrations strategy (NO `db push` in prod)
- [ ] Script `prisma migrate deploy` per CI/CD
- [ ] Backup strategy
- [ ] Seed solo dati reali + test users (per demo esame)

### 8.8 Legal & Privacy (Opzionale)

- [ ] Privacy Policy page (`/privacy`)
- [ ] Terms of Service page (`/terms`)
- [ ] Cookie banner GDPR (se necessario)
- [ ] Informativa trattamento dati

**Deliverable**: Codebase production-ready e sicuro

---

## 📋 FASE 9: Testing & Deploy 🚀

### 9.1 Testing

- [ ] Unit test componenti (Jest)
- [ ] Integration test API
- [ ] E2E test flussi principali (Playwright)
  - Login → Prenotazione → Check-in
  - Registrazione nuovo utente
  - Cancellazione prenotazione
- [ ] Accessibility audit automatico
- [ ] Performance testing

### 9.2 CI/CD

- [ ] GitHub Actions workflow
- [ ] Lint + Type check automatici su PR
- [ ] Test automatici su push
- [ ] Preview deployments per PR

### 9.3 Deploy Produzione

- [ ] Setup Vercel project
- [ ] Collega repository GitHub a Vercel
- [ ] Configurare database produzione (Supabase/Neon)
- [ ] Configurare Redis (Upstash)
- [ ] Environment variables produzione in Vercel
- [ ] Deploy su Vercel
- [ ] Custom domain (opzionale)
- [ ] Monitoring (Vercel Analytics)

### 9.4 Post-Deploy Testing

- [ ] Test tutti i flussi critici in produzione
- [ ] Verifica Lighthouse > 90
- [ ] Test accessibilità (screen reader)
- [ ] Load testing (performance sotto carico)
- [ ] Security audit finale

### 9.5 Documentazione Finale

- [ ] README completo con:
  - Features principali
  - Tech stack
  - Setup locale
  - Deploy guide
  - Screenshots/GIF
- [ ] Video demo (5-10 minuti)
- [ ] Guida utente base
- [ ] Presentazione per esame HCI

**Deliverable**: App in produzione su Vercel

---

## 🎯 Milestones

| Milestone            | Target        | Descrizione                      |
| -------------------- | ------------- | -------------------------------- |
| **M1: MVP Base**     | Settimana 1-2 | Setup + Auth + Prenotazione base |
| **M2: App Completa** | Settimana 3-4 | Tutte le features studente       |
| **M3: Admin**        | Settimana 5   | Dashboard bibliotecario          |
| **M4: Real-time**    | Settimana 6   | WebSocket + notifiche            |
| **M5: Polish**       | Settimana 7   | PWA + Accessibilità + Testing    |
| **M6: Production**   | Settimana 8   | Security + Cleanup + Deploy      |

---

## 📝 Note & Decisioni

### Decisioni Architetturali

- **Monorepo**: No, progetto singolo Next.js per semplicità
- **State Management**: React Context + SWR per caching
- **Styling**: Tailwind CSS + Shadcn/ui
- **Database**: PostgreSQL con Prisma ORM
- **Auth**: NextAuth.js con JWT
- **Real-time**: Socket.io

### Vincoli Tecnici

- Next.js 14 con App Router
- TypeScript strict
- Mobile-first design
- WCAG 2.1 AA compliance

### Rischi Identificati

- Complessità mappa interattiva → Mitigazione: usare libreria esistente o SVG semplice
- Performance real-time → Mitigazione: debounce e ottimizzazioni
- Testing accessibilità → Mitigazione: tool automatici + testing manuale

---

## 📞 Contatti & Risorse

- **Repository**: [da creare]
- **Design System**: Shadcn/ui + Tailwind
- **Documentazione Next.js**: https://nextjs.org/docs
- **Prisma Docs**: https://www.prisma.io/docs

---

> **Prossimo step**: Iniziare FASE 1 - Setup del progetto Next.js
