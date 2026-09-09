# Stati di prenotazione e lista d'attesa — TO-BE

## Scopo e convenzioni

Il TO-BE distingue le due entità persistenti introdotte o modificate dalla
CR-BF-01. `ListaAttesa` non è uno stato di `Prenotazione`: una prenotazione nasce
solo dalla creazione diretta riuscita o da una promozione FIFO.

- Analisi precedente: [stati Prenotazione AS-IS](./prenotazione-stati-as-is.md)
- Architettura aggiornata: [componenti TO-BE](./prenotazione-componenti-to-be.md)
- Confronto: [AS-IS / TO-BE](./confronto-prenotazioni-as-is-to-be.md)

## Ciclo della prenotazione

```mermaid
stateDiagram-v2
    direction LR

    [*] --> CONFERMATA: creazione diretta atomica
    [*] --> CONFERMATA: promozione FIFO dalla coda

    CONFERMATA --> CHECK_IN: check-in utente o personale
    CHECK_IN --> COMPLETATA: check-out

    CONFERMATA --> CANCELLATA: cancellazione utente o personale
    CHECK_IN --> CANCELLATA: cancellazione ammessa
    CONFERMATA --> NO_SHOW: rilascio automatico oltre il margine
    CONFERMATA --> SCADUTA: promozione non confermata entro 15 minuti

    CANCELLATA --> [*]
    COMPLETATA --> [*]
    NO_SHOW --> [*]
    SCADUTA --> [*]

    note right of CONFERMATA
        CHECK_IN conferma anche una prenotazione
        ottenuta tramite promozione.
    end note

    note right of CANCELLATA
        La cancellazione del personale può innescare
        la promozione del primo in coda.
    end note
```

## Ciclo della lista d'attesa

```mermaid
stateDiagram-v2
    direction LR

    [*] --> IN_ATTESA: utente entra nella coda dello slot
    IN_ATTESA --> ANNULLATA: proprietario annulla
    IN_ATTESA --> PROMOSSA: slot liberato, selezione FIFO

    ANNULLATA --> [*]
    SCADUTA --> [*]

    state PROMOSSA_FINALE <<choice>>
    PROMOSSA --> PROMOSSA_FINALE: verifica prenotazione associata
    PROMOSSA_FINALE --> [*]: check-in o completamento già avvenuto
    PROMOSSA_FINALE --> SCADUTA: prenotazione non confermata

    note right of IN_ATTESA
        Unicità parziale per utente e slot.
        FIFO: createdAt, poi id.
    end note

    note right of PROMOSSA
        La transazione crea Prenotazione CONFERMATA
        e LogEvento CODA_PROMOZIONE.
    end note
```

## Coordinamento fra i due cicli

```mermaid
sequenceDiagram
    autonumber
    participant U as Utente o personale
    participant A as API / Automazione
    participant D as prenotazioni-service
    participant DB as PostgreSQL
    participant E as Notifiche / SSE

    U->>A: il personale cancella oppure si verifica un no-show
    A->>DB: chiude Prenotazione e libera lo slot
    A->>D: promuoviPrimoInCoda(slot)
    D->>DB: lock FIFO + verifica disponibilità
    D->>DB: crea Prenotazione CONFERMATA
    D->>DB: IN_ATTESA → PROMOSSA + LogEvento
    D-->>A: promozione oppure coda vuota
    A->>E: notifica personale + evento coda

    alt check-in entro 15 minuti
        U->>A: check-in
        A->>DB: CONFERMATA → CHECK_IN
    else finestra scaduta
        A->>DB: PROMOSSA → SCADUTA
        A->>DB: Prenotazione CONFERMATA → SCADUTA
        A->>D: promuoviPrimoInCoda(slot) per il successivo
    end
```

## Transizioni e garanzie

| Entità | Da | A | Innesco | Effetti osservabili |
|---|---|---|---|---|
| `ListaAttesa` | nuovo | `IN_ATTESA` | ingresso autenticato | `CODA_INGRESSO`, notifica, posizione FIFO |
| `ListaAttesa` | `IN_ATTESA` | `ANNULLATA` | proprietario | `CODA_ANNULLATA` |
| `ListaAttesa` | `IN_ATTESA` | `PROMOSSA` | cancellazione, no-show o scadenza precedente | nuova `Prenotazione`, `CODA_PROMOZIONE`, notifica/SSE |
| `ListaAttesa` | `PROMOSSA` | `SCADUTA` | nessun check-in entro la finestra | `CODA_SCADENZA`, rilascio e tentativo sul successivo |
| `Prenotazione` | nuovo | `CONFERMATA` | creazione o promozione | transazione Serializable e vincolo DB |
| `Prenotazione` | `CONFERMATA` | `CHECK_IN` | utente autorizzato/personale | posto occupato e audit |
| `Prenotazione` | `CHECK_IN` | `COMPLETATA` | check-out | chiusura ordinaria |
| `Prenotazione` | attiva | `CANCELLATA` | utente | chiusura; rilascio del posto se era in `CHECK_IN` |
| `Prenotazione` | attiva | `CANCELLATA` | personale | rilascio e possibile promozione |
| `Prenotazione` | `CONFERMATA` | `NO_SHOW` | cron | rilascio e possibile promozione |
| `Prenotazione` | `CONFERMATA` promossa | `SCADUTA` | mancata conferma | rilascio e possibile promozione successiva |

Le transizioni automatiche usano guardie sullo stato atteso e transazioni
Serializable. Un secondo run non ripete gli effetti già persistiti; il vincolo
di esclusione impedisce comunque due prenotazioni attive sovrapposte.
