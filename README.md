# 📚 BiblioFlow

**Sistema di gestione intelligente per biblioteche universitarie**

BiblioFlow è un'applicazione PWA (Progressive Web App) progettata per digitalizzare e ottimizzare la gestione delle sale studio e dei prestiti librari nelle biblioteche universitarie.

> 🎓 Progetto sviluppato per il corso di **Human-Computer Interaction** - Università degli Studi

---

## ✨ Funzionalità Principali

### Per gli Studenti
- 📍 **Prenotazione posti** in sala studio con visualizzazione real-time
- 📖 **Gestione prestiti** libri con storico e promemoria scadenze
- 🔔 **Notifiche smart** per scadenze, disponibilità posti e code
- 📊 **Dashboard personale** con statistiche di utilizzo

### Per i Bibliotecari
- 🎛️ **Pannello amministrativo** per gestione sale e posti
- 📈 **Analytics** su occupazione e utilizzo risorse
- 👥 **Gestione utenti** e permessi
- 📋 **Log eventi** per tracciabilità completa

---

## 🛠️ Tech Stack

| Tecnologia | Versione | Uso |
|------------|----------|-----|
| **Next.js** | 16.x | Framework React con App Router |
| **TypeScript** | 5.x | Type safety |
| **Tailwind CSS** | 4.x | Styling utility-first |
| **Shadcn/ui** | latest | Componenti UI accessibili |
| **Prisma** | 7.x | ORM per database |
| **PostgreSQL** | 17 | Database relazionale |
| **Redis** | 7 | Cache e sessioni |
| **Docker** | - | Containerizzazione servizi |

---

## 🚀 Quick Start

### Prerequisiti

