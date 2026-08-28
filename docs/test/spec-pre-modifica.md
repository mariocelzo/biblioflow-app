# Specifica dei casi di test pre-modifica — automazioni, notifiche e SSE

## Scopo

Questa specifica fotografa il comportamento originale dell'area assegnata a Renato
prima degli interventi di Fase 4 della CR-BF-01. I casi verificano automazioni,
notifiche e il contratto del canale Server-Sent Events dei posti.

I casi non dimostrano ancora criteri di accettazione della change request: costituiscono
la baseline di regressione da mantenere o aggiornare in modo esplicito nelle fasi
successive.

## Convenzione degli identificativi

Gli identificativi sono stabili e divisi per area per evitare collisioni con le suite
degli altri componenti:

- `PRE-AUT-nnn`: automazioni periodiche;
- `PRE-NOT-nnn`: notifiche persistenti e relativa API;
- `PRE-SSE-nnn`: contratto realtime SSE.

Ogni ID compare sia in questo documento sia nel nome del corrispondente test Vitest.

## Ambiente e dati

- PostgreSQL 16 reale, isolato tramite il servizio `postgres-test` di Docker Compose;
- URL verificato prima di ogni sincronizzazione: il nome del database deve identificarlo
  esplicitamente come database di test;
- schema Prisma corrente applicato con `prisma db push` esclusivamente sul DB di test,
  anche quando la CI ha inizialmente applicato le sole migrazioni versionate;
- database ripulito prima di ogni caso di integrazione;
- date e orari costruiti rispetto all'istante di esecuzione per rendere riproducibili
  promemoria e no-show;
- test SSE eseguiti in ambiente Node, senza browser o connessioni di rete.

## Casi di test

### Automazioni

| ID | Scenario e precondizioni | Azione | Risultato atteso sulla baseline |
|---|---|---|---|
| `PRE-AUT-001` | Prenotazione `CONFERMATA` con inizio tra 15 e 20 minuti e nessun promemoria gia' inviato. | Eseguire `sendCheckInReminders()`. | Una notifica `CHECK_IN_REMINDER` non letta, con link alla prenotazione e label `Fai check-in`; viene creato anche un log `AUTOMATION`. |
| `PRE-AUT-002` | Stesse condizioni di `PRE-AUT-001`. | Eseguire due volte il promemoria nello stesso giorno. | La prima esecuzione invia una notifica, la seconda zero; nel DB rimane un solo promemoria. |
| `PRE-AUT-003` | Prenotazione `CONFERMATA` iniziata da oltre 15 minuti, senza check-in, con posto occupato. | Eseguire `releaseNoShowReservations()`. | Stato `NO_SHOW`, posto `DISPONIBILE`, notifica `ALERT` e log `NO_SHOW_AUTO` con riferimenti a prenotazione, utente e posto. |
| `PRE-AUT-004` | Prenotazione gia' in stato `SCADUTA` e con orario passato. | Eseguire `releaseNoShowReservations()`. | Nessuna prenotazione elaborata: `SCADUTA` resta invariato e non vengono creati notifiche o log. Il sistema originale non produce automaticamente questo stato. |

### Notifiche

| ID | Scenario e precondizioni | Azione | Risultato atteso sulla baseline |
|---|---|---|---|
| `PRE-NOT-001` | Un utente possiede una prenotazione recente nella stessa sala del posto appena liberato. | Eseguire `notifyAvailableSeat()`. | L'utente riceve una notifica `INFO`, non letta, con action URL `/prenota`. |
| `PRE-NOT-002` | L'utente possiede una notifica letta e una non letta. | Chiamare `GET /api/notifiche` con `letta=false`, `limit=1` e `offset=0`. | HTTP 200; risposta con `success`, lista filtrata, `count=1`, `totale=2` e `nonLette=1`. |

### Canale SSE dei posti

| ID | Scenario e precondizioni | Azione | Risultato atteso sulla baseline |
|---|---|---|---|
| `PRE-SSE-001` | Nessuna precondizione applicativa. | Chiamare `GET /api/sse/posti` e leggere il primo chunk. | HTTP 200, content type `text/event-stream`, cache disabilitata, connessione keep-alive, buffering nginx disabilitato e commento iniziale `: connected`. |
| `PRE-SSE-002` | Client sui canali `posti`, `user-1` e wildcard `*`. | Emettere `posto-update` sul canale `posti`. | Ricevono l'evento soltanto `posti` e wildcard; il formato e' `event: ...`, seguito da `data: <JSON>` e doppio newline. |
| `PRE-SSE-003` | Emitter disponibile. | Chiamare `emitPostoUpdate()` con tutti i campi. | Evento `posto-update` sul canale `posti` con `postoId`, `stato`, `numero`, `salaId`, `salaNome` e timestamp ISO. |
| `PRE-SSE-004` | Stream aperto sul canale `posti`. | Cancellare il reader dello stream. | Il client viene rimosso dal registro dell'emitter e il conteggio torna al valore iniziale. |

## Tracciabilita' verso i test eseguibili

| Area | File Vitest |
|---|---|
| Automazioni e notifiche | `tests/pre-modifica/automation-notifications.test.ts` |
| SSE posti | `tests/pre-modifica/sse-posti.test.ts` |

## Esecuzione

```bash
npm run test:db:prepare
npm test
npm run test:db:down
```

La preparazione rifiuta URL che non identificano esplicitamente un database di test.
Il database e' effimero e viene rimosso al termine della verifica.
