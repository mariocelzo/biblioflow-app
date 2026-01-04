# 🚀 BiblioFlow - Roadmap di Sviluppo

> **Progetto HCI** - Sistema di Prenotazione Posti Biblioteca Universitaria
>
> Ultimo aggiornamento: 2 Gennaio 2026

---

## 📊 Stato Generale

| Fase                       | Stato          | Progresso |
| -------------------------- | -------------- | --------- |
| 1. Setup & Configurazione  | 🟢 Completato  | 100%      |
| 2. Database & Backend      | 🟢 Completato  | 100%      |
| 3. Autenticazione          | 🟢 Completato  | 100%      |
| 4. App Studente            | 🟡 In corso    | 70%       |
| 5. Dashboard Bibliotecario | 🔴 Da iniziare | 0%        |
| 6. Real-time & Notifiche   | 🔴 Da iniziare | 0%        |
| 7. PWA & Accessibilità     | 🔴 Da iniziare | 0%        |
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
- [ ] Middleware rate limiting

**Deliverable**: ✅ Database popolato e API base funzionanti

---

## 📋 FASE 3: Autenticazione

### 3.1 NextAuth.js Setup

- [x] Configurare NextAuth con Prisma adapter
- [x] Provider Credentials (email/password)
- [ ] Opzionale: Provider Google/Microsoft universitario
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

## 📋 FASE 4: App Studente (Mobile-First) - 50%

### 4.1 Layout & Navigazione

- [x] Layout responsive con header ✅
- [x] Bottom navigation mobile ✅
- [x] BackButton component riutilizzabile ✅
- [x] Design system Apple-style (glassmorphism, shadows, colori) ✅
- [ ] Sidebar desktop
- [ ] Breadcrumbs
- [ ] Loading states globali

### 4.2 Dashboard Home (`/`)

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
- [ ] Sezione "Potrebbe interessarti"
- [ ] Statistiche personali

### 4.3 Prenotazione Posto (`/prenota`)

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

### 4.4 Gestione Prenotazione (`/prenotazioni`)

- [x] Lista prenotazioni attive
- [ ] Storico prenotazioni passate
- [x] Card prenotazione con azioni
  - [ ] Vedi percorso
  - [x] Check-in (QR code) ✅
  - [ ] Estendi sessione
  - [ ] Pausa
  - [x] Cancella
- [ ] Dettaglio prenotazione singola

### 4.5 Estensione Sessione (`/prenotazioni/[id]/estendi`)

- [ ] Timeline visuale orizzontale
- [ ] Drag per estendere
- [ ] Verifica disponibilità real-time
- [ ] Conferma estensione

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
- [ ] Scanner QR (per totem fisico)
- [ ] Conferma visiva successo

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
- [ ] Autocomplete ricerca
- [ ] Filtro per posizione/piano

### 4.8 I Miei Prestiti (`/prestiti`)

- [x] Lista prestiti attivi
- [ ] Countdown scadenze
- [ ] Pulsante rinnova
- [ ] Storico prestiti
- [ ] Alert scadenze imminenti

### 4.9 Profilo Utente (`/profilo`)

- [x] Visualizza/modifica dati personali
- [ ] Gestione preferenze
  - [ ] Posto preferito
  - [ ] Sala preferita
  - [ ] Notifiche
- [ ] Toggle modalità accessibilità
- [ ] Toggle tema scuro
- [ ] Flag pendolare + tragitto
- [ ] Statistiche utilizzo
- [ ] Logout

### 4.10 Notifiche (`/notifiche`)

- [ ] Lista notifiche
- [ ] Segna come letta
- [ ] Segna tutte come lette
- [ ] Filtri per tipo
- [ ] Link ad azioni

**Deliverable**: App studente completamente funzionante

---

## 📋 FASE 5: Dashboard Bibliotecario

### 5.1 Layout Admin

- [ ] Sidebar navigazione
- [ ] Header con notifiche
- [ ] Layout tre colonne (desktop)

### 5.2 Dashboard Overview (`/admin`)

- [ ] Statistiche real-time
  - [ ] Posti disponibili
  - [ ] Utenti in biblioteca
  - [ ] % occupazione
  - [ ] Check-in mancati
- [ ] Mappa occupazione live
- [ ] Feed attività recenti
- [ ] Alert e anomalie

### 5.3 Gestione Anomalie (`/admin/anomalie`)

- [ ] Lista anomalie per priorità
- [ ] Dettaglio anomalia
  - [ ] Timeline eventi
  - [ ] Utenti coinvolti
  - [ ] Azioni disponibili
