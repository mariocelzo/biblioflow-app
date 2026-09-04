# Verifica finale dei criteri di accettazione — CR-BF-01

## Identificazione

| Campo | Valore |
| --- | --- |
| Task | BIB-63 — Verifica finale dei criteri di accettazione |
| Fase | 6 — test post-modifica e regressione |
| Versione verificata | `main` (`adc5e30`) dopo il merge delle Fasi 4 e 5 |
| Data | 2026-09-04 CEST |
| Ambiente | Windows 11 Pro, Node.js 22.12.0, npm 10.9.0, Docker 29.1.3, PostgreSQL 16 Alpine |
| Esito complessivo | **NON CONFORME — 5 criteri verificati su 6** |

## Decisione

La change request non puo' essere dichiarata accettata: **CA-01 non e'
soddisfatto**. Tre richieste verso route admin non applicano il codice 401/403
previsto. CA-02, CA-03, CA-04, CA-05 e CA-06 risultano verificati con evidenza
automatizzata.

Questo documento e il relativo commit sono esclusivamente documentali. Non e'
stato modificato codice applicativo: le route bloccanti appartengono all'area
admin/UI, che la divisione del lavoro assegna ad Alfonso.

## Matrice finale

| Criterio | Esito | Evidenza principale | Decisione |
| --- | :---: | --- | --- |
| CA-01 — accesso | **FAIL** | 45 test passati e 2 `expected fail`; `TC-BIB57-050`, `052`, `053` confermano tre varchi | Bloccante |
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
| `npm test` | PASS tecnico | 21/21 file; 179 passati, 2 `expected fail` su 181 |
| `npm run build` | PASS | Next.js 16.3.3; 43 pagine statiche; soli warning di deprecazione Sentry |
| `npm audit --audit-level=high` | PASS | 0 vulnerabilita' alte/critiche; 2 moderate |
| `git diff --check` | PASS | nessun errore di whitespace nel documento |

Il processo Vitest termina con codice 0 perche' i due target di sicurezza sono
espressi con `it.fails`. Questo non rende CA-01 conforme: `it.fails` prova che il
comportamento desiderato continua a non essere implementato.

## CA-01 — accesso: non conforme

La selezione focalizzata ha prodotto:

```text
Test Files  4 passed (4)
Tests       45 passed | 2 expected fail (47)
```

I casi che descrivono lo stato reale e i corrispondenti target sono:

| Caso | Richiesta | Atteso | Osservato |
| --- | --- | --- | --- |
| `TC-BIB57-050` / target `051` | STUDENTE, `GET /api/admin/posti/[id]` | 403 | la logica handler viene eseguita; 404 o 200, mai 403 |
| `TC-BIB57-052` | anonimo, `GET /api/admin/richieste` | 401 | 200 |
| `TC-BIB57-053` | anonimo, `PATCH /api/admin/richieste` | 401 | 200 e mutazione eseguita |
| target `TC-BIB57-054` | STUDENTE, `GET /api/admin/richieste` | 403 | nessuna guardia di autenticazione/ruolo |

Interventi necessari prima dell'accettazione:

1. applicare una guardia staff a `GET /api/admin/posti/[id]`;
2. applicare autenticazione e ruolo staff a `GET` e `PATCH /api/admin/richieste`;
3. convertire `TC-BIB57-051` e `TC-BIB57-054` da `it.fails` a test ordinari;
4. rieseguire suite CA-01 e gate completi.

La correzione non e' stata effettuata in BIB-63 per rispettare sia il perimetro
di una task di verifica sia la responsabilita' dell'area admin/UI.

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

- BIB-63: **In corso / bloccata da CA-01**, non completata.
- BIB-7 (epic Fase 6): **non chiudere**.
- BIB-60, BIB-61 e BIB-62: documenti disponibili nelle rispettive PR e pagine
  Confluence.

La verifica finale potra' essere promossa a `PASS 6/6` solo dopo la correzione
delle tre richieste admin e la conversione dei due target `it.fails` in test
ordinari verdi.
