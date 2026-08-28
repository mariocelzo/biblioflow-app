# Report di esecuzione dei test pre-modifica

## Scopo

Questo documento registra l'esecuzione della suite sul sistema precedente alla CR-BF-01. È il secondo documento di testing richiesto dal corso e va letto insieme alla specifica dei casi pre-modifica.

- Task: [BIB-22 — Report di esecuzione dei test pre-modifica](https://mariospaceforuni.atlassian.net/browse/BIB-22)
- Responsabile operativo dell'esecuzione: Renato Mancino
- Baseline funzionale: tag **`baseline-pre-cr-bf-01`**, commit `911c4d5ae31a9333e95c1b867efb464c93ebc92f`
- Commit con infrastruttura di test: `74699693967a4238152349360f02e9542b849460` (`main`)
- Suite prenotazioni BIB-19: commit `8e2f5c5d100877bd22673feea7348fdf6875ae65`
- Suite admin/UI BIB-21: commit `01ca66d4704ca96ef20461e0cfda53595e1ab4ae`
- Data e ora dell'esecuzione completa: **2026-08-28 17:59:57 CEST**
- Criteri di accettazione CR-BF-01: nessuno specifico; l'esecuzione costituisce la baseline di confronto

## Metodo di esecuzione

Il tag funzionale precede l'introduzione di Vitest e quindi, da solo, non contiene il comando `npm test`. L'esecuzione ha usato `main` al commit `7469969`, che rende testabile la baseline, più i soli file di test prodotti nelle PR indipendenti BIB-19 e BIB-21.

Per non contaminare il branch documentale sono stati creati worktree temporanei ai commit delle due suite. L'esecuzione finale ha unito esclusivamente i cinque file `tests/pre-modifica/*.test.ts`; i sorgenti applicativi sono rimasti quelli del riferimento di esecuzione. I worktree e il database sono stati rimossi al termine.

### Ambiente

| Componente | Versione/configurazione |
|---|---|
| Sistema | Windows, timezone `Europe/Rome` |
| Node.js | `v22.12.0` |
| npm | `10.9.0` |
| Vitest | `4.1.11` |
| Docker | `29.1.3` |
| Database | PostgreSQL 16 Alpine, container effimero `biblioflow-test-db` |
| URL test | database `biblioflow_test` su `127.0.0.1:5433` |

### Comandi

```text
npm run test:db:prepare
npm test
npm run test:db:down
```

La preparazione ha applicato lo schema Prisma con `prisma db push` sul solo database di test e ha caricato la fixture minima: un utente, una sala, un posto e una prenotazione.

## Esito complessivo

| Indicatore | Risultato |
|---|---:|
| File di test | 5 superati su 5 |
| Casi univoci | 34 superati su 34 |
| Casi falliti | 0 |
| Casi saltati | 0 |
| Durata Vitest | 3,47 s |
| Esito processo | `PASS` |

Un caso `PASS` indica che il comportamento osservato coincide con quello specificato per la baseline. Non implica che il comportamento sia desiderabile: i casi di caratterizzazione passano quando riproducono correttamente un difetto già presente.

## Esito per caso — prenotazioni

| ID | Esito | Evidenza e note |
|---|:---:|---|
| `TC-PRE-001` | PASS | Creazione valida: HTTP 201, stato `CONFERMATA`, log e notifica richiesti. |
| `TC-PRE-002` | PASS | Campo obbligatorio mancante rifiutato senza creazione. |
| `TC-PRE-003` | PASS | Intervallo fuori dall'orario della sala rifiutato. |
| `TC-PRE-004` | PASS | **Difetto confermato:** un intervallo con fine precedente all'inizio viene accettato. |
| `TC-PRE-005` | PASS | Sovrapposizione sullo stesso posto rifiutata con conflitto. |
| `TC-PRE-006` | PASS | Cancellazione logica e registrazione dell'evento eseguite. |
| `TC-PRE-007` | PASS | **Difetto confermato:** un check-in temporalmente valido è giudicato scaduto per il confronto fra data reale e campo Prisma `@db.Time`. |
| `TC-PRE-008` | PASS | Il percorso PATCH legacy completa il check-in e occupa il posto. |
| `TC-PRE-009` | PASS | Estensione sovrapposta alla prenotazione successiva rifiutata. |
| `TC-PRE-010` | PASS | **Difetto confermato:** un'estensione libera è rifiutata come superiore a otto ore per il calcolo fra date incompatibili. |

## Esito per caso — login, admin e UI

| ID | Esito | Evidenza e note |
|---|:---:|---|
| `TC-PRE-011` | PASS | Account attivo autenticato e ultimo accesso aggiornato. |
| `TC-PRE-012` | PASS | Password errata rifiutata senza aggiornare l'accesso. |
| `TC-PRE-013` | PASS | Account disattivato rifiutato prima della verifica password. |
| `TC-PRE-014` | PASS | Pagina admin anonima reindirizzata al login con callback URL. |
| `TC-PRE-015` | PASS | API protetta anonima rifiutata con HTTP 401. |
| `TC-PRE-016` | PASS | La presenza del cookie lascia proseguire `/prenota`; il middleware non valida contenuto del token o ruolo. |
| `TC-PRE-017` | PASS | STUDENTE rifiutato dall'API statistiche admin con HTTP 403 e senza query dati. |
| `TC-PRE-018` | PASS | BIBLIOTECARIO rifiutato dalla modifica dello stato utente, riservata ad ADMIN. |
| `TC-PRE-019` | PASS | BIBLIOTECARIO ammesso alla lettura di dettagli e conteggi utente. |
| `TC-PRE-020` | PASS | Restituzione prestito registrata con stato, data, log e notifica. |
| `TC-PRE-021` | PASS | Cancellazione admin di una prenotazione in check-in e liberazione del posto eseguite. |
| `TC-PRE-022` | PASS | Tasso no-show aggregato nelle percentuali attese. |
| `TC-PRE-023` | PASS | **Comportamento da modificare:** la UI invia ancora `userId` nel payload di prenotazione. |
| `TC-PRE-024` | PASS | Il payload prodotto dalla UI crea una prenotazione confermata con HTTP 201. |

## Esito per caso — automazioni e notifiche

| ID | Esito | Evidenza e note |
|---|:---:|---|
| `PRE-AUT-001` | PASS | Promemoria check-in prodotto con notifica e log. |
| `PRE-AUT-002` | PASS | Seconda esecuzione giornaliera idempotente: nessun duplicato. |
| `PRE-AUT-003` | PASS | No-show automatico: stato `NO_SHOW`, posto liberato, notifica e log. |
| `PRE-AUT-004` | PASS | `SCADUTA` resta invariato e senza eventi; la baseline non genera automaticamente questo stato. |
| `PRE-NOT-001` | PASS | Notifica di posto disponibile inviata all'utente con preferenza osservata. |
| `PRE-NOT-002` | PASS | Contratto GET notifiche preservato per filtro, paginazione e conteggi. |

## Esito per caso — SSE

| ID | Esito | Evidenza e note |
|---|:---:|---|
| `PRE-SSE-001` | PASS | Header SSE e commento iniziale `: connected` conformi alla baseline. |
| `PRE-SSE-002` | PASS | Framing `event/data` e consegna ai soli canali richiesto e wildcard. |
| `PRE-SSE-003` | PASS | Payload `posto-update` completo e timestamp ISO. |
| `PRE-SSE-004` | PASS | Client rimosso dal registro alla chiusura dello stream. |

Questi casi verificano il contratto dei singoli componenti SSE. Non dimostrano un collegamento end-to-end con la pagina di prenotazione: l'analisi BIB-16 ha rilevato che hook, endpoint ed emitter esistono ma non sono collegati completamente alla UI nella baseline.

## Output di `npm test`

```text
> biblioflow-app@0.1.0 test
> vitest run --passWithNoTests

 RUN  v4.1.11 C:/codex-temp-bib22-core

 Test Files  5 passed (5)
      Tests  34 passed (34)
   Start at  17:59:57
   Duration  3.47s (transform 687ms, setup 0ms, import 1.10s,
             tests 3.25s, environment 1ms)
```

## Anomalie e limiti della baseline

L'esecuzione conferma tre difetti funzionali già specificati:

1. intervalli invertiti accettati in creazione (`TC-PRE-004`);
2. check-in dedicato errato per confronto data/ora (`TC-PRE-007`);
3. estensione libera rifiutata per date incompatibili (`TC-PRE-010`).

Conferma inoltre due contratti destinati a cambiare: identità inviata dalla UI (`TC-PRE-023`) e middleware basato sulla sola presenza del cookie (`TC-PRE-016`). BIB-18 ha censito ulteriori varchi di autorizzazione — accesso a prenotazioni altrui e route admin prive di controllo ruolo — che non hanno ancora un caso negativo eseguibile nella suite pre-modifica. Dovranno comparire nella specifica post-modifica per CA-01.

## Conclusione

La suite pre-modifica è riproducibile e completamente verde sulla baseline testabile: **34/34 casi superati**. Il risultato fissa sia i comportamenti da preservare sia i difetti da correggere e costituisce il riferimento quantitativo per i report post-modifica e di regressione.
