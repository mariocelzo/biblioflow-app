# Registro dei lavori — rifacimento documentazione e qualità dei test

Questo file raccoglie, mentre il lavoro procede, **ogni modifica fatta al
codice o ai test**, **ogni dato misurato** e **ogni errore trovato nella
documentazione precedente**. È la fonte da cui vengono scritti gli 8 documenti
LaTeX in `documentazione/`: chi scrive un documento parte da qui.

Ultimo aggiornamento: 15 ottobre 2026 (documenti completati).

---

## 1. Obiettivo

1. Rifare la documentazione sul modello del pacchetto di riferimento (8 PDF in
   Drive, cartella `documentiista`): Report_Progetto, Change_Requests,
   Impact_Analysis, Master_Test_Plan, Pre_Modification_Test_Document,
   Pre_Modification_Test_Incident_Report, Post_Modification_Test_Execution,
   Report_Finale. Stile LaTeX UniSa: copertina, indice, "CAPITOLO n",
   intestazioni di sezione, tabelle con didascalia.
2. Portare la copertura dei test a un livello da poter dichiarare con
   orgoglio, correggendo i difetti che i nuovi test fanno emergere.
3. Correggere gli errori della documentazione precedente (elenco al §4).

## 2. Decisioni prese

| Decisione | Motivo |
| --- | --- |
| La CR-BF-01 è presentata come **due change request**: CR01 "Prenotazione sicura e atomica" e CR02 "Lista d'attesa con riassegnazione automatica". | Rispecchia il lavoro reale (dati/sicurezza vs nuova funzionalità) e permette Impact Analysis e Precision/Recall separati, come nel modello. |
| CR01 categoria **Correttiva/Preventiva**, CR02 categoria **Perfettiva**. | CR01 chiude difetti di sicurezza e integrità; CR02 aggiunge una funzionalità. |
| Insegnamento: **Ingegneria del Software: Tecniche Avanzate** (ISTA), Laurea Magistrale in Informatica, A.A. 2025-2026. | Il foglio del corso si chiama "ISTA" e il tag baseline cita "corso ISTA". Il vecchio report scriveva "Ingegneria, Gestione ed Evoluzione del Software": errore. |
| Gruppo: Mario Celzo NF22500193, Renato Mancino NF22500242, Alfonso Maria Ferrara NF22500210. | Dal foglio `partecipanti` dell'Excel del corso. |
| Sorgenti LaTeX in `documentazione/`, PDF in `documentazione/pdf/`. Loghi in `documentazione/immagini/loghi/` (`logo-unisa.*`, `logo-sesa.*`); se mancano compare un segnaposto tratteggiato. | Il gruppo aggiornerà loghi e immagini dopo. |
| Diagrammi scritti in Mermaid (`documentazione/diagrammi/*.mmd`) e compilati in PDF vettoriale. | Sorgente testuale, versionabile, rigenerabile. |
| Niente codici Jira, hash e numeri di PR nel corpo dei documenti, salvo un'appendice di tracciabilità. | Il vecchio pacchetto sembrava un diario di sviluppo. |

## 3. Dati verificati (misurati in questa sessione)

### 3.1 Riferimenti Git

- Baseline: tag `baseline-pre-cr-bf-01` → commit `e0742bf` (21 gennaio 2026).
  Il valore `911c4d5…` citato nel vecchio report pre-modifica è l'**oggetto
  tag**, non il commit: va scritto `e0742bf`.
- Infrastruttura di test aggiunta senza toccare i flussi: `7469969` (28/08/2026).
- Implementazione della CR: fase 2 `b0e6138` (02/09), fase 3 `068e1be`,
  fase 4 `01237b7`, fase 5 `cb4b95c`, `ae26680`, `1c31817`, `9592aad`,
  `adc5e30` (04/09), chiusura varchi CA-01 `daa090a`.
