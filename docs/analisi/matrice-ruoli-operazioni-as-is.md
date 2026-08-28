# Matrice ruoli-operazioni — AS-IS

## Scopo e baseline

Questo documento fotografa i controlli di autenticazione e autorizzazione effettivamente implementati prima della CR-BF-01. L'analisi è stata ricavata manualmente dai route handler e da `src/middleware.ts` sulla baseline `main` al commit `7469969` (tag `baseline-pre-cr-bf-01`).

- Task: [BIB-18 — Matrice ruoli-operazioni (AS-IS)](https://mariospaceforuni.atlassian.net/browse/BIB-18)
- Responsabile operativo: Renato Mancino, subentrato ad Alfonso Ferrara
- Ambito completo: `src/app/api/prenotazioni/**` e `src/app/api/admin/**`
- Inventario: 16 file route, 23 operazioni HTTP
- Criteri di accettazione CR-BF-01: nessuno specifico; la matrice prepara i test negativi di autorizzazione e la futura verifica di CA-01

## Come leggere la matrice

| Simbolo | Significato AS-IS |
|---|---|
| ✅ | Ruolo esplicitamente ammesso dopo `auth()` e controllo del ruolo nel route handler. |
| 👤 | Ammesso dopo `auth()` solo sulla prenotazione appartenente all'identità di sessione. |
| 🔐 | Ammesso da un handler che valida la sessione, ma non limita il ruolo. |
| ⚠️ | Nessun `auth()` nel handler e nessun controllo di ruolo; nel percorso HTTP ordinario resta soltanto il controllo superficiale del middleware. |
| ❌ | Ruolo esplicitamente respinto dal route handler con HTTP 403. |

Il middleware intercetta tutte le API non pubbliche e restituisce 401 quando non trova un cookie `authjs.session-token` o `__Secure-authjs.session-token`. Non decodifica però il token e non verifica né sessione né ruolo: se il handler non chiama `auth()`, la sola presenza del cookie consente di raggiungere la logica applicativa. Per questo ⚠️ non equivale a un'autorizzazione verificata.

## Area prenotazioni

| Endpoint | Operazione | STUDENTE | BIBLIOTECARIO | ADMIN | Guardia effettiva | Identità o risorsa target |
|---|---|:---:|:---:|:---:|---|---|
| `/api/prenotazioni` | GET — elenco e filtri | ⚠️ | ⚠️ | ⚠️ | Nessun `auth()` nel handler. | `userId` opzionale dalla query; può indicare qualunque utente. Senza filtro restituisce tutte le prenotazioni. |
| `/api/prenotazioni` | POST — creazione | ⚠️ | ⚠️ | ⚠️ | Nessun `auth()` nel handler. | **`userId` arriva dal payload client** ed è usato per prenotazione, log e notifica. |
| `/api/prenotazioni/[id]` | GET — dettaglio | ⚠️ | ⚠️ | ⚠️ | Nessun `auth()` e nessuna ownership. | Prenotazione scelta tramite `id` nel path; include dati dell'utente e gli ultimi eventi. |
| `/api/prenotazioni/[id]` | PATCH — check-in, check-out, cancellazione | ⚠️ | ⚠️ | ⚠️ | Nessun `auth()` e nessuna ownership. | Prenotazione scelta dal path. **`userId` opzionale dal payload** influenza il log, non autorizza l'azione. |
| `/api/prenotazioni/[id]` | DELETE — eliminazione fisica | ⚠️ | ⚠️ | ⚠️ | Nessun `auth()` e nessuna ownership. | Prenotazione scelta dal path; elimina anche i log collegati. |
| `/api/prenotazioni/[id]/check-in` | POST — check-in dedicato | 👤 | 👤 | 👤 | `auth()` e confronto `prenotazione.userId === session.user.id`; nessun vincolo di ruolo. | Identità dalla sessione; il `timestamp` operativo può arrivare dal payload client. |
| `/api/prenotazioni/[id]/estendi` | GET — slot di estensione | ⚠️ | ⚠️ | ⚠️ | Nessun `auth()` e nessuna ownership. | Prenotazione scelta dal path. |
| `/api/prenotazioni/[id]/estendi` | POST — estensione | ⚠️ | ⚠️ | ⚠️ | Nessun `auth()` e nessuna ownership. | Prenotazione scelta dal path; `nuovaOraFine` arriva dal payload client. |

### Risultato per l'area prenotazioni

Solo il check-in dedicato lega l'operazione alla sessione e verifica l'ownership. Tutte le altre operazioni possono essere eseguite da qualunque ruolo che superi il controllo di presenza del cookie del middleware; GET, PATCH, DELETE ed estensione non impediscono l'accesso a prenotazioni altrui.

## Area admin

| Endpoint | Operazione | STUDENTE | BIBLIOTECARIO | ADMIN | Guardia effettiva | Identità o risorsa target |
|---|---|:---:|:---:|:---:|---|---|
| `/api/admin/anomalie` | POST — risoluzione anomalie e azioni batch | ❌ | ✅ | ✅ | `auth()` più controllo ruolo staff. | Attore dalla sessione; azione e target (`userId` quando richiesto) dal payload. |
| `/api/admin/posti/[id]` | GET — posto, prenotazioni e utenti collegati | 🔐 | 🔐 | 🔐 | `auth()` senza controllo ruolo. | Posto dal path; uno STUDENTE autenticato può leggere anche lo storico incluso. |
| `/api/admin/posti/[id]` | PATCH — cambio stato posto | ❌ | ✅ | ✅ | `auth()` più controllo ruolo staff. | Attore dalla sessione; posto dal path, stato e motivo dal payload. |
| `/api/admin/posti/[id]/dettagli` | GET — statistiche e storico posto | ❌ | ✅ | ✅ | `auth()` più controllo ruolo staff. | Posto dal path. |
| `/api/admin/prenotazioni` | POST — annulla singola/multiple, check-in manuale, modifica | ❌ | ✅ | ✅ | `auth()` più controllo ruolo staff, uguale per tutte le azioni. | Attore dalla sessione; azione, ID e nuovi dati dal payload. |
| `/api/admin/prestiti` | POST — restituisci, rinnova, sollecita | ❌ | ✅ | ✅ | `auth()` più controllo ruolo staff, uguale per tutte le azioni. | Attore dalla sessione; azione e ID dal payload. |
| `/api/admin/richieste` | GET — elenco richieste di preparazione | ⚠️ | ⚠️ | ⚠️ | **Nessun `auth()` e nessun controllo ruolo nel handler.** | Filtro `stato` dalla query; risposta con dati personali dell'utente. |
| `/api/admin/richieste` | PATCH — modifica stato e note richiesta | ⚠️ | ⚠️ | ⚠️ | **Nessun `auth()` e nessun controllo ruolo nel handler.** | ID, stato e note arrivano dal payload client. |
| `/api/admin/scanner/validate` | POST — check-in tramite QR | ❌ | ✅ | ✅ | `auth()` più controllo ruolo staff. | Attore dalla sessione; QR dal payload contiene prenotazione e utente firmati. |
| `/api/admin/statistiche` | GET — aggregazioni | ❌ | ✅ | ✅ | `auth()` più controllo ruolo staff. | Tipo di statistica dalla query. |
| `/api/admin/utenti/[id]` | GET — dettaglio utente | ❌ | ✅ | ✅ | `auth()` più controllo ruolo staff. | Utente target dal path. |
| `/api/admin/utenti/[id]` | PATCH — attiva/disattiva utente | ❌ | ❌ | ✅ | `auth()` più controllo esclusivo `ADMIN`; vietata l'auto-disattivazione. | Attore dalla sessione; utente dal path e `attivo` dal payload. |
| `/api/admin/utenti/[id]/notifica` | POST — invia notifica | ❌ | ✅ | ✅ | `auth()` più controllo ruolo staff. | Attore dalla sessione; destinatario dal path e contenuto dal payload. |
| `/api/admin/utenti/[id]/profilo` | GET — profilo completo | ❌ | ✅ | ✅ | `auth()` più controllo ruolo staff. | Utente target dal path. |
| `/api/admin/utenti/[id]/storico` | GET — storico eventi | ❌ | ✅ | ✅ | `auth()` più controllo ruolo staff. | Utente target dal path. |

### Risultato per l'area admin

La maggior parte delle route applica correttamente la coppia `BIBLIOTECARIO`/`ADMIN`; la modifica dello stato di un utente è riservata ad `ADMIN`. Le eccezioni AS-IS sono:

1. `GET /api/admin/posti/[id]` valida la sessione ma non il ruolo e rende quindi disponibili a uno STUDENTE dati amministrativi, prenotazioni recenti e identità collegate.
2. `GET` e `PATCH /api/admin/richieste` non chiamano `auth()` e dipendono soltanto dalla presenza del cookie controllata dal middleware.

## Origine dell'identità e decisioni di autorizzazione

| Origine | Operazioni | Conseguenza AS-IS |
|---|---|---|
| Sessione verificata con ownership | Solo `POST /api/prenotazioni/[id]/check-in`. | Impedisce il check-in di una prenotazione altrui, indipendentemente dal ruolo. |
| Sessione verificata come attore staff | Route admin protette. | Il target resta normalmente nel path/payload, ma l'attore dei log deriva dalla sessione. |
| Payload client | `POST /api/prenotazioni` (`userId`), `PATCH /api/prenotazioni/[id]` (`userId` opzionale per il log). | Un client può creare per un altro utente o attribuire il log a un'identità arbitraria. |
| Query string | `GET /api/prenotazioni?userId=...`. | Un client può enumerare le prenotazioni di altri utenti o omettere il filtro per leggerle tutte. |
| Solo ID nel path, senza ownership | Dettaglio, aggiornamento, eliminazione ed estensione della prenotazione. | La conoscenza dell'ID è sufficiente per leggere o modificare la risorsa dopo il solo passaggio del middleware. |
| Cookie controllato solo per presenza | Handler marcati ⚠️. | Un cookie non vuoto raggiunge il handler; la validità della sessione non è verificata localmente. |

## Base per i test negativi di autorizzazione

Gli identificativi seguenti sono proposti come riferimenti stabili per le suite post-modifica. Descrivono i varchi AS-IS da chiudere, non test già implementati in questa task.

| ID | Scenario negativo da verificare dopo la modifica | Esito richiesto dalla CR |
|---|---|---|
| `AUTH-NEG-001` | Richiesta protetta senza sessione. | HTTP 401. |
| `AUTH-NEG-002` | Cookie presente ma sessione/token non valido. | HTTP 401 prima dell'accesso ai dati. |
| `AUTH-NEG-003` | STUDENTE legge l'elenco senza filtro o usa `userId` altrui. | Accesso limitato alla propria identità o rifiuto secondo policy. |
| `AUTH-NEG-004` | STUDENTE crea una prenotazione con `userId` altrui nel payload. | Il payload non decide l'identità; viene usata la sessione. |
| `AUTH-NEG-005` | Utente legge, modifica, elimina o estende una prenotazione altrui. | HTTP 403/404 secondo policy. |
| `AUTH-NEG-006` | STUDENTE chiama `GET /api/admin/posti/[id]`. | HTTP 403. |
| `AUTH-NEG-007` | STUDENTE legge o aggiorna `/api/admin/richieste`. | HTTP 403. |
| `AUTH-NEG-008` | BIBLIOTECARIO tenta di attivare/disattivare un utente. | HTTP 403. |
| `AUTH-NEG-009` | Ruolo non staff chiama ciascuna route admin rimanente. | HTTP 403. |

## Tracciabilità e documenti collegati

- [BIB-17 — diagramma delle transizioni di stato](../diagrammi/prenotazione-stati-as-is.md): descrive quali transizioni possono essere attivate dagli endpoint qui censiti.
- [BIB-16 — diagramma dei componenti, PR #8](https://github.com/mariocelzo/biblioflow-app/pull/8): mostra le dipendenze UI → API → auth/servizi → Prisma.
- [BIB-21 — test pre-modifica admin e UI, PR #7](https://github.com/mariocelzo/biblioflow-app/pull/7): fornisce la baseline di regressione dell'area amministrativa.

## Confini del documento

La matrice descrive il comportamento osservato, non quello desiderato. Non modifica middleware, route, ruoli o policy e non introduce test eseguibili: serve come input documentale ai test negativi e agli interventi delle fasi successive.
