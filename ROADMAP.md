# 🚀 BiblioFlow - Roadmap di Sviluppo

> **Progetto HCI** - Sistema di Prenotazione Posti Biblioteca Universitaria
>
> Ultimo aggiornamento: 11 Dicembre 2025

---

## 📊 Stato Generale

| Fase                       | Stato          | Progresso |
| -------------------------- | -------------- | --------- |
| 1. Setup & Configurazione  | � Completato   | 100%      |
| 2. Database & Backend      | 🔴 Da iniziare | 0%        |
| 3. Autenticazione          | 🔴 Da iniziare | 0%        |
| 4. App Studente            | 🔴 Da iniziare | 0%        |
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

- [ ] **Tabella User**
  - [ ] Campi base (id, email, nome, cognome, matricola)
  - [ ] Ruolo (STUDENTE, BIBLIOTECARIO, ADMIN)
  - [ ] Preferenze accessibilità
  - [ ] Flag pendolare
  - [ ] Timestamps
- [ ] **Tabella Posto**

  - [ ] Identificativo (numero, sala, piano)
  - [ ] Caratteristiche (presa, finestra, silenzioso)
  - [ ] Flag accessibile
  - [ ] Stato (disponibile, occupato, manutenzione)
  - [ ] Coordinate mappa (x, y)

- [ ] **Tabella Prenotazione**

  - [ ] Relazione User e Posto
  - [ ] Data e slot orario
  - [ ] Stato (confermata, check-in, completata, cancellata, no-show)
  - [ ] Margine pendolare attivo
  - [ ] Timestamps check-in/out

- [ ] **Tabella Libro**

  - [ ] Dati bibliografici (titolo, autore, ISBN)
  - [ ] Posizione fisica
  - [ ] Disponibilità

- [ ] **Tabella Prestito**

  - [ ] Relazione User e Libro
  - [ ] Date prestito e scadenza
  - [ ] Stato e rinnovi

- [ ] **Tabella Notifica**

  - [ ] Relazione User
  - [ ] Tipo, titolo, messaggio
  - [ ] Flag letta
  - [ ] Link azione

- [ ] **Tabella LogEvento** (per audit)
  - [ ] Tipo evento
  - [ ] Entità coinvolte
  - [ ] Dettagli JSON

### 2.2 Seed Data

- [ ] Script seed per utenti demo
- [ ] Script seed per posti (configurazione reale biblioteca)
- [ ] Script seed per libri esempio
- [ ] Script seed per prenotazioni esempio

### 2.3 API Routes Base

- [ ] `GET /api/health` - Health check
- [ ] Middleware autenticazione
- [ ] Middleware error handling
- [ ] Middleware rate limiting

**Deliverable**: Database popolato e API base funzionanti

---

## 📋 FASE 3: Autenticazione

### 3.1 NextAuth.js Setup

- [ ] Configurare NextAuth con Prisma adapter
- [ ] Provider Credentials (email/password)
- [ ] Opzionale: Provider Google/Microsoft universitario
- [ ] Gestione sessioni JWT
- [ ] Middleware protezione route

### 3.2 Pagine Auth

- [ ] Pagina Login (`/login`)
  - [ ] Form email/password
  - [ ] Validazione client-side
  - [ ] Error handling
  - [ ] Link recupero password
- [ ] Pagina Registrazione (`/registrazione`)

  - [ ] Form completo con matricola
  - [ ] Validazione matricola universitaria
  - [ ] Selezione preferenze iniziali
  - [ ] Email di conferma (mock)

- [ ] Pagina Recupero Password (`/recupera-password`)
  - [ ] Form email
  - [ ] Invio link reset (mock)

### 3.3 Gestione Ruoli

- [ ] Hook `useAuth()` con ruolo utente
- [ ] HOC/middleware per route protette
- [ ] Redirect automatici per ruolo

**Deliverable**: Sistema auth completo e funzionante

---

## 📋 FASE 4: App Studente (Mobile-First)

### 4.1 Layout & Navigazione

- [ ] Layout responsive con header
- [ ] Bottom navigation mobile
- [ ] Sidebar desktop
- [ ] Breadcrumbs
- [ ] Loading states globali

### 4.2 Dashboard Home (`/`)

- [ ] Saluto personalizzato
- [ ] Card prenotazione attiva con countdown
- [ ] Quick actions (4 card grandi)
- [ ] Sezione "Potrebbe interessarti"
- [ ] Statistiche personali

### 4.3 Prenotazione Posto (`/prenota`)

- [ ] **Step 1: Quando**
  - [ ] Calendario interattivo
  - [ ] Indicatori disponibilità per giorno
  - [ ] Selezione slot orario
  - [ ] Preview posti disponibili
- [ ] **Step 2: Dove**
  - [ ] Mappa interattiva biblioteca
  - [ ] Switch tra piani
  - [ ] Legenda colori (libero/occupato/prenotato)
  - [ ] Click su posto per dettagli
  - [ ] Filtri caratteristiche
  - [ ] Vista lista alternativa
- [ ] **Step 3: Conferma**
  - [ ] Riepilogo prenotazione
  - [ ] Toggle Margine Pendolare
  - [ ] Toggle notifiche percorso
  - [ ] Pulsante conferma
  - [ ] Animazione successo

### 4.4 Gestione Prenotazione (`/prenotazioni`)

- [ ] Lista prenotazioni attive
- [ ] Storico prenotazioni passate
- [ ] Card prenotazione con azioni
  - [ ] Vedi percorso
  - [ ] Check-in (QR code)
  - [ ] Estendi sessione
  - [ ] Pausa
  - [ ] Cancella
- [ ] Dettaglio prenotazione singola

### 4.5 Estensione Sessione (`/prenotazioni/[id]/estendi`)

- [ ] Timeline visuale orizzontale
- [ ] Drag per estendere
- [ ] Verifica disponibilità real-time
- [ ] Conferma estensione

### 4.6 Check-in (`/checkin`)

- [ ] Generazione QR code
- [ ] Scanner QR (per totem)
- [ ] Check-in manuale con codice
- [ ] Conferma visiva successo

### 4.7 Catalogo Libri (`/libri`)

- [ ] Barra ricerca con autocomplete
- [ ] Filtri (categoria, disponibilità, posizione)
- [ ] Lista risultati con card
- [ ] Dettaglio libro
  - [ ] Info complete
  - [ ] Disponibilità real-time
  - [ ] Posizione in biblioteca
  - [ ] Pulsante "Prepara per ritiro"

### 4.8 I Miei Prestiti (`/prestiti`)

- [ ] Lista prestiti attivi
- [ ] Countdown scadenze
- [ ] Pulsante rinnova
- [ ] Storico prestiti
- [ ] Alert scadenze imminenti

### 4.9 Profilo Utente (`/profilo`)

- [ ] Visualizza/modifica dati personali
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
