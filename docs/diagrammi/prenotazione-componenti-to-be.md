# Componenti del sottosistema prenotazione — TO-BE

## Scopo e riferimenti

Questa vista descrive l'architettura effettiva dopo CR-BF-01, verificata sul
codice finale di `main` alla baseline `76ecb1e`. Completa, senza sostituirla,
l'analisi [AS-IS dei componenti](./prenotazione-componenti-as-is.md).

- Task: [BIB-64](https://mariospaceforuni.atlassian.net/browse/BIB-64)
- Prerequisito: documenti e verifiche di Fase 6 integrati in `main`
- Vista complementare: [stati TO-BE](./prenotazione-stati-to-be.md)
- Confronto sintetico: [AS-IS / TO-BE](./confronto-prenotazioni-as-is-to-be.md)

## Diagramma dei componenti

```mermaid
flowchart TB
    subgraph UI["UI utente e personale"]
        BOOK["/prenota<br/>selezione e conflitto → coda"]
        LIST["/prenotazioni<br/>azioni e lista d'attesa"]
        MAP["MappaBiblioteca<br/>MobilePostiGrid"]
        ADMIN["/admin/prenotazioni<br/>cancellazione e feedback promozione"]
        STATS["/admin/statistiche"]
        NOTIF_UI["/notifiche"]
    end

    subgraph API["Route Next.js"]
        PREN_API["/api/prenotazioni<br/>creazione autenticata"]
        ITEM_API["/api/prenotazioni/[id]<br/>ownership e cancellazione"]
        EXT_API["/api/prenotazioni/[id]/estendi<br/>validazione condivisa"]
        CHECK_API["/api/prenotazioni/[id]/check-in"]
        CODA_API["/api/prenotazioni/coda<br/>GET POST DELETE"]
        ADMIN_API["/api/admin/prenotazioni"]
        CRON_API["/api/cron/automations<br/>lock idempotente"]
        NOTIF_API["/api/notifiche"]
        SSE_API["/api/sse/posti"]
        STATS_API["/api/admin/statistiche"]
    end

    subgraph DOMAIN["Dominio e servizi"]
        AUTH["lib/auth<br/>requireUser, requireRole, ownership"]
        SERVICE["prenotazioni-service<br/>validazione, atomicità, FIFO, promozione"]
        AUTO["automation-service<br/>no-show e scadenza promozioni"]
        EVENTS["realtime-events<br/>eventi coda e notifiche personali"]
        EVENT_TYPES["eventi-coda<br/>classificazione audit"]
        SSE["sse-emitter"]
        PRISMA["lib/prisma<br/>PrismaClient"]
    end

    subgraph DATA["PostgreSQL / Prisma"]
        USER[(User)]
        POSTO[(Posto e Sala)]
        PREN[(Prenotazione)]
        CODA[(ListaAttesa)]
        LOG[(LogEvento)]
        NOTIF[(Notifica)]
        CONSTRAINT["EXCLUDE anti-sovrapposizione<br/>+ indici parziali FIFO/unicità"]
    end

    BOOK --> PREN_API
    BOOK --> CODA_API
    LIST --> ITEM_API
    LIST --> CHECK_API
    LIST --> EXT_API
    LIST --> CODA_API
    MAP --> CODA_API
    MAP --> SSE_API
    ADMIN --> ADMIN_API
    STATS --> STATS_API
    NOTIF_UI --> NOTIF_API

    PREN_API --> AUTH
    ITEM_API --> AUTH
    EXT_API --> AUTH
    CHECK_API --> AUTH
    CODA_API --> AUTH
    ADMIN_API --> AUTH
    NOTIF_API --> AUTH
    SSE_API --> AUTH

    PREN_API --> SERVICE
    EXT_API --> SERVICE
    CODA_API --> SERVICE
    ADMIN_API --> SERVICE
    CRON_API --> AUTO
    AUTO --> SERVICE

    CODA_API --> EVENTS
    ADMIN_API --> EVENTS
    AUTO --> EVENTS
    EVENTS --> SSE
    SSE_API --> SSE
    STATS_API --> EVENT_TYPES

    AUTH --> PRISMA
    SERVICE --> PRISMA
    AUTO --> PRISMA
    NOTIF_API --> PRISMA
    STATS_API --> PRISMA
    EVENTS --> PRISMA

    PRISMA --> USER
    PRISMA --> POSTO
    PRISMA --> PREN
    PRISMA --> CODA
    PRISMA --> LOG
    PRISMA --> NOTIF
    PREN --- CONSTRAINT
    CODA --- CONSTRAINT

    classDef ui fill:#dbeafe,stroke:#2563eb,color:#172554
    classDef api fill:#fef3c7,stroke:#d97706,color:#451a03
    classDef domain fill:#ede9fe,stroke:#7c3aed,color:#2e1065
    classDef data fill:#dcfce7,stroke:#16a34a,color:#052e16
    class BOOK,LIST,MAP,ADMIN,STATS,NOTIF_UI ui
    class PREN_API,ITEM_API,EXT_API,CHECK_API,CODA_API,ADMIN_API,CRON_API,NOTIF_API,SSE_API,STATS_API api
    class AUTH,SERVICE,AUTO,EVENTS,EVENT_TYPES,SSE,PRISMA domain
    class USER,POSTO,PREN,CODA,LOG,NOTIF,CONSTRAINT data
```

## Responsabilità consolidate

| Componente | Responsabilità TO-BE | Garanzia principale |
|---|---|---|
| `src/lib/auth.ts` | Identità, ruolo e ownership derivati dalla sessione | CA-01; niente identità autorevole dal payload |
| `src/lib/prenotazioni-service.ts` | Intervalli, conflitti, transazioni, coda FIFO e promozione | CA-02, CA-03 e CA-04 in un solo dominio |
| `Prenotazione` + migrazione SQL | Persistenza delle prenotazioni attive | Exclusion constraint su posto/data/intervallo |
| `ListaAttesa` | Richiesta distinta dalla prenotazione | Unicità parziale `IN_ATTESA` e ordine `createdAt, id` |
| Route `/api/prenotazioni/coda` | Ingresso, elenco con posizione e annullamento | Operazioni autenticate e ownership |
| `automation-service` | No-show, scadenza delle promozioni e nuova promozione | Effetti idempotenti e audit correlato |
| Route cron | Serializzazione dei run tramite advisory lock | Nessuna doppia elaborazione concorrente |
| `realtime-events` / SSE | Aggiornamento coda e notifica personale | Payload pubblico senza identificativi di terzi |
| Notifiche e `LogEvento` | Tracciabilità di ingresso, promozione, scadenza e annullamento | CA-05 e correlazione delle catene automatiche |

## Flussi principali

1. La route di creazione ricava l'utente dalla sessione e delega la scrittura
   atomica al servizio di dominio; il vincolo PostgreSQL resta l'ultima difesa.
2. In caso di intervallo occupato, la UI propone la coda e la route dedicata crea
   una `ListaAttesa` `IN_ATTESA`, con posizione FIFO calcolata dal dominio.
3. Cancellazione del personale o no-show liberano lo slot e invocano la stessa
   funzione `promuoviPrimoInCoda`; la promozione crea una `Prenotazione`,
   aggiorna la richiesta e registra `CODA_PROMOZIONE` nella medesima transazione.
4. Una promozione non confermata tramite check-in scade; automazione, notifica,
   audit e promozione del successivo chiudono il ciclo della coda.
5. Gli eventi SSE aggiornano mappa e pannello coda; i dettagli personali viaggiano
   soltanto sul canale autenticato del destinatario.

## Confini

Il diagramma rappresenta dipendenze presenti nel codice finale. Non attribuisce
a `ListaAttesa` lo stato di una prenotazione: le due entità mantengono cicli di
vita separati e vengono correlate dall'audit `CODA_PROMOZIONE`.