- [ ] Override ragionato
  - [ ] Selezione motivazione
  - [ ] Note personalizzate
  - [ ] Log azione

### 5.4 Gestione Posti (`/admin/posti`)

- [ ] Vista mappa modificabile
- [ ] Lista posti con filtri
- [ ] Modifica stato posto
- [ ] Blocca posto per manutenzione
- [ ] Aggiungi/rimuovi caratteristiche

### 5.5 Gestione Utenti (`/admin/utenti`)

- [ ] Lista utenti con ricerca
- [ ] Dettaglio utente
  - [ ] Storico prenotazioni
  - [ ] Storico prestiti
  - [ ] Note
- [ ] Azioni su utente
  - [ ] Reset password
  - [ ] Blocca/sblocca
  - [ ] Invia notifica

### 5.6 Report & Statistiche (`/admin/report`)

- [ ] Grafici occupazione (giorno/settimana/mese)
- [ ] Heatmap utilizzo per fascia oraria
- [ ] Top utenti
- [ ] Anomalie per periodo
- [ ] Export CSV/PDF

### 5.7 Notifiche Broadcast (`/admin/notifiche`)

- [ ] Invia notifica a tutti
- [ ] Invia a gruppo (per sala, per corso)
- [ ] Template messaggi
- [ ] Storico invii

**Deliverable**: Dashboard admin completa

---

## 📋 FASE 6: Real-time & Notifiche

### 6.1 WebSocket Setup

- [ ] Configurare Socket.io server
- [ ] Client hooks (`useSocket`)
- [ ] Room per piani/sale
- [ ] Reconnection handling

### 6.2 Aggiornamenti Real-time

- [ ] Stato posti in tempo reale
- [ ] Countdown prenotazioni
- [ ] Notifiche push in-app
- [ ] Alert bibliotecario

### 6.3 Sistema Notifiche

- [ ] Servizio notifiche backend
- [ ] Tipi notifica predefiniti
- [ ] Push notifications browser
- [ ] Email notifications (mock/Resend)

### 6.4 Automazioni

- [ ] Reminder check-in (15 min prima)
- [ ] Alert scadenza prestito
- [ ] Rilascio automatico posto no-show
- [ ] Notifica posto liberato (coda)

**Deliverable**: Sistema real-time funzionante

---

## 📋 FASE 7: PWA & Accessibilità

### 7.1 Progressive Web App

- [ ] Manifest.json completo
- [ ] Service Worker (next-pwa)
- [ ] Offline fallback page
- [ ] Cache strategy per assets
- [ ] Install prompt

### 7.2 Accessibilità (WCAG 2.1 AA)

- [ ] Navigazione da tastiera completa
- [ ] Focus management
- [ ] ARIA labels ovunque
- [ ] Screen reader testing
- [ ] Contrasto colori (4.5:1 minimo)
- [ ] Font size minimo 16px
- [ ] Touch target 44x44px
- [ ] Modalità alto contrasto
- [ ] Riduzione movimento
- [ ] Alternative testuali immagini

### 7.3 Responsive Design

- [ ] Mobile first CSS
- [ ] Breakpoints coerenti
- [ ] Testing su dispositivi reali
- [ ] Landscape mode

### 7.4 Performance

- [ ] Lighthouse score > 90
- [ ] Core Web Vitals ottimizzati
- [ ] Image optimization
- [ ] Code splitting
- [ ] Lazy loading

**Deliverable**: PWA accessibile e performante

---

## 📋 FASE 8: Testing & Deploy

### 8.1 Testing

- [ ] Unit test componenti (Jest)
- [ ] Integration test API
- [ ] E2E test flussi principali (Playwright)
- [ ] Accessibility audit automatico
- [ ] Performance testing

### 8.2 CI/CD

- [ ] GitHub Actions workflow
- [ ] Lint + Type check
- [ ] Test automatici
- [ ] Preview deployments

### 8.3 Deploy Produzione

- [ ] Setup Vercel project
- [ ] Configurare database produzione (Supabase/Neon)
- [ ] Configurare Redis (Upstash)
- [ ] Environment variables produzione
- [ ] Custom domain (opzionale)
- [ ] Monitoring (Vercel Analytics)

### 8.4 Documentazione

- [ ] README completo
- [ ] Documentazione API (Swagger/OpenAPI)
- [ ] Guida utente
- [ ] Video demo

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
| **M6: Deploy**       | Settimana 8   | Produzione + Documentazione      |

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
