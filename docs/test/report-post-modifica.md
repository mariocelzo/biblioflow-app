# Report di esecuzione dei test sulle parti modificate — CR-BF-01

## Identificazione

| Campo | Valore |
| --- | --- |
| Task | BIB-61 — Report di esecuzione dei test sulle parti modificate |
| Fase | 6 — test post-modifica e regressione |
| Commit applicativo verificato | `adc5e30639d1e66aa84df88194979bcd443282ed` |
| Branch applicativo | `origin/main` dopo i merge delle Fasi 4 e 5 |
| Data esecuzione locale | 4 settembre 2026, Europe/Rome |
| Specifica | BIB-60, `docs/test/spec-post-modifica.md` in PR #43 |

## Ambiente

| Componente | Versione / configurazione |
| --- | --- |
| Sistema operativo locale | Windows 11 Pro `10.0.26200` |
| Node.js | `v22.12.0` |
| npm | `10.9.0` |
| Git | `2.50.1.windows.1` |
| Docker Engine | `29.1.3` |
| Database | PostgreSQL `16-alpine`, effimero, loopback `127.0.0.1:5433` |
| ORM | Prisma `7.10.0` |
| Test runner | Vitest `4.1.11` |

Il database e' stato creato con `npm run test:db:prepare`: le sette migrazioni
versionate sono state applicate con successo, lo schema e' stato riallineato e
la fixture minima e' stata caricata. Il primo tentativo ha correttamente fallito
quando Docker Desktop non era attivo; dopo l'avvio e la rimozione di un vecchio
container di test spento appartenente al worktree `bib-49`, la preparazione e'
terminata senza errori. Non e' stato usato il database Supabase condiviso.

## Comandi eseguiti

```powershell
npm ci
npm run test:db:prepare
$env:DATABASE_URL='postgresql://biblioflow_test@127.0.0.1:5433/biblioflow_test?schema=public'
npm test
npm run lint
npx tsc --noEmit
npm run build
npm audit --audit-level=high
```

I valori locali di `NEXTAUTH_SECRET` e `CRON_SECRET` erano placeholder effimeri
non di produzione e non sono stati salvati nel repository.

## Esito complessivo locale

```text
Test Files  21 passed (21)
Tests       179 passed | 2 expected fail (181)
Duration    3.72s
```

| Controllo | Esito | Dettaglio |
| --- | --- | --- |
| Installazione | PASS | 863 pacchetti installati con `npm ci`; Prisma Client generato |
| Migrazioni/fixture | PASS | 7/7 migrazioni; database sincronizzato; fixture caricata |
| Suite post-modifica | PASS tecnico | 21/21 file; 179 pass; 2 expected fail; exit code 0 |
| Lint | PASS | 0 errori, 24 warning preesistenti |
| TypeScript | PASS | 0 errori |
| Build Next.js | PASS | compilazione, typecheck e 43 pagine statiche completati |
| Audit high/critical | PASS | 0 high/critical; 2 moderate (`@humanfs/node`, `qs`) |

I warning di lint, le deprecazioni Sentry/Next middleware e le due vulnerabilita'
moderate non sono stati corretti: sono fuori dal perimetro documentale di BIB-61
e non rendono rosso alcun gate definito dalla pipeline.

## Evidenza CI sulla stessa revisione di `main`

