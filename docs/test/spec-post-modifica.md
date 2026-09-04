# Specifica dei casi di test post-modifica — CR-BF-01

## Identificazione

| Campo | Valore |
| --- | --- |
| Task | BIB-60 — Specifica dei casi di test post-modifica |
| Fase | 6 — test post-modifica e regressione |
| Baseline pre-modifica | tag `baseline-pre-cr-bf-01` (`e0742bf`) |
| Versione post-modifica analizzata | `main` (`adc5e30`) dopo il merge delle Fasi 4 e 5 |
| Specifica di confronto | `docs/test/spec-pre-modifica.md` |
| Suite corrente | `npm test` (esclude intenzionalmente `tests/pre-modifica/**`) |
| Suite di caratterizzazione | `npm run test:pre` |

## Scopo e criterio di classificazione

Questo documento e' il terzo deliverable di testing richiesto dal corso. Descrive
come cambia la suite tra la baseline e la versione che implementa CR-BF-01 senza
rinumerare i 34 casi pre-modifica.

- **AGGIUNTO**: scenario inesistente nella baseline, introdotto per la change
  request o per un suo ripple effect.
- **MODIFICATO**: conserva l'ID pre-modifica, ma cambia il comportamento atteso,
  il contratto o il percorso applicativo verificato.
- **ELIMINATO**: caso non piu' valido e non sostituito. Non ce ne sono.
- **INVARIATO**: comportamento preesistente da rieseguire come regressione.

I test di caratterizzazione restano separati dalla suite corrente: `npm test`
verifica l'implementazione post-modifica, mentre `npm run test:pre` conserva
l'evidenza storica. La classificazione seguente, non la cartella fisica del test,
determina quali casi alimentano il report di regressione BIB-62.

## Sintesi

| Categoria | Numero | Destinazione |
| --- | ---: | --- |
| Aggiunti | 181 | Report parti modificate (BIB-61) |
| Modificati | 14 | Report parti modificate (BIB-61) |
| Eliminati | 0 | Nessuna motivazione necessaria |
| Invariati | 20 | Report di regressione (BIB-62) |

Il conteggio dei casi aggiunti considera le espansioni di `it.each` e i test
parametrici come casi distinti, coerentemente con il conteggio prodotto da Vitest.

## Casi MODIFICATI — ID pre-modifica mantenuti

| ID stabile | Area | Variazione post-modifica | Evidenza automatizzata corrente | CA |
| --- | --- | --- | --- | --- |
| `TC-PRE-001` | Creazione | L'identita' non proviene piu' dal payload; la creazione usa sessione e transazione `Serializable`. | `auth-prenotazioni.test.ts`; `TC-BIB31-001` | CA-01, CA-02 |
| `TC-PRE-002` | Validazione | I campi obbligatori sono validati dal contratto centralizzato prima delle scritture. | `TC-BIB27-003`–`008` | CA-02 |
| `TC-PRE-003` | Orari sala | La verifica degli orari e' unica nel servizio di dominio e copre anche sala inattiva. | `TC-BIB27-012`, `TC-BIB27-013` | CA-02 |
| `TC-PRE-004` | Intervallo invertito | Il difetto caratterizzato e' corretto: fine non successiva all'inizio produce errore 422, non piu' 201. | `TC-BIB27-005` | CA-02 |
| `TC-PRE-005` | Sovrapposizione posto | Il controllo e' transazionale e garantito anche dal vincolo PostgreSQL; il conflitto propone la coda. | `TC-BIB24-DB-001`–`003`; suite concorrenza; `TC-BIB31-002` | CA-02, CA-03 |
| `TC-PRE-006` | Cancellazione utente | Mantiene cancellazione e log, aggiungendo ownership e promozione idempotente del primo in coda. | suite auth/ownership; `TC-BIB31-007` | CA-01, CA-04, CA-05 |
| `TC-PRE-007` | Check-in dedicato | Il confronto `Date`/`Time` e' corretto ricomponendo data e orario; restano sessione, ownership e finestra. | suite auth/ownership e integrazione prenotazioni | CA-01, CA-06 |
| `TC-PRE-008` | Check-in legacy | Il percorso legacy non puo' aggirare sessione, ownership o stati ammessi. | suite auth/ownership | CA-01, CA-06 |
| `TC-PRE-009` | Estensione in conflitto | L'estensione riusa la validazione centralizzata e il medesimo modello di sovrapposizione atomica. | `TC-BIB27-015`–`020`; suite auth/ownership | CA-01, CA-02 |
| `TC-PRE-010` | Estensione libera | Il difetto `Date`/`Time` e' corretto; la durata e' calcolata sul giorno della prenotazione. | `TC-BIB27-006`–`008` | CA-02, CA-06 |
| `TC-PRE-021` | Cancellazione admin | Oltre a cancellare e liberare il posto, tenta la promozione e restituisce un esito comprensibile allo staff. | `TC-BIB49-001`–`004`; `TC-BIB50-001`–`003` | CA-04, CA-06 |
| `TC-PRE-023` | Payload UI | Il client non invia piu' un `userId` autorevole; sui conflitti espone l'azione di ingresso in coda. | `TC-BIB52-002`; `TC-BIB53-003`; `TC-BIB54-001`–`004` | CA-01, CA-03, CA-06 |
| `TC-PRE-024` | Flusso UI | Il percorso libero resta 201; il percorso occupato continua in coda dalla mappa, dal mobile o dal dialog di conflitto. | `TC-BIB52-001`–`002`; `TC-BIB53-001`–`005`; `TC-BIB58-001` | CA-03, CA-04, CA-06 |
| `PRE-AUT-003` | No-show | Oltre a marcare `NO_SHOW` e liberare il posto, processa la coda con tracciabilita' e protezione dalle doppie esecuzioni. | `TC-BIB40-001`–`007`; `TC-BIB47-001`–`004` | CA-04, CA-05 |

