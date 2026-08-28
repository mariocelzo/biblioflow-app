# Stati di `Prenotazione` — AS-IS

Questo documento descrive le transizioni effettivamente implementate nella baseline
precedente alla CR-BF-01. Gli stati provengono dall'enum `StatoPrenotazione` in
`prisma/schema.prisma`.

Il diagramma distingue il flusso ordinario dalle transizioni anomale che il codice
attuale consente per assenza di un controllo sullo stato di partenza. Queste ultime
non rappresentano il comportamento desiderato: sono parte dell'analisi AS-IS.

```mermaid
stateDiagram-v2
    direction LR

    [*] --> CONFERMATA: client/utente crea la prenotazione

    CONFERMATA --> CHECK_IN: utente fa check-in
    CONFERMATA --> CHECK_IN: bibliotecario/admin fa check-in
    CHECK_IN --> COMPLETATA: utente fa check-out

    CONFERMATA --> NO_SHOW: automazione/cron, oltre il margine
    CONFERMATA --> NO_SHOW: bibliotecario/admin risolve anomalia

    CONFERMATA --> CANCELLATA: utente o bibliotecario/admin
    CHECK_IN --> CANCELLATA: utente o bibliotecario/admin

    COMPLETATA --> CANCELLATA: bibliotecario/admin, stato non validato
    NO_SHOW --> CANCELLATA: bibliotecario/admin, stato non validato
    SCADUTA --> CANCELLATA: bibliotecario/admin, stato non validato

    CANCELLATA --> CHECK_IN: check-in manuale admin, stato non validato
    NO_SHOW --> CHECK_IN: check-in personale, stato non validato
    SCADUTA --> CHECK_IN: check-in manuale admin, stato non validato

    note right of SCADUTA
        Definito nell'enum e letto da UI/scanner,
        ma nessun flusso applicativo AS-IS lo assegna.
    end note

    note right of CANCELLATA
        L'annullamento admin non valida lo stato iniziale
        e puo' anche riscrivere CANCELLATA su CANCELLATA.
    end note
```

## Evidenze nel codice

| Stato iniziale | Stato finale | Attore | Evidenza AS-IS |
|---|---|---|---|
| nuovo record | `CONFERMATA` | client/utente | `POST /api/prenotazioni` crea esplicitamente la prenotazione come `CONFERMATA`; l'identita' arriva attualmente dal payload. |
| `CONFERMATA` | `CHECK_IN` | utente | `PATCH /api/prenotazioni/[id]` con azione `check-in` e `POST /api/prenotazioni/[id]/check-in`; entrambi richiedono lo stato `CONFERMATA`. |
| `CONFERMATA` | `CHECK_IN` | bibliotecario/admin | `POST /api/admin/prenotazioni` con azione `CHECK_IN_MANUALE` e `POST /api/admin/scanner/validate`. |
| `CHECK_IN` | `COMPLETATA` | utente | `PATCH /api/prenotazioni/[id]` con azione `check-out`; l'azione richiede lo stato `CHECK_IN`. |
| `CONFERMATA` | `NO_SHOW` | automazione/cron | `releaseNoShowReservations()` in `src/lib/automation-service.ts`, invocata dall'endpoint cron, seleziona solo prenotazioni `CONFERMATA`. |
| `CONFERMATA` | `NO_SHOW` | bibliotecario/admin | Azione `ANNULLA_PRENOTAZIONI_SENZA_CHECKIN` in `src/app/api/admin/anomalie/route.ts`. |
| `CONFERMATA`, `CHECK_IN` | `CANCELLATA` | utente | `PATCH /api/prenotazioni/[id]` con azione `cancella`; gli altri stati vengono rifiutati. |
| qualunque stato | `CANCELLATA` | bibliotecario/admin | Le azioni `ANNULLA_SINGOLA` e `ANNULLA_MULTIPLE` in `src/app/api/admin/prenotazioni/route.ts` non controllano lo stato iniziale. Nel diagramma sono mostrate solo le transizioni che cambiano effettivamente valore. |
| `CANCELLATA`, `NO_SHOW`, `SCADUTA` | `CHECK_IN` | bibliotecario/admin | `CHECK_IN_MANUALE` rifiuta soltanto `CHECK_IN` e `COMPLETATA`; lo scanner rifiuta `CANCELLATA` e `SCADUTA`, ma non `NO_SHOW`. Queste transizioni sono quindi tecnicamente raggiungibili. |

## Stati terminali e stato non raggiungibile

Nel flusso ordinario `COMPLETATA`, `CANCELLATA` e `NO_SHOW` sono terminali. Le
azioni amministrative prive di validazione possono tuttavia riaprire o sovrascrivere
parte di questi stati, come indicato nel diagramma.

`SCADUTA` non ha alcuna transizione entrante implementata: compare nell'enum, nei
tipi TypeScript, nei filtri dell'interfaccia amministrativa e nelle verifiche dello
scanner, ma non viene mai scritto da una route, un servizio o il seed attuale.

La route `DELETE /api/prenotazioni/[id]` elimina fisicamente il record senza assegnare
uno stato dell'enum; per questo non e' rappresentata come transizione di stato.