La GitHub Actions run
[33787431551](https://github.com/mariocelzo/biblioflow-app/actions/runs/33787431551)
ha verificato lo stesso commit `adc5e30` su Ubuntu 24.04, Node 20.20.2 e
PostgreSQL 16. Tutti i cinque job si sono conclusi con `success`:

| Job | Esito | Evidenza |
| --- | --- | --- |
| test | PASS | [log job](https://github.com/mariocelzo/biblioflow-app/actions/runs/33787431551/job/100755486385) — 21 file passati |
| lint | PASS | [log job](https://github.com/mariocelzo/biblioflow-app/actions/runs/33787431551/job/100755485770) |
| typecheck | PASS | [log job](https://github.com/mariocelzo/biblioflow-app/actions/runs/33787431551/job/100755486660) |
| build | PASS | [log job](https://github.com/mariocelzo/biblioflow-app/actions/runs/33787431551/job/100755486057) |
| audit | PASS | [log job](https://github.com/mariocelzo/biblioflow-app/actions/runs/33787431551/job/100755485965) |

## Esiti dei casi AGGIUNTI

| Area / famiglia | Casi | Esito | Criteri |
| --- | ---: | --- | --- |
| Fase 2 — vincoli DB e dominio | 41 | 41 conformi | CA-01, CA-02, CA-03, CA-04, CA-05 |
| Fase 3 — API auth/ownership e concorrenza | 8 | 8 conformi | CA-01, CA-02 |
| Fase 4 — automazioni, notifiche e realtime | 72 | 72 conformi | CA-04, CA-05, CA-06 |
| Fase 5 — admin e UI, esclusi i target BIB-57 | 58 | 58 conformi | CA-01, CA-03, CA-04, CA-05, CA-06 |
| BIB-57 — target `TC-BIB57-051` e `054` | 2 | **expected fail** | CA-01 non completamente soddisfatto |
| **Totale** | **181** | **179 conformi, 2 target non soddisfatti** | |

Gli `expected fail` non sono flakiness ne' errori d'ambiente. Vitest li considera
esiti attesi perche' sono dichiarati con `it.fails`, ma descrivono requisiti di
sicurezza ancora mancanti:

1. `TC-BIB57-051`: uno STUDENTE su `GET /api/admin/posti/[id]` dovrebbe ricevere
   403, mentre il route handler verifica soltanto l'esistenza della sessione;
2. `TC-BIB57-054`: uno STUDENTE su `GET /api/admin/richieste` dovrebbe ricevere
   403; lo stesso handler non protegge neppure il `PATCH` senza sessione, come
   caratterizzato da `TC-BIB57-052` e `TC-BIB57-053`.

## Esiti dei casi MODIFICATI

| ID baseline | Esito post-modifica | Evidenza principale |
| --- | --- | --- |
| `TC-PRE-001` | PASS | identita' sessione + `TC-BIB31-001` transazione `Serializable` |
| `TC-PRE-002` | PASS | validazione centralizzata prima delle scritture |
| `TC-PRE-003` | PASS | `TC-BIB27-012`–`013` |
| `TC-PRE-004` | PASS, differenza voluta | `TC-BIB27-005`: intervallo invertito ora rifiutato |
| `TC-PRE-005` | PASS | BIB-24 DB, BIB-31 e concorrenza reale |
| `TC-PRE-006` | PASS | ownership e promozione idempotente su cancellazione |
| `TC-PRE-007` | PASS, differenza voluta | data e campo `Time` ricomposti correttamente |
| `TC-PRE-008` | PASS | percorso legacy sottoposto a sessione/ownership/stati |
| `TC-PRE-009` | PASS | estensione con regole centralizzate e conflitto coerente |
| `TC-PRE-010` | PASS, differenza voluta | durata calcolata sul giorno della prenotazione |
| `TC-PRE-021` | PASS | `TC-BIB49-001`–`004`, promozione dopo cancellazione admin |
| `TC-PRE-023` | PASS | payload non autorevole + proposta ingresso in coda |
| `TC-PRE-024` | PASS | percorso libero invariato e percorso conflitto→coda aggiunto |
| `PRE-AUT-003` | PASS | `TC-BIB40-001`–`007`, `TC-BIB47-001`–`004` |

## Criteri di accettazione CA-01…CA-05

| CA | Evidenza eseguita | Valutazione |
| --- | --- | --- |
| CA-01 — accesso | BIB-26; auth API Fase 3; BIB-51; BIB-56; BIB-57 | **PARZIALE**: i flussi prenotazione/coda e la maggioranza delle rotte admin sono conformi; restano i gap BIB-57 sopra descritti |
| CA-02 — concorrenza | BIB-24 DB; BIB-27/31; due casi PostgreSQL concorrenti con round ripetuti | **PASS** |
| CA-03 — lista d'attesa | BIB-23 DB; BIB-31; BIB-52/53/54 | **PASS** |
| CA-04 — riassegnazione | BIB-31/40/41/44/47/49/58 | **PASS** |
| CA-05 — tracciabilita' | BIB-31/42/45/46/47/58 | **PASS** |

## Conclusione BIB-61

La suite post-modifica e tutti i gate tecnici sono riproducibili e verdi. CA-02,
CA-03, CA-04 e CA-05 dispongono di prove positive complete. CA-01 dispone di
copertura automatizzata, ma non puo' essere dichiarato integralmente soddisfatto:
i due `expected fail` sono evidenza di un gap funzionale, non test ignorati.

Il report di regressione BIB-62 deve ora verificare i 20 casi invariati. La
verifica finale BIB-63 dovra' mantenere CA-01 in stato non conforme finche' i
route handler di competenza admin non saranno corretti dal responsabile d'area
o formalmente esclusi dal perimetro della change request.