## Casi INVARIATI — base della regressione

| ID stabile | Comportamento da preservare | Modalita' di riesecuzione |
| --- | --- | --- |
| `TC-PRE-011` | Login valido e aggiornamento ultimo accesso. | `tests/pre-modifica/login.test.ts` |
| `TC-PRE-012` | Password errata senza aggiornamento. | `tests/pre-modifica/login.test.ts` |
| `TC-PRE-013` | Account disattivato rifiutato. | `tests/pre-modifica/login.test.ts` |
| `TC-PRE-014` | Pagina admin anonima reindirizzata al login. | `tests/pre-modifica/admin-ui.test.ts` |
| `TC-PRE-015` | API admin protetta anonima risponde 401. | `tests/pre-modifica/admin-ui.test.ts` e BIB-57 |
| `TC-PRE-016` | Pagina prenota accessibile con cookie di sessione. | `tests/pre-modifica/admin-ui.test.ts` |
| `TC-PRE-017` | Studente rifiutato sulle statistiche admin. | `tests/pre-modifica/admin-ui.test.ts`; `TC-BIB57-010`–`015` |
| `TC-PRE-018` | Bibliotecario non puo' cambiare lo stato di un account. | `tests/pre-modifica/admin-ui.test.ts`; `TC-BIB57-030` |
| `TC-PRE-019` | Staff legge dettagli e conteggi utente. | `tests/pre-modifica/admin-ui.test.ts`; `TC-BIB57-023` |
| `TC-PRE-020` | Restituzione prestito conserva stato, log e notifica. | `tests/pre-modifica/admin-ui.test.ts` |
| `TC-PRE-022` | Distribuzione no-show mantiene valori e percentuali. | `tests/pre-modifica/admin-ui.test.ts`; `TC-BIB55-001`–`002` |
| `PRE-AUT-001` | Promemoria check-in produce notifica e log. | `tests/pre-modifica/automation-notifications.test.ts` |
| `PRE-AUT-002` | Promemoria giornaliero non duplicato. | `tests/pre-modifica/automation-notifications.test.ts` |
| `PRE-AUT-004` | Una prenotazione gia' `SCADUTA` non viene trattata come no-show. | `tests/pre-modifica/automation-notifications.test.ts` |
| `PRE-NOT-001` | Notifica disponibilita' posto conserva tipo e collegamento. | `tests/pre-modifica/automation-notifications.test.ts` |
| `PRE-NOT-002` | API notifiche conserva filtro, paginazione e conteggi. | `tests/pre-modifica/automation-notifications.test.ts`; `TC-BIB47-008` |
| `PRE-SSE-001` | Endpoint SSE conserva headers e handshake iniziale. | `tests/pre-modifica/sse-posti.test.ts` |
| `PRE-SSE-002` | Framing e isolamento dei canali SSE restano invariati. | `tests/pre-modifica/sse-posti.test.ts`; `TC-BIB45-009`–`010` |
| `PRE-SSE-003` | Evento `posto-update` conserva il payload. | `tests/pre-modifica/sse-posti.test.ts`; `TC-BIB45-006` |
| `PRE-SSE-004` | Chiusura stream rimuove il client. | `tests/pre-modifica/sse-posti.test.ts` |

## Casi ELIMINATI

Nessun caso e' stato eliminato. I quattro casi che caratterizzavano difetti
(`TC-PRE-004`, `TC-PRE-007`, `TC-PRE-010` e la parte vulnerabile del contratto
di `TC-PRE-023`) restano nello storico con il medesimo ID e sono classificati
come **MODIFICATI**: eliminarli avrebbe nascosto l'evidenza del miglioramento.

## Casi AGGIUNTI — Fase 2, dati e dominio (41)

| Famiglia | ID / descrizione | N. | CA |
| --- | --- | ---: | --- |
| Vincolo univoco lista d'attesa | `TC-BIB23-DB-001`–`004` | 4 | CA-03 |
| Vincolo DB anti-sovrapposizione | `TC-BIB24-DB-001`–`003` | 3 | CA-02 |
| Helper autenticazione e ownership | `TC-BIB26-001`–`007` | 7 | CA-01 |
| Validazione centralizzata | `TC-BIB27-001`–`020` | 20 | CA-02, CA-03 |
| Operazioni transazionali di dominio | `TC-BIB31-001`–`007` | 7 | CA-02, CA-03, CA-04, CA-05 |

