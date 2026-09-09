# BiblioFlow

BiblioFlow e' una Progressive Web App per i servizi di una biblioteca
universitaria. Riunisce prenotazione e check-in dei posti studio, lista
d'attesa, prestiti, catalogo con servizio "Preparamelo", notifiche e una
dashboard amministrativa protetta da ruoli.

Applicazione pubblicata: [biblioflow-app.vercel.app](https://biblioflow-app.vercel.app/)

## Funzionalita'

### Studenti

- catalogo, prestiti e richieste Click & Collect;
- mappa accessibile dei posti con filtri e vista mobile;
- prenotazioni con margine di check-in per studenti pendolari;
- check-in tramite QR code firmato e check-out;
- ingresso e annullamento della lista d'attesa con posizione FIFO;
- proposta di ingresso in coda quando uno slot e' occupato;
- notifiche e aggiornamenti realtime su disponibilita' e promozioni.

### Personale

- dashboard con ruoli `BIBLIOTECARIO` e `ADMIN`;
- gestione di posti, prenotazioni, prestiti, utenti e richieste libri;
- cancellazione con promozione del primo utente in coda;
- scanner QR, monitoraggio anomalie e statistiche;
- indicatore delle richieste attive in lista d'attesa.

### Garanzie introdotte da CR-BF-01

- identita' e ownership derivate dalla sessione, non dal payload del client;
- validazione degli intervalli centralizzata nel servizio di dominio;
- creazione atomica con transazioni Prisma `Serializable`;
- vincolo PostgreSQL contro prenotazioni attive sovrapposte;
- coda FIFO senza duplicati attivi per utente e intervallo;
- promozione automatica e idempotente su cancellazione, no-show e scadenza;
- audit tramite `LogEvento`, notifiche correlate ed eventi SSE.

Il processo di manutenzione, l'impact analysis e le evidenze CA-01–CA-06 sono
raccolti in [`docs/`](docs/). Il riferimento immutabile precedente alla
change request e' il tag `baseline-pre-cr-bf-01`.

## Stack

- Node.js 20.19 o successivo, oppure 22.12 o successivo, e npm (minimo richiesto da Prisma 7);
- Next.js 16, React 19 e TypeScript;
- Tailwind CSS e componenti Radix/Shadcn;
- Prisma ORM 7 e PostgreSQL 16;
- NextAuth/Auth.js con sessioni JWT;
- Server-Sent Events per gli aggiornamenti realtime;
- Docker Compose per PostgreSQL e Redis locali;
- Vitest per test unitari e di integrazione.

## Avvio locale

### 1. Requisiti

Installare Git, Node.js 20.19 o successivo (oppure 22.12 o successivo) e Docker
Desktop con Docker Compose v2. Prisma 7 rifiuta le versioni di Node piu' vecchie.

```bash
node --version
npm --version
docker compose version
```

### 2. Clonazione e dipendenze

```bash
git clone https://github.com/mariocelzo/biblioflow-app.git
cd biblioflow-app
npm ci
```

`npm ci` usa le versioni bloccate in `package-lock.json` ed esegue
`prisma generate` tramite `postinstall`. Durante lo sviluppo, dopo una
modifica intenzionale delle dipendenze, e' possibile usare `npm install`.

### 3. Configurazione

Creare `.env` dal file di esempio.

PowerShell:

```powershell
Copy-Item .env.example .env
```

macOS/Linux:

```bash
cp .env.example .env
```

Nel nuovo `.env`:

1. scegliere una password locale e sostituire `CHANGEME_LOCAL_ONLY` sia in
   `POSTGRES_PASSWORD` sia dentro `DATABASE_URL`;
2. generare i segreti:

   ```bash
   npm run generate:secrets
   ```

3. copiare i valori generati per `NEXTAUTH_SECRET`, `CRON_SECRET` e
   `QR_SECRET`.

Non committare `.env` o segreti reali. Google OAuth, Sentry e VAPID sono
opzionali per l'avvio locale. Senza `QR_SECRET`, la chiave QR viene derivata
da `NEXTAUTH_SECRET`; configurarla separatamente resta consigliato.

### 4. Servizi locali

```bash
docker compose up -d postgres redis
docker compose ps
```

- PostgreSQL applicativo: `localhost:5432`;
- Redis: `localhost:6379`;
- Adminer opzionale: `docker compose up -d adminer`, poi
  [localhost:8080](http://localhost:8080).

Attendere che PostgreSQL risulti `healthy`.

### 5. Schema e dati dimostrativi

```bash
npx prisma migrate deploy
npx prisma db push
npm run db:seed
```

`migrate deploy` applica anche le migrazioni SQL custom, incluso il vincolo
anti-sovrapposizione. `db push` riallinea le parti dello schema legacy non
interamente descritte dalle prime migrazioni storiche. I comandi usano il
PostgreSQL locale indicato da `DATABASE_URL`.

Comandi Prisma utili:

```bash
npm run db:generate
npm run db:studio
```

`npx prisma migrate dev` e' riservato allo sviluppo intenzionale di nuove
migrazioni; non serve per avviare il progetto.

### 6. Applicazione

```bash
npm run dev
```

Aprire [localhost:3000](http://localhost:3000).

Account dimostrativi creati dal seed:

| Ruolo | Email | Password |
| --- | --- | --- |
| Studente | `mario.rossi@studenti.unisa.it` | `password123` |
| Bibliotecario | `giulia.romano@biblioteca.unisa.it` | `staff123` |
| Amministratore | `admin@biblioteca.unisa.it` | `admin123` |

Queste credenziali sono solo dati locali dimostrativi e non devono essere
riutilizzate in ambienti condivisi o di produzione.

Per arrestare i servizi:

```bash
docker compose down
```

Il comando mantiene i volumi. Eliminarli cancella i dati locali e va fatto
soltanto quando questa perdita e' intenzionale.

## Configurazione dell'ambiente

| Variabile | Obbligatoria | Uso |
| --- | :---: | --- |
| `POSTGRES_USER` | Docker locale | Utente del database applicativo. |
| `POSTGRES_PASSWORD` | Docker locale | Password PostgreSQL. |
| `POSTGRES_DB` | Docker locale | Nome del database applicativo. |
| `DATABASE_URL` | si' | Connessione Prisma/PostgreSQL. |
| `NEXTAUTH_URL` | si' | URL base dell'autenticazione. |
| `NEXTAUTH_SECRET` | si' | Sessioni; almeno 32 caratteri. |
| `NEXT_PUBLIC_APP_NAME` | no | Nome pubblico, default `BiblioFlow`. |
| `NEXT_PUBLIC_APP_URL` | no | URL pubblico dell'applicazione. |
| `CRON_SECRET` | consigliata | Protegge `/api/cron/automations`; senza valore la route rifiuta le richieste. |
| `QR_SECRET` | consigliata | Firma i QR; in assenza deriva da `NEXTAUTH_SECRET`. |
| `REDIS_URL` | no | Connessione Redis. |
| `GOOGLE_CLIENT_ID` | no | OAuth Google; richiede anche il client secret. |
| `GOOGLE_CLIENT_SECRET` | no | OAuth Google; richiede anche il client ID. |
| `NEXT_PUBLIC_SENTRY_DSN` | no | Invio degli errori a Sentry. |
| `NEXT_PUBLIC_VAPID_PUBLIC_KEY` | no | Chiave pubblica per notifiche push. |
| `TEST_DATABASE_URL` | no | Override del DB di test; deve identificarlo esplicitamente. |

`NODE_ENV` e `CI` sono gestite dagli strumenti e normalmente non vanno
impostate in `.env`.

## Test

### Suite corrente con PostgreSQL isolato

I test di integrazione usano `postgres-test` su `127.0.0.1:5433`, con
filesystem temporaneo. Lo script rifiuta URL che non identifichino chiaramente
un database di test.

1. Preparare schema e fixture:

   ```bash
   npm run test:db:prepare
   ```

2. Eseguire la suite forzando `DATABASE_URL` sul database di test.

   PowerShell:

   ```powershell
   $env:DATABASE_URL='postgresql://biblioflow_test@127.0.0.1:5433/biblioflow_test?schema=public'
   npm test
   ```

   macOS/Linux:

   ```bash
   DATABASE_URL='postgresql://biblioflow_test@127.0.0.1:5433/biblioflow_test?schema=public' npm test
   ```

3. Rimuovere sempre il container:

   ```bash
   npm run test:db:down
   ```

Se si personalizza `TEST_DATABASE_URL`, usare lo stesso valore come
`DATABASE_URL` durante `npm test`. Non usare il database applicativo o un
database condiviso per i test di integrazione.

Altri comandi:

```bash
npm run test:watch
npm run test:coverage
```

`npm test` esclude `tests/pre-modifica/**`: quei test caratterizzano il
sistema originale. La suite storica e' disponibile con `npm run test:pre` e
va interpretata rispetto al tag `baseline-pre-cr-bf-01`, come spiegato in
`docs/test/`.

### Pipeline completa in locale

La PR esegue cinque job: lint, typecheck, build, test e audit. L'equivalente
locale e':

```bash
npm ci
npm run lint
npx tsc --noEmit
npm run build
npm run test:db:prepare
```

Eseguire quindi `npm test` con la `DATABASE_URL` di test mostrata sopra e:

```bash
npm audit --audit-level=high
npm run test:db:down
```

Il job `audit` riporta le vulnerabilita' ma e' non bloccante; lint,
typecheck, build e test devono essere verdi. In CI le variabili sono repository
secrets/variables e PostgreSQL 16 e' un service container.

## Struttura essenziale

```text
src/app/                 pagine Next.js e route handler API
src/components/          componenti UI e funzionali
src/lib/                 auth, dominio, Prisma, automazioni e realtime
prisma/                  schema, migrazioni e seed
tests/                   suite correnti e caratterizzazione pre-modifica
docs/                    analisi, diagrammi e report di test
.github/workflows/       pipeline CI e deploy migrazioni
```

## Documentazione

- [Verifica finale](docs/test/verifica-finale-criteri-accettazione.md)
- [Specifica post-modifica](docs/test/spec-post-modifica.md)
- [Report parti modificate](docs/test/report-post-modifica.md)
- [Report di regressione](docs/test/report-regressione.md)
- [Diagramma componenti AS-IS](docs/diagrammi/prenotazione-componenti-as-is.md)
- [Diagramma stati AS-IS](docs/diagrammi/prenotazione-stati-as-is.md)
- [Regole di contribuzione](CONTRIBUTING.md)

## Contribuire

`main` e' protetto. Ogni modifica parte da `main` aggiornato, usa un branch
dedicato e arriva tramite PR revisionata con CI verde. Le convenzioni complete
sono in [`CONTRIBUTING.md`](CONTRIBUTING.md).

## Contesto accademico

Il progetto nasce nel corso di Human-Computer Interaction ed e' stato oggetto
di manutenzione evolutiva per il corso di Ingegneria, Gestione ed Evoluzione
del Software, Universita' degli Studi di Salerno, A.A. 2025/2026.
