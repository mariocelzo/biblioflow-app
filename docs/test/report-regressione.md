# Report dei test di regressione — CR-BF-01

## Identificazione

| Campo | Valore |
| --- | --- |
| Task | BIB-62 — Report dei test di regressione |
| Fase | 6 — test post-modifica e regressione |
| Criterio coperto | CA-06 — assenza di regressioni non motivate |
| Baseline pre-modifica | tag `baseline-pre-cr-bf-01` (`e0742bf`) |
| Report di confronto | `docs/test/report-pre-modifica.md` |
| Classificazione dei casi | `docs/test/spec-post-modifica.md` (BIB-60) |
| Versione verificata | `main` (`adc5e30`) dopo il merge delle Fasi 4 e 5 |
| Data di esecuzione | 2026-09-04 CEST |

## Scopo

Il documento registra la riesecuzione dei 20 casi classificati **INVARIATI**
nella specifica post-modifica. Il confronto e' effettuato caso per caso con il
report pre-modifica BIB-22, nel quale gli stessi casi risultavano tutti `PASS`.

Le aree richieste da BIB-62 sono inoltre ricondotte alle evidenze disponibili:
login, profilo, catalogo libri, prestiti, check-in, area admin, notifiche
preesistenti e PWA. Quando la baseline non contiene un caso comportamentale
dedicato, il report distingue esplicitamente il controllo smoke/strutturale da
un test end-to-end.

## Ambiente e metodo

| Componente | Versione/configurazione |
| --- | --- |
| Sistema | Windows 11 Pro `10.0.26200`, timezone `Europe/Rome` |
| Node.js | `v22.12.0` |
| npm | `10.9.0` |
| Vitest | `4.1.11` |
| Docker | `29.1.3` |
| Database | PostgreSQL `16-alpine`, database isolato `biblioflow_test` su `127.0.0.1:5433` |
| Schema | 7/7 migrazioni applicate e fixture minima caricata |

I casi invariati sono stati selezionati per ID, evitando di eseguire come
regressione i 14 casi marcati **MODIFICATI**. La suite automazioni/notifiche
pre-modifica invoca `prisma.cmd` con `shell: true`: su Windows il setup non
gestisce un percorso di lavoro contenente spazi. Per non alterare ne' i test ne'
l'applicazione, la medesima working tree e' stata esposta tramite un junction
temporaneo privo di spazi e i cinque casi sono stati rieseguiti da li'.

Comandi equivalenti usati:

```text
npx vitest run tests/pre-modifica/login.test.ts \
  tests/pre-modifica/admin-ui.test.ts \
  tests/pre-modifica/sse-posti.test.ts \
  -t "TC-PRE-01[1-9]|TC-PRE-020|TC-PRE-022|PRE-SSE-00[1-4]"

npx vitest run tests/pre-modifica/automation-notifications.test.ts \
  -t "PRE-AUT-00[124]|PRE-NOT-00[12]"
```

## Esito complessivo dei casi invariati

| Indicatore | Baseline | Post-modifica | Differenza |
| --- | ---: | ---: | --- |
| Casi invariati eseguiti | 20 | 20 | 0 |
| Passati | 20 | 20 | 0 |
| Falliti | 0 | 0 | 0 |
| Saltati fra i casi selezionati | 0 | 0 | 0 |
| Esito | PASS | PASS | Nessuna regressione |

I casi mostrati come `skipped` da Vitest appartengono agli stessi file ma sono
quelli classificati **MODIFICATI** (`TC-PRE-021`, `TC-PRE-023`,
`TC-PRE-024`, `PRE-AUT-003`); non fanno parte del denominatore di 20.

## Confronto caso per caso

| ID | Area | Baseline BIB-22 | Post-modifica | Differenza |
| --- | --- | :---: | :---: | --- |
| `TC-PRE-011` | Login valido | PASS | PASS | Nessuna |
| `TC-PRE-012` | Password errata | PASS | PASS | Nessuna |
| `TC-PRE-013` | Account disattivato | PASS | PASS | Nessuna |
| `TC-PRE-014` | Redirect pagina admin anonima | PASS | PASS | Nessuna |
| `TC-PRE-015` | API admin anonima | PASS | PASS | Nessuna |
| `TC-PRE-016` | Accesso pagina con cookie | PASS | PASS | Nessuna |
| `TC-PRE-017` | Studente su statistiche admin | PASS | PASS | Nessuna |
| `TC-PRE-018` | Bibliotecario modifica stato utente | PASS | PASS | Nessuna |
| `TC-PRE-019` | Staff legge dettaglio utente | PASS | PASS | Nessuna |
| `TC-PRE-020` | Restituzione prestito | PASS | PASS | Nessuna |
| `TC-PRE-022` | Distribuzione no-show | PASS | PASS | Nessuna |
| `PRE-AUT-001` | Promemoria check-in | PASS | PASS | Nessuna |
| `PRE-AUT-002` | Idempotenza promemoria | PASS | PASS | Nessuna |
| `PRE-AUT-004` | Prenotazione gia' scaduta | PASS | PASS | Nessuna |
| `PRE-NOT-001` | Notifica posto disponibile | PASS | PASS | Nessuna |
| `PRE-NOT-002` | GET notifiche | PASS | PASS | Nessuna |
| `PRE-SSE-001` | Header e handshake SSE | PASS | PASS | Nessuna |
| `PRE-SSE-002` | Framing e isolamento canali SSE | PASS | PASS | Nessuna |
| `PRE-SSE-003` | Payload `posto-update` | PASS | PASS | Nessuna |
| `PRE-SSE-004` | Chiusura stream | PASS | PASS | Nessuna |