## Casi AGGIUNTI — Fase 3, API sicure (8)

| Famiglia | Casi | N. | CA |
| --- | --- | ---: | --- |
| Autenticazione e ownership API | 401 aggregato su 11 operazioni; 404 su GET/PATCH/DELETE altrui; identita' del payload ignorata; studente su admin 403 | 6 | CA-01 |
| Concorrenza reale PostgreSQL | due richieste simultanee ripetute per tre round; N richieste senza record fantasma | 2 | CA-02 |

I due casi concorrenti sono identificati dalla descrizione e dal file
`tests/integration/concorrenza.test.ts`; i casi di ownership sono in
`tests/integration/auth-prenotazioni.test.ts`. I loro nomi sono stabili anche
dove la suite originaria di Fase 3 non ha inserito un prefisso `TC-*`.

## Casi AGGIUNTI — Fase 4, automazioni/notifiche/realtime (72)

| Famiglia | ID / descrizione | N. | CA |
| --- | --- | ---: | --- |
| No-show e processore coda | `TC-BIB40-001`–`007`, `TC-BIB47-U1` | 8 | CA-04 |
| Lock cron | `TC-BIB41-001`–`003` | 3 | CA-04 |
| Notifiche eventi coda | `TC-BIB42-001`–`006` | 6 | CA-05 |
| Finestra conferma promozione | `TC-BIB44-001`–`006` | 6 | CA-04 |
| Contratti realtime | `TC-BIB45-001`–`010` | 10 | CA-05, CA-06 |
| Correlazione audit | `TC-BIB46-001`–`006` | 6 | CA-05 |
| Integrazione automazioni | `TC-BIB47-001`, `002`, `002b`, `003`–`008` | 9 | CA-04, CA-05, CA-06 |
| Rendering tipi notifica | 5 tipi storici, 5 nuovi, 3 fallback e 11 verifiche parametriche complete | 24 | CA-05, CA-06 |

## Casi AGGIUNTI — Fase 5, admin e UI (60)

| Famiglia | ID / descrizione | N. | CA |
| --- | --- | ---: | --- |
| Cancellazione admin e promozione | `TC-BIB49-001`–`004` | 4 | CA-04 |
| Feedback staff | `TC-BIB50-001`–`003` | 3 | CA-06 |
| Middleware coda | `TC-BIB51-001`–`004` | 4 | CA-01 |
| Ingresso da mappa | `TC-BIB52-001`–`002` | 2 | CA-03 |
| Parita' mobile/mappa | `TC-BIB53-001`–`005` | 5 | CA-03, CA-06 |
| Conflitto UI verso coda | `TC-BIB54-001`–`004` | 4 | CA-03, CA-06 |
| Statistiche non inquinate | `TC-BIB55-001`–`002` | 2 | CA-06 |
| Indicatore coda | `TC-BIB56-001`–`004` | 4 | CA-01, CA-06 |
| Autorizzazione admin/coda | `TC-BIB57-001`–`007`, `010`–`015`, `020`–`024`, `030`–`032`, `040`–`043`, `050`–`054` | 30 | CA-01 |
| Ciclo coda-promozione | `TC-BIB58-001`–`002` | 2 | CA-04, CA-05 |

### Nota sui target di sicurezza BIB-57

`TC-BIB57-051` e `TC-BIB57-054` sono oggi espressi come `it.fails`: descrivono
il risultato richiesto, ma confermano che tre percorsi admin restano aperti
(`GET /api/admin/posti/[id]` per STUDENTE e `GET/PATCH /api/admin/richieste`
senza guardia nel route handler). Sono casi aggiunti e devono comparire nel
report BIB-61 come target non soddisfatti, non come test verdi equivalenti a
CA-01. BIB-63 non potra' dichiarare CA-01 completamente verificato finche'
questa differenza non sara' chiusa o formalmente rimossa dal perimetro.

## Matrice criteri → famiglie di test

| Criterio | Famiglie principali |
| --- | --- |
| CA-01 | BIB-26, autenticazione API Fase 3, BIB-51, BIB-56, BIB-57 |
| CA-02 | BIB-24 DB, BIB-27, BIB-31, concorrenza PostgreSQL |
| CA-03 | BIB-23 DB, BIB-27/31 coda, BIB-52/53/54 UI |
| CA-04 | BIB-31, BIB-40/41/44/47, BIB-49, BIB-58 |
| CA-05 | BIB-31, BIB-42/45/46/47, BIB-58 |
| CA-06 | casi invariati, BIB-43/45/47, BIB-50/53/54/55/56 |

## Comandi previsti per i report di esecuzione

```bash
npm run test:db:prepare
npm test
npm run lint
npx tsc --noEmit
npm run build
npm audit --audit-level=high
npm run test:db:down
```

La BIB-61 registrera' il commit esatto, l'ambiente e l'output della suite
post-modifica. La BIB-62 rieseguira' esclusivamente i 20 casi invariati e
confrontera' ogni esito con `docs/test/report-pre-modifica.md`.
