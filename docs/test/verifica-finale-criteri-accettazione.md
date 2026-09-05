# Verifica finale dei criteri di accettazione — CR-BF-01

## Identificazione

| Campo | Valore |
| --- | --- |
| Task | BIB-63 — Verifica finale dei criteri di accettazione |
| Fase | 6 — test post-modifica e regressione |
| Versione verificata | `main` (`adc5e30`) dopo il merge delle Fasi 4 e 5; aggiornamento CA-01 su branch `cr-bf-01-fix-bib-68-ca-01-admin-auth` (BIB-68) |
| Data | 2026-09-04 CEST (prima verifica) — aggiornato 2026-09-04 CEST dopo BIB-68 |
| Ambiente | Node.js 22.12.0, npm 10.9.0, Docker, PostgreSQL 16 Alpine |
| Esito complessivo | **CONFORME — 6 criteri verificati su 6** |

## Decisione

La change request e' **accettabile**: tutti e sei i criteri sono verificati
con evidenza automatizzata. Alla prima verifica (2026-09-04) **CA-01 non era
soddisfatto**: tre richieste verso route admin non applicavano il codice
401/403 previsto (`GET /api/admin/posti/[id]`, `GET`/`PATCH
/api/admin/richieste`). La task correttiva **BIB-68** ha chiuso i tre varchi
con guardia "sessione + ruolo staff" eseguita prima di leggere parametri/body
o toccare Prisma, e ha promosso i target `TC-BIB57-051`/`054` da `it.fails` a
test ordinari verdi (più `TC-BIB57-050/052/053/055..060` a copertura del
contratto 401/403/422). CA-02, CA-03, CA-04, CA-05 e CA-06 restano verificati
come nella prima passata.

Questo documento registra sia l'esito originale (sezione "Prima verifica —
CA-01 non conforme", conservata per tracciabilita') sia l'aggiornamento dopo
BIB-68.

## Matrice finale

| Criterio | Esito | Evidenza principale | Decisione |
| --- | :---: | --- | --- |
| CA-01 — accesso | **PASS** (dopo BIB-68) | `tests/integration/autorizzazione-admin.test.ts`: 36/36 passati, 0 `expected fail`; `TC-BIB57-050/051/052/053/054/055` provano la chiusura dei 3 varchi, `TC-BIB57-056/057/058/059/060` coprono staff/validazione | Verificato |
| CA-02 — concorrenza | **PASS** | suite PostgreSQL isolata ripetuta 5 volte: 10/10 casi passati | Verificato |
| CA-03 — lista d'attesa | **PASS** | vincolo DB, ordinamento FIFO/id, middleware e flussi UI nella selezione CA-03–05: 113/113 | Verificato |
| CA-04 — riassegnazione | **PASS** | promozione, lock, idempotenza e ciclo end-to-end nella selezione CA-03–05: 113/113 | Verificato |
| CA-05 — tracciabilita' | **PASS** | log, notifiche, correlazione e realtime nella selezione CA-03–05: 113/113 | Verificato |
| CA-06 — regressione | **PASS** | BIB-62: 20/20 casi invariati passati, identici alla baseline | Verificato |

## Gate tecnici

| Controllo | Esito | Dettaglio |
| --- | :---: | --- |
| `npm run lint` | PASS | 0 errori, 24 warning preesistenti |
| `npx tsc --noEmit` | PASS | 0 errori |
| `npm test` (dopo BIB-68) | **PASS pieno** | 21/21 file; **187 passati, 0 `expected fail`** — i due target `it.fails` sono ora `it()` verdi |
| `npm run build` | PASS | Next.js 16; 43 pagine statiche; soli warning di deprecazione Sentry |
| `npm audit --audit-level=high` | PASS | 0 vulnerabilita' alte/critiche |

Alla prima verifica il processo Vitest terminava comunque con codice 0 perche'
i due target di sicurezza erano espressi con `it.fails` — non rendeva CA-01
conforme, perche' `it.fails` prova solo che il comportamento desiderato non e'
ancora implementato. Dopo BIB-68 quei due target sono `it()` ordinari e
passano per il motivo giusto: la guardia e' implementata.

## CA-01 — accesso: verificato (dopo BIB-68)

### Prima verifica (BIB-63, 2026-09-04) — non conforme

La selezione focalizzata aveva prodotto:

```text
Test Files  4 passed (4)
Tests       45 passed | 2 expected fail (47)
```

I casi che descrivevano lo stato reale e i corrispondenti target erano:

| Caso | Richiesta | Atteso | Osservato |
| --- | --- | --- | --- |
| `TC-BIB57-050` / target `051` | STUDENTE, `GET /api/admin/posti/[id]` | 403 | la logica handler viene eseguita; 404 o 200, mai 403 |
| `TC-BIB57-052` | anonimo, `GET /api/admin/richieste` | 401 | 200 |
| `TC-BIB57-053` | anonimo, `PATCH /api/admin/richieste` | 401 | 200 e mutazione eseguita |
| target `TC-BIB57-054` | STUDENTE, `GET /api/admin/richieste` | 403 | nessuna guardia di autenticazione/ruolo |

Interventi individuati:

1. applicare una guardia staff a `GET /api/admin/posti/[id]`;
2. applicare autenticazione e ruolo staff a `GET` e `PATCH /api/admin/richieste`;
3. convertire `TC-BIB57-051` e `TC-BIB57-054` da `it.fails` a test ordinari;
4. rieseguire suite CA-01 e gate completi.

La correzione non era stata effettuata in BIB-63 per rispettare sia il
perimetro di una task di verifica sia la responsabilita' dell'area admin/UI.

### Correzione (BIB-68) e verifica finale — conforme