- **Node.js** 18+ ([download](https://nodejs.org/))
- **Docker Desktop** ([download](https://www.docker.com/products/docker-desktop/))
- **Git** ([download](https://git-scm.com/))

### 1. Clona il repository

```bash
git clone https://github.com/TUO_USERNAME/biblioflow-app.git
cd biblioflow-app
```

### 2. Configura le variabili d'ambiente

```bash
# Copia il file di esempio
cp .env.example .env

# Modifica .env con le tue credenziali
nano .env  # o usa il tuo editor preferito
```

Contenuto `.env`:
```env
# Database
DATABASE_URL="postgresql://postgres:LA_TUA_PASSWORD@localhost:5432/biblioflow"
POSTGRES_PASSWORD="LA_TUA_PASSWORD"

# Redis
REDIS_URL="redis://localhost:6379"

# NextAuth (genera una chiave segreta)
NEXTAUTH_URL="http://localhost:3000"
NEXTAUTH_SECRET="genera-con-openssl-rand-base64-32"
```

> 💡 **Tip**: Genera `NEXTAUTH_SECRET` con: `openssl rand -base64 32`

### 3. Avvia i servizi Docker

```bash
# Avvia PostgreSQL, Redis e Adminer
docker compose up -d

# Verifica che i container siano running
docker compose ps
```

### 4. Installa le dipendenze

```bash
npm install
```

### 5. Configura il database

```bash
# Sincronizza lo schema Prisma con il database
npx prisma db push

# (Opzionale) Apri Prisma Studio per visualizzare i dati
npx prisma studio
```

### 6. Avvia l'applicazione

```bash
npm run dev
```

🎉 **L'app è ora disponibile su [http://localhost:3000](http://localhost:3000)**

---

## 📁 Struttura del Progetto

```
biblioflow-app/
├── prisma/
│   └── schema.prisma      # Schema database (modelli, relazioni)
├── public/                # Asset statici
├── src/
│   ├── app/               # App Router (pagine e layout)
│   │   ├── globals.css    # Stili globali + design system
│   │   ├── layout.tsx     # Layout principale
│   │   └── page.tsx       # Homepage/Dashboard
│   ├── components/
│   │   └── ui/            # Componenti Shadcn/ui
│   ├── lib/
│   │   ├── prisma.ts      # Client Prisma singleton
│   │   └── utils.ts       # Utility functions
│   └── types/
│       └── index.ts       # TypeScript type definitions
├── .env.example           # Template variabili ambiente
├── docker-compose.yml     # Configurazione Docker
├── ROADMAP.md             # Piano di sviluppo dettagliato
└── package.json           # Dipendenze e script
```

---

## 🤝 Come Contribuire

### Workflow di sviluppo

1. **Crea un branch** per la tua feature
   ```bash
   git checkout -b feature/nome-feature
   ```

2. **Sviluppa** la tua feature seguendo le convenzioni del progetto

3. **Testa** le modifiche localmente
   ```bash
   npm run dev
   ```

4. **Committa** con messaggi descrittivi
   ```bash
   git add .
   git commit -m "✨ feat: descrizione della feature"
   ```

5. **Pusha** il branch
   ```bash
   git push origin feature/nome-feature
   ```

6. **Apri una Pull Request** su GitHub

### Convenzioni Commit

Usiamo [Conventional Commits](https://www.conventionalcommits.org/) con emoji:

| Emoji | Tipo | Descrizione |
|-------|------|-------------|
| ✨ | `feat` | Nuova funzionalità |
| 🐛 | `fix` | Correzione bug |
| 📝 | `docs` | Documentazione |
| 💄 | `style` | UI/Stili (no logic) |
| ♻️ | `refactor` | Refactoring codice |
| 🧪 | `test` | Aggiunta test |
| 🔧 | `chore` | Configurazione/tooling |

### Struttura Branch

- `main` - Branch principale, sempre stabile
- `develop` - Branch di sviluppo
- `feature/*` - Nuove funzionalità
- `fix/*` - Correzioni bug
- `docs/*` - Documentazione

---

## 📋 Roadmap

Il progetto segue un piano di sviluppo in 8 fasi. Consulta [ROADMAP.md](./ROADMAP.md) per i dettagli completi.

### Stato Attuale

- [x] **Fase 1**: Setup & Configurazione ✅
- [ ] **Fase 2**: Database & API Base
- [ ] **Fase 3**: Autenticazione
- [ ] **Fase 4**: Prenotazione Posti
- [ ] **Fase 5**: Gestione Prestiti
- [ ] **Fase 6**: Dashboard & Analytics
- [ ] **Fase 7**: PWA & Notifiche
- [ ] **Fase 8**: Testing & Deploy

---

## 🔧 Script Disponibili

```bash
# Sviluppo
npm run dev          # Avvia server di sviluppo (Turbopack)
npm run build        # Build di produzione
npm run start        # Avvia build di produzione
npm run lint         # Linting con ESLint

# Database
npx prisma db push   # Sincronizza schema → database
npx prisma studio    # GUI per visualizzare dati
npx prisma generate  # Genera Prisma Client

# Docker
docker compose up -d    # Avvia servizi in background
docker compose down     # Ferma servizi
docker compose logs -f  # Visualizza logs
```

---

## 🌐 Servizi Locali

| Servizio | URL | Descrizione |
|----------|-----|-------------|
| **App** | http://localhost:3000 | BiblioFlow |
| **Adminer** | http://localhost:8080 | GUI Database |
| **Prisma Studio** | http://localhost:5555 | GUI Prisma |

---

## 📚 Documentazione HCI

Questo progetto nasce dal corso di Human-Computer Interaction. I documenti di analisi e design sono disponibili nella cartella `../ASSIGNMENT_HUMAN_COMPUTER_INTERACTION/`:

- **Assignment 1**: Analisi del problema, interviste utenti, scenari d'uso
- **Assignment 2**: Design UI/UX, mockup, valutazione euristica, specifiche di usabilità

---

## 👥 Team

- **Mario Celzo** - Developer & Designer

---

## 📄 Licenza

Questo progetto è sviluppato per scopi accademici.

---

<p align="center">
  Made with ❤️ for HCI Course
</p>