## Copertura delle aree richieste

| Area | Evidenza | Esito e limite |
| --- | --- | --- |
| Login | `TC-PRE-011`–`013`; smoke `/login` HTTP 200 | PASS, evidenza comportamentale automatizzata |
| Profilo | build statica della route `/profilo`; smoke HTTP 200 con cookie; nessun diff applicativo rispetto alla baseline | PASS strutturale; la baseline non definiva un caso E2E autonomo |
| Catalogo libri | build delle route `/libri` e `/libri/[id]`; smoke `/libri` HTTP 200 | PASS strutturale; l'unico diff e' l'escape HTML di una citazione, senza cambio funzionale |
| Prestiti | `TC-PRE-020`; build e smoke `/prestiti` HTTP 200 | PASS, restituzione verificata con stato, log e notifica |
| Check-in | `PRE-AUT-001`; suite post-modifica completa e aggregato auth su tutte le operazioni protette | PASS per reminder e protezione route; il comportamento dedicato e' intenzionalmente modificato da CR-BF-01 |
| Area admin | `TC-PRE-014`–`020`, `TC-PRE-022` | 8/8 PASS per i comportamenti invariati |
| Notifiche preesistenti | `PRE-NOT-001`, `PRE-NOT-002` | 2/2 PASS |
| PWA | `manifest.json`, `sw.js`, `offline.html`, registrazione provider e build | PASS per asset core; limite storico sugli screenshot descritto sotto |

Le route protette `/profilo`, `/libri`, `/prestiti`, `/prenotazioni` e `/admin`
rispondono `307` verso `/login` senza cookie, come previsto dal middleware. Con
un cookie di sessione presente, le route studente sottoposte a smoke rispondono
`200`; l'autenticita' e il ruolo del token vengono verificati dai route handler
e dai test di autorizzazione, non dallo smoke HTTP.

## Differenze osservate e motivazione

### Differenze volute

I casi `TC-PRE-007` e `TC-PRE-008` non sono invariati: BIB-60 li classifica
**MODIFICATI** perche' il check-in dedicato ricompone correttamente data e ora e
perche' sia il percorso dedicato sia quello legacy applicano autenticazione e
ownership. La differenza rispetto alla baseline, che caratterizzava un difetto,
e' quindi un miglioramento richiesto dalla CR-BF-01 e viene verificata nella
suite post-modifica BIB-61.

Il solo file del catalogo cambiato dalla baseline, `src/app/libri/[id]/page.tsx`,
sostituisce virgolette letterali con entita' HTML per soddisfare il lint. Non
cambia dati, chiamate API o flusso utente: differenza non funzionale e voluta.

### Limiti preesistenti, non regressioni CR-BF-01

Il manifest PWA e il service worker sono serviti correttamente a un utente con
sessione: `manifest.json` HTTP 200 e JSON valido (`display: standalone`, 3 icone,
3 shortcut), `sw.js` HTTP 200 e `offline.html` HTTP 200. Senza sessione,
`manifest.json` e `offline.html` sono reindirizzati al login dal middleware.
Inoltre il manifest dichiara due screenshot (`home.png` e `prenota.png`) che non
esistono in `public/screenshots`.

Il confronto Git con `baseline-pre-cr-bf-01` dimostra che manifest, matcher del
middleware e assenza dei due screenshot erano gia' presenti prima della change
request. Sono quindi limiti storici della PWA, non regressioni introdotte dalle
Fasi 2–5. Non impediscono il caricamento degli asset core per l'utente autenticato,
ma meritano una task separata se si richiede installabilita' completa anche
prima del login e una scheda PWA senza risorse mancanti.

### Perche' `npx vitest run` mostra molti errori

Lanciare Vitest senza il filtro di progetto include anche tutti i 34 test di
caratterizzazione pre-modifica. Gli 11 errori osservati in quella modalita'
provengono dai casi `TC-PRE-001`–`010` e dal setup Windows: i mock storici non
esportano il nuovo `AuthError` usato dalle route post-modifica. Quei casi sono
stati classificati **MODIFICATI**, non devono essere interpretati come esito
della suite corrente e non costituiscono regressioni.

La suite ufficiale post-modifica eseguita in BIB-61 resta separata e ha prodotto:

```text
Test Files  21 passed (21)
Tests       179 passed | 2 expected fail (181)
```

I due `expected fail` riguardano target di sicurezza BIB-57/CA-01 e sono gia'
registrati nel report delle parti modificate; non appartengono ai 20 casi
invariati di CA-06.

## Conclusione CA-06

I 20 casi invariati conservano esattamente l'esito della baseline: **20/20 PASS,
nessuna differenza e nessuna regressione aperta**. Le differenze funzionali del
check-in sono miglioramenti intenzionali della CR-BF-01; i limiti PWA rilevati
sono dimostrabilmente anteriori alla change request. Per il perimetro di
regressione definito da BIB-60, **CA-06 e' verificato**.