BIB-68 ha applicato la guardia "sessione + ruolo staff" — eseguita **prima**
di leggere parametri/body o interrogare Prisma — a `GET
/api/admin/posti/[id]` e a `GET`/`PATCH /api/admin/richieste`; nel `PATCH` ha
aggiunto anche la validazione di `stato` (contro l'enum Prisma
`StatoRichiesta`) e di `note` (≤ 500 caratteri), entrambe 422 se non valide.

Matrice 401/403 verificata (`tests/integration/autorizzazione-admin.test.ts`,
blocco 05x):

| Route | Anonimo | STUDENTE | BIBLIOTECARIO/ADMIN |
| --- | :---: | :---: | :---: |
| `GET /api/admin/posti/[id]` | 401 (già coperto, `TC-BIB57-007`) | **403** (`TC-BIB57-050/051`) | consentito (`TC-BIB57-060`) |
| `GET /api/admin/richieste` | **401** (`TC-BIB57-052`) | **403** (`TC-BIB57-054`) | consentito, 200 (`TC-BIB57-056`) |
| `PATCH /api/admin/richieste` | **401** (`TC-BIB57-053`) | **403** (`TC-BIB57-055`) | consentito, muta (`TC-BIB57-057`) |

In tutti i casi 401/403 nessuna query o mutazione Prisma viene invocata
(asserito esplicitamente in ciascun test). Aggiunta anche la validazione del
`PATCH`: `stato` fuori enum → 422 (`TC-BIB57-058`), `note` > 500 caratteri →
422 (`TC-BIB57-059`), nessuno dei due muta.

Esito della suite focalizzata dopo la correzione:

```text
Test Files  1 passed (1)
Tests       36 passed (36)
```

`TC-BIB57-051` e `TC-BIB57-054` non sono più `it.fails`: sono `it()` ordinari
e verdi. CA-01 e' quindi **verificato** secondo lo stesso criterio applicato
agli altri cinque.

## CA-02 — concorrenza: verificato

`tests/integration/concorrenza.test.ts` e' stato eseguito cinque volte in
sequenza contro PostgreSQL reale. Ogni esecuzione comprende:

- due richieste simultanee ripetute internamente su tre round;
- N richieste simultanee con controllo dell'unico vincitore e assenza di record
  fantasma.

Esito aggregato:

```text
RUN 1..5: exit 0
Test Files  1 passed (1) per esecuzione
Tests       2 passed (2) per esecuzione
Totale      10/10 passati
```

I messaggi Prisma relativi a write conflict, deadlock o violazione del vincolo
di esclusione sono attesi: rappresentano le richieste perdenti che il dominio
traduce in conflitto, non fallimenti del test.

## CA-03, CA-04 e CA-05 — verificati

Una selezione di dieci file focalizzati su lista d'attesa, dominio,
riassegnazione, automazioni, notifiche e realtime ha prodotto:

```text
Test Files  10 passed (10)
Tests       113 passed (113)
```

Le evidenze includono:

- unicita' DB della richiesta in coda e nessun duplicato;
- ordinamento deterministico per `createdAt` con `id` come tie-breaker;
- promozione transazionale senza sovrapposizioni;
- idempotenza di lock cron, scadenza e promozione;
- log correlati e notifiche per ingresso, uscita, promozione e scadenza;
- propagazione realtime ai soli canali previsti.

## CA-06 — regressione: verificato

Il report BIB-62 confronta tutti i casi invariati con BIB-22:

```text
Baseline        20/20 PASS
Post-modifica   20/20 PASS
Differenze      0
```

Le differenze del check-in sono miglioramenti intenzionali classificati come
**MODIFICATI**, mentre i limiti PWA osservati esistevano gia' nella baseline.
Non risultano regressioni introdotte dalla CR-BF-01 nel perimetro definito.

## Stabilita' della suite completa

Dopo l'esecuzione di diversi sottoinsiemi sullo stesso database, una prima
esecuzione completa ha riportato un singolo test intermittente. L'output
diagnostico non ha permesso di attribuirlo a un criterio. L'anomalia non si e'
riprodotta:

- 10 riesecuzioni complete consecutive: tutte verdi;
- ultima esecuzione dopo ricreazione del container, 7/7 migrazioni e fixture
  pulita: 179 passati, 2 `expected fail`, 0 fallimenti inattesi;
- suite concorrenza isolata: 5/5 esecuzioni verdi.

Il dato e' registrato per trasparenza come probabile contaminazione dello stato
di test durante la sessione esplorativa. Non c'e' al momento un fallimento
riproducibile da aprire come regressione; se ricompare in CI va conservato il log
completo e aperta una task di stabilizzazione del test database.

## Stato consigliato

- BIB-63: **6/6 — pronta per la revisione**, dopo il merge della PR correttiva
  di BIB-68.
- BIB-68: correzione implementata e verificata (401/403/422 su tutte e tre le
  route, 36/36 test focalizzati, 187/187 sulla suite completa); in revisione.
- BIB-7 (epic Fase 6): chiudibile dopo il merge della PR di BIB-68.
- BIB-60, BIB-61 e BIB-62: documenti disponibili nelle rispettive PR e pagine
  Confluence, invariati da questo aggiornamento.

## Cronologia

| Data | Evento |
| --- | --- |
| 2026-09-04 | Prima verifica (BIB-63): 5/6, CA-01 bloccato da 3 varchi sulle route admin. |
| 2026-09-04 | BIB-68: guardie applicate, `TC-BIB57-051`/`054` promossi da `it.fails` a `it()` verdi, 6 nuovi casi (`055`-`060`) a copertura di ruoli/validazione. Verifica finale aggiornata a **6/6**. |