- Manutenzione correttiva successiva: da `76ecb1e` a `0f9ad3f` (PR #47–#83),
  poi candidata di consegna `1faf0dd` (PR #84, 14/10/2026) che include anche
  il contenuto della PR #85 (catalogo libri).
- Commit per autore dopo il baseline: Mario 45, Renato 17, Alfonso 3.

### 3.2 Test sul codice finale (`1faf0dd`), PostgreSQL 16 locale

- `npm test`: **103 file, 763/763 test superati** (unit 628 in 80 file,
  integration 107 in 17 file, post-modifica 28 in 6 file).
- Il vecchio pacchetto dichiarava 758 (prima della PR #85) e in un punto
  763: il dato corretto per la versione finale è **763**.

### 3.3 Copertura (Vitest v8) prima degli interventi di questa sessione

| Area | Statement | Branch |
| --- | ---: | ---: |
| Totale `src/**/*.{ts,tsx}` | 36,5% | 28,1% |
| `src/lib` (28 file) | 89,9% | 83,6% |
| `src/app/api` (37 file) | 72,3% | 66,6% |
| `src/middleware.ts` | 100% | 100% |
| UI `.tsx` (84 file) | 2,6% | 1,5% |
| Moduli core della CR (15 file) | 88,8% | 82,1% |

Route a copertura zero: `auth/registrazione`, `auth/verifica/reinvia`,
`auth/verify`, `profilo`, `admin/posti/[id]/dettagli`, `libri/[id]`,
`admin/utenti/[id]/storico`; libreria `admin-tempo` a zero, `env` al 41%.
Route sotto il 70%: `admin/anomalie` 59%, `sale` 59%, `libri` 65%,
`admin/posti/[id]` 66%. Hook `use-ingresso-coda` al 25%.

### 3.4 Regressione: suite di caratterizzazione sul codice finale

`npm run test:pre` sul codice finale: 30 casi eseguibili, 16 superati,
14 falliti, più il file SSE che non si carica.

| Caso | Stato a fine CR (`adc5e30`) | Stato sul codice finale | Motivo |
| --- | --- | --- | --- |
| TC-PRE-011…015, 017…019, 022 | Invariato, PASS | Invariato, PASS | — |
| PRE-AUT-004, PRE-NOT-001, PRE-NOT-002 | Invariato, PASS | Invariato, PASS | — |
| TC-PRE-016 | Invariato | **Modificato** (PASS con oracolo nuovo) | Il middleware ora verifica davvero il token: un cookie inventato non apre più `/prenota`. |
| TC-PRE-020 | Invariato | **Modificato** | La restituzione staff ora incrementa anche `copieDisponibili` in transazione: prima ogni restituzione al banco "perdeva" una copia. Il mock storico non prevede `$transaction`. Copertura nuova: `integration/admin-prestiti-restituzione-db.test.ts`. |
| PRE-AUT-001, PRE-AUT-002 | Invariato | **Modificato** | Le colonne `@db.Time` ora contengono l'orario di Roma: la fixture storica scrive l'orario UTC, quindi il promemoria non scatta. Copertura nuova: `unit/automation-service.test.ts`. |
| PRE-SSE-001…004 | Invariato, PASS | **Eliminato** | La catena SSE non è mai stata collegata alla UI e non era sicura su più istanze serverless: rimossa, sostituita da rilettura autenticata e polling delle notifiche. |
| TC-PRE-001…010, 021, 023, 024, PRE-AUT-003 | Modificato | Modificato | Già classificati come modificati dalla CR. |

Conclusione onesta da riportare: sulla versione finale restano **12 casi
invariati, tutti PASS**; gli 8 restanti sono stati modificati o eliminati da
interventi documentati, ciascuno con un test sostitutivo verde.

### 3.5 Impact analysis (dal diff `e0742bf..daa090a`, cartelle `src` e `prisma`)

36 file toccati dall'implementazione della CR. Escluse le modifiche non
funzionali: `libri/[id]/page.tsx` (escape HTML per il lint),
`live-announcer.tsx`, migrazioni RLS e smoke-test della pipeline.

SIS e CIS **ricavati dai documenti AS-IS del 28/08/2026, scritti prima di
toccare il codice** (`docs/diagrammi/prenotazione-componenti-as-is.md`,
`docs/analisi/matrice-ruoli-operazioni-as-is.md`).

**CR01 — Prenotazione sicura e atomica**

- SIS (7): `prisma/schema.prisma`, `src/lib/auth.ts`,
  `api/prenotazioni/route.ts`, `api/prenotazioni/[id]/route.ts`,
  `api/prenotazioni/[id]/check-in/route.ts`,
  `api/prenotazioni/[id]/estendi/route.ts`, `app/prenota/page.tsx`.
- CIS = SIS + 6: `src/middleware.ts`, `api/admin/posti/[id]/route.ts`,
  `api/admin/richieste/route.ts`, `api/admin/scanner/validate/route.ts`,
  `app/prenotazioni/page.tsx`, `app/prenotazioni/[id]/estendi/page.tsx` → 13.
- AIS (11): schema, migrazione anti-sovrapposizione (nuova), `auth.ts`,
  `prenotazioni-errors.ts` (nuovo), `prenotazioni-service.ts` (nuovo),
  4 route prenotazioni, `admin/posti/[id]`, `admin/richieste`.
- CIS ∩ AIS = 8 → **Precision 8/13 = 61,5%**, **Recall 8/11 = 72,7%**.
- FPIS (5): `middleware.ts` (corretto dopo, nella manutenzione correttiva:
  ora verifica il token), `scanner/validate` (la coda è un'entità separata,
  nessun nuovo stato di Prenotazione), `prenotazioni/page.tsx`,
  `estendi/page.tsx` (contratti invariati), `prenota/page.tsx` (la UI invia
  ancora `userId`, ma il server lo ignora: la correzione è lato server).
- DIS (3): migrazione anti-sovrapposizione, `prenotazioni-errors.ts`,
  `prenotazioni-service.ts`.

**CR02 — Lista d'attesa e riassegnazione automatica**

- SIS (4): `prisma/schema.prisma`, `src/lib/automation-service.ts`,
  `api/admin/prenotazioni/route.ts`, `api/prenotazioni/[id]/route.ts`.
- CIS = SIS + 14: `api/admin/anomalie`, `api/admin/scanner/validate`,
  `api/admin/statistiche`, `app/admin/statistiche/page.tsx`,
  `app/admin/page.tsx`, `api/cron/automations`, `lib/realtime-events.ts`,
  `lib/sse-emitter.ts`, `api/sse/posti`, `hooks/use-sse.ts`,
  `api/disponibilita-giorni`, `app/prenota/page.tsx`,
  `components/mappa-biblioteca.tsx`, `components/mobile-posti-grid.tsx` → 18.
- AIS (23): schema, 2 migrazioni nuove (lista_attesa, estensione enum),
  `prenotazioni-service.ts`, `api/prenotazioni/coda` (nuova),
  `api/admin/prenotazioni`, `automation-service`, `cron/automations`,
  `sse/posti`, `realtime-events`, `use-sse`, `notifiche/page.tsx`,
  `notifiche/tipo-config.tsx` (nuovo), `middleware.ts`, `prenota/page.tsx`,
  `mappa-biblioteca`, `mobile-posti-grid`, `use-ingresso-coda` (nuovo),
  `eventi-coda` (nuovo), `admin/prenotazioni-actions.tsx`,
  `api/admin/statistiche`, `admin/statistiche/page.tsx`,
  `statistiche-charts.tsx`.
- CIS ∩ AIS = 12 → **Precision 12/18 = 66,7%**, **Recall 12/23 = 52,2%**.
- FPIS (6): `admin/anomalie`, `scanner/validate`, `admin/page.tsx`,
  `sse-emitter`, `disponibilita-giorni`, e `api/prenotazioni/[id]/route.ts`.
  **Attenzione:** quest'ultimo non è un vero falso positivo ma
  un'**omissione**. La cancellazione da parte dello studente non promuoveva
  la coda a fine CR; il difetto è emerso dalla verifica dal vivo ed è stato
  corretto nella manutenzione correttiva (PR #79). Va raccontato così.
- DIS (11): 2 migrazioni, `prenotazioni-service`, `coda/route.ts`,
  `notifiche/page.tsx`, `tipo-config.tsx`, `middleware.ts`,
  `use-ingresso-coda`, `eventi-coda`, `prenotazioni-actions.tsx`,
  `statistiche-charts.tsx`.

## 4. Errori trovati nella documentazione precedente

1. Nome dell'insegnamento errato (vedi §2).
2. Commit del baseline incoerente (`911c4d5` è l'oggetto tag; il commit è `e0742bf`).
3. Totale dei test incoerente (758 vs 763); quello finale è 763.
4. Casi PRE-SSE dichiarati "invariati 20/20" anche dopo la rimozione della
   catena SSE: sul codice finale sono **eliminati**.
5. TC-PRE-016, TC-PRE-020, PRE-AUT-001 e PRE-AUT-002 sono stati modificati
   dalla manutenzione correttiva: la regressione va riportata in due momenti
   (fine CR e versione finale).
6. "La PR #85 è separata e va mergiata dopo la #84": falso, il suo codice è già
   su `main` dentro la #84.
7. TC-PRE-023: il vecchio testo diceva "il client non invia più un `userId`
   autorevole". Più esatto: **il client lo invia ancora, il server lo ignora**
   (verificato da `integration/auth-prenotazioni.test.ts`).
8. TC-PRE-006 diceva che la cancellazione dello studente "aggiunge la
   promozione idempotente del primo in coda". A fine CR la promozione era
   verificata solo a livello di servizio: la route di cancellazione dello
   studente non la invocava. È stata collegata nella manutenzione correttiva
   (PR #79), con i test `TC-CODA-DEL-*` e `TC-CODA-PATCH-*`.
9. La specifica pre-modifica era fatta da tre documenti incollati, con stili e
   ordine diversi (prima SSE e automazioni, poi le prenotazioni).
10. Il report delle parti modificate dava CA-01 "PARZIALE", la verifica finale
    PASS: il nuovo documento racconta la sequenza (prima verifica non
    conforme → correzione → riverifica).

## 5. Modifiche al codice e ai test fatte in questa sessione

_(si aggiorna a ogni intervento: file, motivo, test che lo verifica)_

| # | File | Tipo | Cosa e perché | Test |
| --- | --- | --- | --- | --- |
| M-01 | `prisma/schema.prisma`, nuova migrazione `20261015090000_tipi_evento_registrazione_estensione` | Correttiva (D-01) | Due valori aggiunti all'enum `TipoEvento`: `UTENTE_REGISTRATO`, `PRENOTAZIONE_ESTESA`. Migrazione additiva, nessun dato toccato; `prisma db push` dopo le 9 migrazioni non rileva differenze. | `TC-REG-001` |
| M-02 | `api/auth/registrazione/route.ts` | Correttiva (D-01) | Il log della registrazione usa `UTENTE_REGISTRATO`, non più `PRENOTAZIONE_CREATA`. | `TC-REG-001` |
| M-03 | `api/prenotazioni/[id]/estendi/route.ts` | Correttiva (D-01) | Il log dell'estensione usa `PRENOTAZIONE_ESTESA`. | `TC-EST-002` (T-06) |
| M-04 | `app/admin/page.tsx` | Correttiva (D-01, D-03) | Etichette "si è registrato" e "ha esteso una prenotazione" nell'attività recente; conteggio no-show con il filtro condiviso. | — (pagina server) |
| M-05 | `src/lib/eventi-no-show.ts` (nuovo) | Correttiva (D-03) | `TIPI_EVENTO_NO_SHOW = [NO_SHOW, NO_SHOW_AUTO]`, `filtroTipoNoShow()`, `isEventoNoShow()`: un unico punto che definisce cos'è un no-show. | `TC-ADM-USR-001/002`, `TC-ANOM-NS-001`, `TC-ANOM-SU-002` |
| M-06 | `app/admin/anomalie/page.tsx`, `api/admin/utenti/[id]/route.ts`, `api/admin/utenti/[id]/profilo/route.ts`, `api/admin/anomalie/route.ts` | Correttiva (D-03) | I no-show automatici ora compaiono in pagina Anomalie, nel contatore dell'utente e nelle azioni di risoluzione. | come M-05 |
| M-07 | `components/admin/utenti-actions.tsx` | Correttiva (D-03) | Lo storico utente mostra l'icona no-show anche per i rilasci automatici. | — (componente) |
| M-08 | `api/admin/anomalie/route.ts` (azione `RISOLVI_TUTTE_NOSHOW`) | Correttiva (D-04) | Niente più `distinct: ["userId"]`: un avviso per utente ma **tutti** i suoi eventi aperti vengono chiusi. La risposta riporta anche `eventiRisolti`. | `TC-ANOM-NS-002/003` |
| M-09 | `api/admin/posti/[id]/dettagli/route.ts` | Correttiva (D-02) | "Oggi" calcolato con `dataCorrenteBiblioteca()` nel fuso di Roma. Verificato che il test **fallisce sul codice vecchio** (atteso 2026-10-16, ricevuto 2026-10-15 con il server in UTC). | `TC-ADM-DET-012` |
| M-10 | `tests/integration/statistiche-coda.test.ts` | Allineamento test | Lo "specchio" delle query di dashboard e anomalie usato dal test di non-inquinamento delle metriche riprende il nuovo filtro no-show, senza `distinct`. Le asserzioni restano le stesse. | il file stesso |
| T-01 | `tests/integration/auth-registrazione-verifica-db.test.ts` (nuovo) | Test | 14 casi su PostgreSQL reale: registrazione (dati, duplicati, password debole, email non partita, produzione senza token), verifica (consumo, idempotenza, token altrui/RESET/scaduto), reinvio (link vecchio bruciato, risposta uniforme anti-enumerazione, 503 se la posta è guasta). | 14/14 |
| T-02 | `tests/unit/admin-posti-utenti-dettaglio.test.ts` (nuovo) | Test | 29 casi: 401/403 senza accesso al DB su 6 route staff, PATCH stato posto (validazione, 404, posto occupato, log, rate limit, 500 senza dettagli), dettaglio posto (tassi, zero prenotazioni, D-02), contatori no-show (D-03), storico utente. | 29/29 |
| T-03 | `tests/unit/admin-anomalie-no-show.test.ts` (nuovo) | Test | 12 casi: accesso, rate limit, azione sconosciuta, D-03, D-04, avviso al singolo utente, annullamento delegato al cron, broadcast ai soli utenti attivi, 500 generico. | 12/12 |
| M-11 | migrazione `20261015090000_…` (ora con 4 valori) e `schema.prisma` | Correttiva (D-05) | Aggiunti anche `PRESTITO_SOLLECITATO` e `PRESTITO_RINNOVATO`. | `TC-ADM-PREST-021/033/041` |
| M-12 | nuova migrazione `20261015090100_riclassifica_log_storici` | Correttiva (D-01, D-05) | Riclassifica i `LogEvento` storici scritti col tipo sbagliato (registrazioni, estensioni, solleciti, rinnovi), riconoscendoli dagli stessi criteri con cui il codice li scriveva. Separata dalla precedente perché PostgreSQL non permette di usare un valore di enum nella transazione che lo aggiunge. | `TC-MIG-001/002/003` |
| M-13 | `api/admin/prestiti/route.ts` | Correttiva (D-05) | Sollecito → `PRESTITO_SOLLECITATO`, rinnovo → `PRESTITO_RINNOVATO`. Il sollecito singolo ora rifiuta prestiti non in corso (400), non ancora scaduti (400) o già sollecitati nelle ultime 24 ore (409); la finestra anti-duplicato è una funzione condivisa con il sollecito multiplo e riconosce anche i log storici. | `TC-ADM-PREST-0xx` |
| M-14 | `app/admin/page.tsx` | Correttiva (D-05) | Etichette per sollecito e rinnovo nell'attività recente. | — |
| M-15 | `api/prestiti/route.ts` | Correttiva (D-06, D-07) | Durata del prestito decisa dal server: 30 giorni per lo studente, 1–60 giorni (intero) se indicata dallo staff, altrimenti 422. Filtro `stato` fuori enum → 422 invece di 500. | `TC-PREST-DUR-*`, `TC-PREST-GET-001` |
| T-04 | `tests/unit/catalogo-sale-profilo-route.test.ts` (nuovo) | Test | 14 casi su catalogo (ricerca, filtri, campi arricchiti, categorie), dettaglio libro (statistiche prestiti, 404, 401), sale (filtri, statistiche, occupazione con zero posti) e profilo (campi esposti, whitelist anti mass-assignment, rate limit, errori senza dettagli). | 14/14 |
| T-05 | `tests/unit/librerie-supporto.test.ts` (nuovo) | Test | 15 casi: tempo relativo, `cn`, bcrypt, regole password, validazione delle variabili d'ambiente (avvio negato con `process.exit(1)`). | 15/15 |
| T-06 | `tests/unit/prenotazioni-estendi-orario-passato.test.ts` | Test (esteso) | `TC-EST-002` verifica anche il tipo `PRENOTAZIONE_ESTESA` (D-01). | 3/3 |
| T-07 | `tests/unit/admin-prestiti-azioni.test.ts` (nuovo) | Test | 15 casi su restituzione, rinnovo, solleciti singolo e multiplo, accesso e corpo non valido. | 15/15 |
| T-08 | `tests/integration/riclassifica-log-storici-db.test.ts` (nuovo) | Test | Esegue lo SQL della migrazione M-12 su PostgreSQL reale: sposta solo le righe giuste, lascia intatte le altre, è idempotente. | 3/3 |
| T-09 | `tests/unit/admin-statistiche-classifiche.test.ts` (nuovo) | Test | Classifiche "utenti più attivi" e "libri più prestati" con ripiego "Sconosciuto", tipo non valido, accesso, 500. | 5/5 |
| T-10 | `tests/unit/automation-run-isolamento.test.ts` (nuovo) | Test | Con il database guasto i cinque passi del cron falliscono uno per uno, finiscono in `errors` e non interrompono la catena. | 2/2 |
| T-11 | `tests/unit/prestiti-richiesta-e-filtri.test.ts` (nuovo) | Test | 19 casi: durata (D-06), controlli preliminari, ultima copia contesa (409), 500 generico, filtri dell'elenco (D-07), calcolo ritardo/scadenza. | 19/19 |
| M-16 | `api/notifiche/route.ts` | Correttiva (D-08) | `tipo` fuori dall'enum `TipoNotifica` → 422 invece di 500. | `TC-NOT-POST-002` |
| M-17 | `api/prenotazioni/route.ts` (GET) | Correttiva (D-09) | Filtri `data`, `dataInizio`, `dataFine` non validi → 422 invece di 500. | `TC-PREN-GET-003` |
| M-18 | `api/admin/prenotazioni/route.ts` (MODIFICA) | Correttiva (D-10) | Se il vincolo di esclusione del DB rifiuta la modifica (sovrapposizione con un'altra prenotazione attiva) la risposta è 409 con un messaggio per lo staff, non "Errore interno del server". **Verificato che i due test falliscono sul codice precedente (500).** Il controllo sull'intervallo invertito esisteva già (422). | `TC-ADM-MOD-001/002` |
| T-12 | `tests/unit/notifiche-route-rami.test.ts` (nuovo) | Test | 14 casi: creazione da staff (ruolo, campi, D-08, link esterni/`javascript:` rifiutati, destinatario), segna lette/non lette solo sulle proprie, eliminazione (propria, altrui = inesistente), filtro `letta`. | 14/14 |
| T-13 | `tests/unit/prenotazioni-elenco-e-creazione.test.ts` (nuovo) | Test | 11 casi: filtri dell'elenco sempre ristretti alla sessione, D-09, creazione che ignora lo `userId` del client (CA-01), conflitto → 409 con proposta di coda, 500 generico. | 11/11 |
| T-14 | `tests/unit/errori-generici-route.test.ts` (nuovo) | Test trasversale | **49 handler** chiamati con il database guasto: tutti rispondono 500 con JSON generico, senza nomi di tabelle, driver o stack (regola B-1 dell'audit). Esclusi con motivo: NextAuth, cron (riporta gli errori per passo), scanner (rifiuta il QR prima del DB), recupero password (risposta uniforme anti-enumerazione). | 49/49 |
| T-15 | `tests/integration/coda-ciclo-di-vita-db.test.ts` (nuovo) | Test | 9 casi su PostgreSQL reale per il ciclo di vita della coda (CR02): posizioni FIFO, duplicato, input non validi, **annullamento** (solo il proprietario, richiesta altrui = inesistente, non ripetibile, log `CODA_ANNULLATA`, chi è dietro avanza, rientro in fondo), promozione con slot occupato o coda vuota. | 9/9 |
| T-16 | `tests/integration/admin-modifica-prenotazione-db.test.ts` (nuovo) | Test | 5 casi su PostgreSQL reale per la modifica staff: sovrapposizione → 409 senza modifiche, spostamento su posto occupato → 409, intervallo invertito → 422, modifica valida con log collegato e notifica, input malformati. | 5/5 |
| T-17 | `tests/unit/auth-google-primo-accesso.test.ts` (nuovo) | Test | 7 casi: primo accesso Google (studente verificato senza password, nome dal profilo o dal nome visualizzato, segnaposto), utente esistente, guasto DB → rifiuto, provider sconosciuto, account solo-Google che tenta la password, `isStaff`/`hasRole`. | 7/7 |
| M-19 | `package.json` (devDependencies) | Infrastruttura di test | `@testing-library/react` 16.3, `@testing-library/dom` 10.4, `@testing-library/user-event` 14.6, `jsdom` 26.1 per i test dei componenti React. | — |
| M-20 | `vitest.config.mts` | Infrastruttura di test | Inclusi i test `.tsx` (ambiente jsdom dichiarato nel file), esclusa la cartella E2E. La copertura ora misura **tutto `src/`, route handler compresi** (la configurazione precedente escludeva `src/app/**/route.ts`, cioè proprio le API) e ha **soglie minime**: `src/lib` e `src/app/api` ≥ 90% statement e ≥ 80% branch, middleware 100%. | `npm run test:coverage` |
| M-21 | `components/mobile-posti-grid.tsx`, `app/prestiti/page.tsx`, `components/ui/combobox.tsx` | Correttiva (D-11) | Singolare/plurale: "1 disponibile", "1 risultato disponibile" (prima "1 disponibili"). Emerso dal test della mappa. | `TC-UI-MAPPA-010` |
| M-22 | `components/admin/prenotazioni-actions.tsx`, `components/admin/prestiti-actions.tsx`, `app/admin/richieste/page.tsx` | Correttiva (D-12) | Nome accessibile (`aria-label`) sui pulsanti fatti solo di icona; il menu delle prenotazioni propone annulla/modifica solo per `CONFERMATA` e `CHECK_IN`, gli stessi stati che il server accetta. | `TC-UI-ADMPREN-001/003` |
| T-18 | `tests/unit/componenti/mobile-posti-grid.test.tsx` (nuovo) | Test UI | 10 casi in jsdom: ordine naturale, etichette accessibili e `aria-pressed`, manutenzione non cliccabile, selezione, apertura coda e lettura della posizione (anche con orari ISO), ingresso in coda (contratto, posizione, toast), rifiuto del server, assenza di rete, chiusura del pannello. | 10/10 |
| T-19 | `tests/unit/componenti/mappa-biblioteca.test.tsx` (nuovo) | Test UI | 5 casi: legenda e posti interattivi, **uso da tastiera** (Invio, spazio, altri tasti ignorati), ingresso in coda con lo stesso contratto della vista mobile, ripiego sulla griglia sotto 768 px. | 5/5 |
| T-20 | `tests/unit/componenti/prenotazioni-actions.test.tsx` (nuovo) | Test UI | 12 casi: nome accessibile del menu, azioni proposte per stato (D-12), annullamento con esito della coda (promosso / coda vuota / rifiuto), check-in manuale, modifica (valori iniziali, valori inviati, conflitto 409 mostrato all'operatore). | 12/12 |
| M-23 | `src/components/lista-attesa-utente.tsx` (nuovo), `app/prenotazioni/page.tsx`, `app/prenota/page.tsx` | Correttiva/completamento CR02 (D-13) | Nuova scheda **"Lista d'attesa (n)"** in "Le mie prenotazioni": elenco delle richieste con posto, sala, giorno, fascia, posizione e pulsante **"Esci dalla lista"** (`DELETE /api/prenotazioni/coda`); dopo l'uscita le posizioni vengono rilette. `?scheda=coda` apre direttamente la scheda; il dialog di conflitto di /prenota ora porta lì. | `TC-UI-CODA-001…005`, `E2E-10`, `E2E-12` |
| M-24 | `app/prenotazioni/page.tsx` | Correttiva (D-14) | Lo storico include le prenotazioni `SCADUTA` (con badge "Scaduta"); rimosso lo stato inesistente `IN_ATTESA` dal tipo e dai filtri. | `E2E-11` (indiretto), revisione |
| M-25 | `app/admin/prenotazioni/page.tsx` | Correttiva (D-15) | `?data=` scritta a mano e non valida veniva passata a Prisma come `Invalid Date` e la pagina falliva: ora il filtro non valido viene ignorato, come già avveniva per lo stato. | revisione + E2E-08 (filtro valido) |
| M-26 | `package.json` (`test:e2e`, `test:coverage`), `playwright.config.ts`, `tests/e2e/global-setup.ts`, `tests/e2e/supporto.ts`, `.gitignore` | Infrastruttura di test | Suite E2E Playwright 1.56.1 su build di produzione: global setup che applica migrazioni e seed a un database **di test** (rifiuta altri nomi), un solo worker, scenari in serie, trace e screenshot sui fallimenti. `test:coverage` esclude la suite di caratterizzazione come `npm test`. | — |
| M-27 | `.github/workflows/ci.yml` | Infrastruttura CI | Nuovo job **`e2e`**: PostgreSQL 16 di servizio, `playwright install --with-deps chromium`, migrazioni, build, `npm run test:e2e`, report caricato come artefatto se fallisce. I job diventano sei. | da verificare alla prima PR |
| T-21 | `tests/unit/componenti/lista-attesa-utente.test.tsx` (nuovo) | Test UI | 5 casi: elenco con posizione e conteggio, uscita (API giusta, posizioni rilette, avviso), rifiuto del server, stato vuoto, errore con "Riprova". | 5/5 |
| T-22 | `tests/e2e/01-accesso.spec.ts` (nuovo) | E2E | E2E-01 pagina riservata → login → ritorno alla pagina richiesta; E2E-02 password errata; E2E-03 studente respinto dall'area admin e API admin 403; E2E-04 cookie di sessione inventato respinto (pagine e API). | 4/4 |
| T-23 | `tests/e2e/02-prenotazione-coda-promozione.spec.ts` (nuovo) | E2E | E2E-05 prenotazione dalla procedura guidata; E2E-06 posto occupato per un altro studente con coda proposta; E2E-07 ingresso in coda, posizione 1 riletta dal server; E2E-08 annullamento dallo staff con nome del promosso; E2E-09 notifica "Posto assegnato dalla lista d'attesa" e prenotazione del promosso. | 5/5 |
| T-24 | `tests/e2e/03-conflitto-cancellazione-uscita.spec.ts` (nuovo) | E2E | E2E-10 conflitto all'ultimo istante (un secondo browser prende il posto) → dialog "Posto non più disponibile" → lista d'attesa; E2E-11 cancellazione del titolare → promozione; E2E-12 ingresso e uscita dalla coda dalla nuova scheda. | 3/3 |

| M-28 | `documentazione/*.tex`, `documentazione/stile/biblioflow-ista.sty`, `documentazione/latexmkrc` | Documentazione | Gli 8 documenti riscritti in LaTeX con la struttura del pacchetto di riferimento (§6); copertina con il logo UniSa fornito dal gruppo (`immagini/loghi/logo-unisa.png`); il logo SeSa compare solo se si aggiunge il file. `latexmk` compila tutto in `pdf/` senza errori né righe fuori margine. | — |
| M-29 | `documentazione/diagrammi/` | Documentazione | Diagrammi Mermaid del sistema di partenza (pacchetti, modello dati, sequenze) e call graph AS-IS dell'impact analysis. `grafi_ia.py` genera da un solo elenco di archi sia i call graph sia le matrici di raggiungibilità (`tabelle/`), calcolate con BFS. Rimossi i diagrammi che il pacchetto di riferimento non prevede (TO-BE, stati, esiti). | — |
| M-30 | `deliverables/BiblioFlow-consegna-2026-10-15/`, `documentazione/aggiorna_consegna.py` | Consegna | Nuovo pacchetto con gli 8 PDF, l'Excel del corso, `MANIFEST.md` (richieste delle linee guida e SHA-256) rigenerabile con lo script. Il pacchetto del 13/10, con gli errori del §4, è stato rimosso (resta nella storia Git). | — |
| M-31 | `README.md` | Documentazione | Rimandi a `documentazione/` e `deliverables/`, sezione E2E, pipeline a sei job; `docs/` indicata come documentazione di lavoro storica. | — |

### Difetti individuati

| ID | Dove | Difetto | Origine | Stato |
| --- | --- | --- | --- | --- |
| D-01 | registrazione, estensione | Il `LogEvento` di registrazione ed estensione era di tipo `PRENOTAZIONE_CREATA`: dashboard e storico mostravano "ha creato una prenotazione". | Registrazione: baseline. Estensione: introdotto dalla riscrittura della CR. | Corretto (M-01…M-04) |
| D-02 | dettaglio posto admin | "Oggi" calcolato nel fuso del server: tra 00:00 e 02:00 di Roma la prenotazione in corso spariva. | Baseline | Corretto (M-09) |
| D-03 | anomalie, dashboard, contatori utente | Solo `NO_SHOW` contato; i rilasci automatici `NO_SHOW_AUTO`, cioè il caso più frequente, erano invisibili allo staff. | Baseline: il cron scriveva già `NO_SHOW_AUTO`. Ripple effect non colto nemmeno dalla CR (le query erano state giudicate "immuni" in `eventi-coda.ts`). | Corretto (M-05…M-07) |
| D-04 | anomalie, "Risolvi tutte" | `distinct: ["userId"]` chiudeva un solo evento per utente. | Baseline | Corretto (M-08) |
| D-05 | prestiti admin | Sollecito registrato come `PRESTITO_RESTITUITO`, rinnovo come `PRESTITO_CREATO`: in dashboard "ha restituito un libro" / "ha preso un libro in prestito". Il sollecito singolo inoltre non verificava lato server che il prestito fosse in corso, scaduto e non già sollecitato. | Baseline (tipi); idempotenza solo sul multiplo dalla manutenzione correttiva | Corretto (M-11…M-14) |
| D-06 | richiesta di prestito | `durataDays` dal client senza controlli: prestiti di anni, durate negative o non numeriche (500). | Baseline | Corretto (M-15) |
| D-07 | elenco prestiti | `?stato=` fuori enum → 500 (Prisma). | Baseline; non incluso nel giro di correzioni "enum → 422" della manutenzione | Corretto (M-15) |
| D-08 | creazione notifica (staff) | `tipo` fuori enum → 500. | Baseline | Corretto (M-16) |
| D-09 | elenco prenotazioni | Filtri data non validi → 500. | Baseline | Corretto (M-17) |
| D-10 | modifica prenotazione (staff) | Sovrapposizione rifiutata dal vincolo del DB → "Errore interno del server". | Ripple effect della CR01: il vincolo di esclusione è nuovo, il percorso di modifica dello staff non ne gestiva l'esito | Corretto (M-18) |
| D-11 | griglia posti, prestiti, combobox | "1 disponibili", "1 risultati disponibili". | Baseline | Corretto (M-21) |
| D-12 | area admin | Pulsanti solo-icona senza nome accessibile; menu che propone azioni su prenotazioni già concluse, poi rifiutate dal server. | Baseline (icone); disallineamento UI/server dalla manutenzione correttiva (PR #76) | Corretto (M-22) |
| D-13 | lista d'attesa (studente) | Nessuna schermata mostrava le proprie richieste in coda né permetteva di uscirne, benché l'API lo consentisse e il README lo dichiarasse. Dopo l'ingresso dal dialog di conflitto si finiva su una pagina che non mostrava la richiesta. | **CR02**: realizzazione incompleta lato UI (l'impact analysis prevedeva `prenotazioni/page.tsx` solo come consumatore indiretto, non come punto da estendere) | Corretto (M-23) |
| D-14 | storico prenotazioni | Le prenotazioni `SCADUTA` (promozioni non confermate) non comparivano né tra le attive né nello storico. | CR02 (lo stato è prodotto dalla scadenza delle promozioni) | Corretto (M-24) |
| D-15 | pagina admin prenotazioni | `?data=` non valida → errore del server. | Baseline | Corretto (M-25) |

### 5.1 Copertura dopo gli interventi (Vitest v8, `npm run test:coverage`, TZ=UTC)

Suite: **123 file, 1013/1013 test** (prima: 103 file, 763 test). Le soglie
configurate sono rispettate.

| Area | Statement | Branch | Prima (statement / branch) |
| --- | ---: | ---: | --- |
| `src/app/api` (37 route) | **95,1%** | **89,0%** | 72,3% / 66,6% |
| `src/lib` (29 moduli) | **95,4%** | **90,5%** | 89,9% / 83,6% |
| `src/middleware.ts` | 100% | 100% | 100% / 100% |
| `src/hooks/use-ingresso-coda.ts` | 94,1% | 84,4% | 25,5% / 25,0% |
| Totale codice server (lib + api + middleware + hooks) | **95,2%** | **89,4%** | 88,0% / 81,9% (misurato a metà lavoro) |
| Moduli toccati dalla CR (18 file, UI compresa) | 87,4% | 80,3% | — |
| `src/components` | 21,4% | 17,9% | ~3% |
| `src/app` (pagine) | 1,9% | 1,7% | — |

Le pagine Next.js non hanno test unitari: sono esercitate dalla suite E2E
(12 scenari su build di produzione), che non contribuisce alla misura v8. È
un limite da dichiarare nel documento di test, insieme al fatto che il totale
grezzo (48,5%) è basso per questo motivo.

### 5.2 Suite E2E (Playwright, build di produzione, PostgreSQL 16)

**12/12 scenari superati**, stabili su tre esecuzioni consecutive (~37 s
ciascuna). Il problema rimasto aperto nella vecchia documentazione ("dopo il
login con `callbackUrl` la pagina è rimasta su Accedi una volta") **non si
ripresenta**: E2E-01 verifica proprio il ritorno alla pagina richiesta.

## 6. Struttura dei documenti (ricalcata sui PDF di riferimento)

Indicazione del gruppo: **nei documenti va solo ciò che c'è nei documenti di
riferimento**, adattato a BiblioFlow. Niente capitoli, sezioni o figure in più
(niente diagrammi TO-BE, di stato o di esito dell'impact analysis). Copertina:
università, dipartimento, corso, TITOLO, "Ingegneria del Software: Tecniche
Avanzate - <documento>", nomi e matricole, repository, anno accademico, logo SeSa.

| Documento | Indici iniziali | Capitoli e sezioni |
| --- | --- | --- |
| Report_Progetto | Indice, Figure | 1 Descrizione del Sistema (1.1 Contesto Applicativo, 1.2 La piattaforma, 1.2.1 Analisi del Funzionamento) · 2 Struttura del Sistema (2.1 Package Principali, un §2.1.x per package con "Moduli principali" e figura "Analisi modulo …") · 3 Flusso di Funzionamento (3.1 Tipologie di Utilizzo, 3.2 Flusso di Utilizzo con un §3.2.x per modalità, passi numerati e sequence diagram) |
| Change_Requests | Indice, Tabelle | 1 Introduzione (1.1 Introduzione: sistema, componenti, elenco CR) · 2 Change Requests (2.1 / 2.2 "Change Request n.x": tabella ID, Titolo, Data di Identificazione, Richiesta da, Categoria, Priorità, Descrizione → Situazione Iniziale, Situazione desiderata, Impatti o Rischi, Fuori ambito) |
| Impact_Analysis | Indice, Figure, Tabelle | 1 Introduzione (1.1 Obiettivi, 1.2 CR analizzate con tabella, 1.3 Terminologia) · 2/3 Change Request 0x (x.1 Descrizione con tabella, x.2 Analisi Statica e Architetturale: call graph as-is + matrice di raggiungibilità, x.3 Impact Analysis: SIS con tabella e insieme, CIS, x.4 Implementazione: AIS, FPIS con tabella + Analisi, DIS con tabella + Analisi, Metrics) |
| Master_Test_Plan | Indice | 1 Introduzione · 2 Strategie di Testing (unità, integrazione, sistema, E2E) · 3 Criteri di Accettazione (3.1 Criteri di Copertura: incluse, escluse; 3.2 Criteri e Valori di Accettazione) |
| Pre_Modification_Test_Document | Indice, Tabelle | 1 Introduzione (Scopo, Ambiente di Testing, Tipologia di Testing) · 2 Identificazione delle Categorie e dei Parametri (gruppi con tabella Categoria/Codice/Scelte) · 3 Test di Sistema (tabella TC ID / Test Frame / Oracolo) |
| Pre_Modification_Test_Incident_Report (titolo "Test Incident Report") | Indice | 1 Introduzione (1.1 Obiettivi) · 2 Incident Report (2.n Test Incident n.N: Componente, Severità, Data; Descrizione del Problema con log; Risoluzione Tecnica con codice errato/corretto; Esito) |
| Post_Modification_Test_Execution (titolo "Post-Modification Test Document") | Indice, Tabelle | 1 Regression Testing (per CR) · 2 Copertura (Metodologia, Risultati, Analisi) · 3 Unit Testing (per CR) · 4 Integration Testing (per CR) · 5 System Testing (Aggiornamento Categorie, Nuovi TC) · 6 WebApp Testing E2E (Strategia, Casi E2E) |
| Report_Finale | Indice | 1 Introduzione (punti per CR) · 2 Sviluppo del Progetto (2.1 Componenti Core, 2.2 Change Requests con tabella ID/Titolo/Categoria/Esito, 2.3 Strategia di Testing: incidenti pre-modifica, test delle nuove funzionalità, esito della regressione) |

Diagrammi usati: per il Report_Progetto `analisi-modulo-*`, `modello-dati-as-is`,
`sequenza-*-as-is`; per l'Impact_Analysis `ia-cr01-as-is`, `ia-cr02-as-is`.

## 7. Stato finale

- [x] Test per le route a copertura zero o bassa; D-01…D-15 corretti.
- [x] Test dei componenti UI della CR (jsdom e Testing Library).
- [x] Suite E2E Playwright (12 scenari) e job `e2e` in CI.
- [x] Copertura rimisurata (§5.1): server 95,2% / 89,4%, 1013/1013 test.
- [x] Caratterizzazione rieseguita sul codice finale (15/10): 12 casi
      invariati superati, 4 modificati, 4 eliminati (SSE), come al §3.4.
- [x] 8 documenti LaTeX e diagrammi; PDF compilati in `documentazione/pdf/`.
- [x] `deliverables/` aggiornato (PDF, MANIFEST con SHA-256, README).
- [x] Cartella `BiblioFlow` creata in Drive dentro `documentiista`. I PDF
      vanno caricati a mano da `deliverables/`: il connettore Drive vuole il
      file intero dentro la chiamata, impraticabile per otto PDF da 300-600 KB.
- [ ] Da fare a cura del gruppo: aggiungere `logo-sesa.png` in
      `documentazione/immagini/loghi/`, ricompilare (`latexmk`) e lanciare
      `python3 aggiorna_consegna.py`.
- [ ] Verificare alla prima PR verso `main` che il job `e2e` passi in CI.
