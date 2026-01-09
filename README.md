# BiblioFlow: University Library Management System

**Progetto Corso Human-Computer Interaction | Laurea Magistrale in Ingegneria del Software**

BiblioFlow è una piattaforma web progressiva (PWA) progettata per ottimizzare l'esperienza di fruizione dei servizi bibliotecari universitari. Il progetto adotta un approccio **User-Centered Design**, focalizzandosi sulla risoluzione di specifici *pain points* identificati attraverso l'analisi di tre profili utente primari (Personas).

L'architettura del sistema combina prestazioni elevate, garantite da **Next.js**, con una gestione robusta dei dati tramite **PostgreSQL** e **Prisma ORM**, offrendo un'interfaccia moderna, accessibile e reattiva.

🔗 **Deployment Produzione**: [https://biblioflow-app.vercel.app/](https://biblioflow-app.vercel.app/)

---

## 📐 Metodologia e Scenari HCI

Lo sviluppo è stato guidato dall'analisi di tre scenari d'uso critici, per i quali sono state implementate soluzioni interattive dedicate.

### 1. Scenario "Pendolarismo e Incertezza"
**Problema**: Gli studenti pendolari affrontano l'incertezza dei tempi di trasporto, rischiando di perdere la prenotazione del posto a causa di ritardi non preventivabili.
**Soluzione Implementata**: **Margine di Tolleranza Dinamico**.
Durante la fase di prenotazione, il sistema identifica il profilo utente (flag `studente_pendolare`) e propone proattivamente un'opzione per estendere la finestra di check-in di 30 minuti.
<p align="center">
  <img src="public/docs/feature-pendolare.png" alt="Margine Pendolare Interface" width="600" style="border-radius: 8px; border: 1px solid #ddd;">
</p>

### 2. Scenario "Accessibilità Fisica"
**Problema**: Difficoltà per utenti con disabilità motorie o necessità specifiche (es. prese elettriche) nell'individuare postazioni idonee sulla mappa statica.
**Soluzione Implementata**: **Mappa Interattiva con Filtri Visivi**.
L'interfaccia di prenotazione integra filtri ad alto contrasto che evidenziano in tempo reale le postazioni che soddisfano i criteri di accessibilità selezionati, fornendo feedback visivo immediato.
<p align="center">
  <img src="public/docs/feature-accessibility.png" alt="Accessibility Map Filters" width="600" style="border-radius: 8px; border: 1px solid #ddd;">
</p>

### 3. Scenario "Ottimizzazione dei Tempi (Click & Collect)"
**Problema**: Frammentazione del tempo tra le lezioni e inefficienza nella ricerca fisica dei testi a scaffale.
**Soluzione Implementata**: **Servizio "Preparamelo"**.
Integrazione di un flusso *Click & Collect* digitale. L'utente richiede la preparazione del testo dal catalogo; il personale gestisce la richiesta tramite dashboard dedicata, notificando la disponibilità al ritiro (Stato: `PRONTA_RITIRO`).

---

## 🖥️ Dashboard Amministrativa

Per il personale bibliotecario è stata sviluppata una **Dashboard di Gestione** completa, accessibile tramite autenticazione RBAC (Role-Based Access Control).

**Funzionalità Chiave**:
- **Monitoraggio Anomalie**: Widget dinamici per la visualizzazione di No-Show, guasti alle postazioni e prestiti in scadenza.
- **Workflow Richieste**: Sistema Kanban-like per la gestione degli stati delle richieste libri (Pendente → In Lavorazione → Pronto).
- **Statistiche in Tempo Reale**: Grafici di occupazione e utilizzo risorse.

<p align="center">
  <img src="public/docs/admin-dashboard.png" alt="Admin Dashboard Overview" width="800" style="border-radius: 8px; border: 1px solid #ddd; box-shadow: 0 4px 6px rgba(0,0,0,0.1);">
</p>

---

## 🏗️ Architettura Software

Il progetto segue i principi della Clean Architecture, sfruttando le potenzialità del framework Next.js App Router.

- **Frontend**: React 19, TypeScript, Tailwind CSS, Shadcn/UI (Componenti accessibili basati su Radix UI).
- **Backend Layers**:
  - **API Routes**: Endpoints RESTful (`/api/*`) per la gestione della logica di business.
  - **ORM**: Prisma per la modellazione e l'interazione type-safe con il database.
  - **Database**: PostgreSQL ospitato su Supabase.
- **Authentication**: NextAuth.js v5 con gestione sessioni sicure e provider multipli.

### Struttura Repository
```
src/
├── app/                 # Next.js App Router pages & API
│   ├── admin/           # Sezione protetta Amministratori
│   ├── libri/           # Catalogo e Flow Click & Collect
│   └── prenota/         # Flow Prenotazione Posto
├── components/          # React Components (UI & Feature-specific)
├── lib/                 # Utilities, Auth Config, Prisma Client
└── prisma/              # Schema Database e Migrazioni
```

---

## ⚙️ Installazione e Sviluppo Locale

Requisiti: Node.js 18+, PostgreSQL (o Docker container).

1. **Clone Repository**
   ```bash
   git clone https://github.com/mariocelzo/biblioflow-app.git
   cd biblioflow-app
   ```

2. **Setup Dipendenze**
   ```bash
   npm install
   ```

3. **Configurazione Ambiente**
   Creare un file `.env` basato su `.env.example` e popolare le variabili:
   ```env
   DATABASE_URL="postgresql://user:password@host:port/db"
   NEXTAUTH_SECRET="your-secure-secret"
   ```

4. **Database Migration**
   ```bash
   npx prisma generate
   npx prisma db push
   ```

5. **Avvio Server**
   ```bash
   npm run dev
   ```
   L'applicazione sarà accessibile su `http://localhost:3000`.

---

**Autore**: Mario Celzo
**Corso**: Human-Computer Interaction, Laurea Magistrale in Ingegneria Informatica.
