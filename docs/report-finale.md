# CR-BF-01 — Report finale di analisi, progettazione e realizzazione

## 1. Identificazione

| Campo | Valore |
| --- | --- |
| Progetto | BiblioFlow |
| Change request | CR-BF-01 |
| Task documentale | [BIB-65](https://mariospaceforuni.atlassian.net/browse/BIB-65) |
| Corso | Ingegneria, Gestione ed Evoluzione del Software — A.A. 2025/2026 |
| Baseline immutabile | tag `baseline-pre-cr-bf-01`, commit `e0742bfca4c5b05a0223bbca71f9756af9f42596` |
| Versione finale analizzata | `main`, commit `76ecb1e7553a5d8a0e93d23d900a4aa44aefefea` |
| Esito dei criteri | 6 criteri verificati su 6 |

## 2. Sintesi della change request

CR-BF-01 ha reso sicuro e consistente il processo di prenotazione dei posti
studio. Nella baseline l'identita' poteva provenire dal client, la verifica di
disponibilita' e la scrittura erano separate e non esisteva una lista d'attesa.
La modifica introduce:

1. identita' e ownership derivate dalla sessione autenticata;
2. validazione centralizzata degli intervalli;
3. creazione atomica con transazione e vincolo PostgreSQL;
4. lista d'attesa FIFO senza duplicati attivi;
5. promozione automatica e idempotente su cancellazione, no-show e scadenza;
6. log, notifiche e aggiornamenti realtime correlati alle transizioni;
7. adeguamenti di API, amministrazione, interfacce e statistiche necessari a
   evitare regressioni.

L'intervento e' evolutivo: amplia il flusso di prenotazione senza riprogettare
l'intera applicazione, cambiare framework o modificare i processi di prestito e
preparazione libri oltre ai controlli di regressione.

## 3. Processo di impact analysis

### 3.1 Metodo seguito

L'impact analysis e' stata eseguita prima delle modifiche applicative e ha
seguito un processo ripetibile:

1. **Congelamento della baseline.** Il tag `baseline-pre-cr-bf-01` e' stato
   mantenuto immutabile per separare comportamento originale e TO-BE.
2. **Inventario statico.** Sono stati esaminati schema Prisma, route handler,
   import, chiamate HTTP, accessi al database, middleware, automazioni,
   notifiche, SSE, componenti UI e statistiche.
3. **Modellazione AS-IS.** Sono stati prodotti diagramma dei componenti,
   diagramma degli stati e matrice ruoli-operazioni.
4. **Caratterizzazione eseguibile.** I casi pre-modifica hanno fissato i
   comportamenti corretti e i difetti osservati prima di toccare il codice.
5. **Propagazione dell'impatto.** Per ogni componente direttamente modificato
   sono stati seguiti produttori, consumatori e dati condivisi, identificando i
   ripple effect.
6. **Realizzazione incrementale.** Dati e dominio hanno preceduto API,
   automazioni, interfacce e verifiche finali.
7. **Confronto post-modifica.** I casi sono stati classificati come aggiunti,
   modificati, invariati o eliminati e collegati ai criteri CA-01–CA-06.

### 3.2 Evidenze AS-IS

I documenti di analisi originali restano separati dal presente report:

- [diagramma componenti AS-IS](diagrammi/prenotazione-componenti-as-is.md);
- [diagramma stati Prenotazione AS-IS](diagrammi/prenotazione-stati-as-is.md);
- [matrice ruoli-operazioni AS-IS](analisi/matrice-ruoli-operazioni-as-is.md);
- [specifica dei test pre-modifica](test/spec-pre-modifica.md);
- [report di esecuzione pre-modifica](test/report-pre-modifica.md).

L'analisi ha evidenziato quattro cause principali:

- alcune route si fidavano di `userId` proveniente da payload o query string;
- creazione ed estensione duplicavano regole di validazione;
- controllo della disponibilita' e creazione non costituivano un'operazione
  atomica e il database non impediva le sovrapposizioni;
- cancellazioni e no-show liberavano un posto senza alcun ciclo di coda.

### 3.3 Componenti impattati direttamente

| Componente | Motivo dell'impatto | Risultato TO-BE |
| --- | --- | --- |
| `prisma/schema.prisma` e migrazioni | Servivano entita', stati, indici e garanzie DB. | `ListaAttesa`, enum di coda, unicita' attiva, indice FIFO e exclusion constraint sulle prenotazioni attive. |
| `src/lib/auth.ts` | L'identita' non poteva restare autorevole nel payload. | Helper `requireUser`, `requireRole` e `assertOwnership` con errori 401/403/404 coerenti. |
| `src/lib/prenotazioni-service.ts` | Le regole erano duplicate tra endpoint. | Unico servizio di dominio per validazione, transazioni, coda e promozione. |
| `src/app/api/prenotazioni/**` | Le API dovevano usare sessione, dominio e contratti sicuri. | Ownership, validazione condivisa, creazione atomica, estensione coerente e API coda. |

### 3.4 Componenti impattati indirettamente — ripple effect

| Area | Dipendenza propagata | Adeguamento e rischio evitato |
| --- | --- | --- |
| Automazioni e cron | No-show e scadenze liberano intervalli prenotabili. | Invocazione della promozione di dominio, lock e idempotenza; evitati doppi assegnamenti e notifiche duplicate. |
| Cancellazione amministrativa | La cancellazione staff modifica lo stesso stato usato dalla coda. | Promozione dopo il rilascio e feedback esplicito; evitato un posto libero con coda ferma. |
| Check-in e scanner | Una richiesta in attesa non equivale a una prenotazione. | Controlli su identita', ownership e stati ammessi; evitato il check-in di utenti non promossi. |
| Notifiche e log | Nuove transizioni richiedono nuovi tipi persistiti. | Enum estesi, riferimenti correlati e rendering con fallback; conservati i tipi storici. |
| Realtime/SSE | La disponibilita' cambia anche per coda e automazioni. | Eventi condivisi e canali isolati; evitati aggiornamenti mancanti o dati di altri utenti. |
| Mappa e vista mobile | Il conflitto non e' piu' un vicolo cieco. | Ingresso in coda da entrambe le viste e dal dialog di conflitto. |
| Middleware e route admin | I nuovi endpoint e i dati amministrativi devono rispettare RBAC. | Protezione delle route coda e chiusura dei varchi 401/403 individuati dalla verifica finale. |
| Statistiche | I nuovi eventi non devono alterare indicatori preesistenti. | Filtri e indicatore dedicato alla coda; conservata la distribuzione no-show. |

Questa distinzione ha impedito di limitare la modifica ai soli file nominati
dalla richiesta: la propagazione verso i consumatori e' stata trattata come
parte verificabile della manutenzione, non come lavoro accessorio.

## 4. Progettazione TO-BE

### 4.1 Servizio di dominio unico

`src/lib/prenotazioni-service.ts` e' il punto unico delle regole di prenotazione
e lista d'attesa. Non dipende da `Request` o `Response`, quindi gli endpoint
traducono soltanto input, sessione ed errori HTTP. Il servizio controlla:

- data non passata, ordine degli orari e durata massima;
- apertura della sala e stato attivo/non in manutenzione del posto;
- sovrapposizioni sullo stesso posto;
- ingresso, annullamento e posizione FIFO della richiesta;
- promozione del primo utente eleggibile.

Gli errori hanno codice stabile e messaggio non tecnico. Creazione ed estensione
non possono quindi divergere silenziosamente nell'interpretazione dello stesso
intervallo.

### 4.2 Atomicita' e concorrenza

La sola verifica applicativa non e' sufficiente: due richieste possono leggere
contemporaneamente lo stesso stato libero. La soluzione usa due livelli:

1. transazioni Prisma con isolamento `Serializable` per mantenere verifica e
   scrittura nella stessa unita' atomica;
2. exclusion constraint PostgreSQL sull'intervallo delle prenotazioni attive,
   come ultima garanzia anche per scritture esterne all'applicazione.

Le violazioni di vincolo e i conflitti serializzabili vengono tradotti in un
errore di dominio gestito. Il chiamante puo' proporre l'ingresso in lista
d'attesa senza esporre dettagli del database.

### 4.3 Modello della lista d'attesa

`ListaAttesa` collega utente, posto, data e intervallo e usa gli stati
`IN_ATTESA`, `PROMOSSA`, `SCADUTA` e `ANNULLATA`. L'ordine e' deterministico:
prima `createdAt`, poi `id` come criterio di spareggio. Il vincolo sui record
attivi impedisce allo stesso utente di accodarsi due volte per lo stesso
intervallo senza impedire la conservazione dello storico terminale.

La promozione seleziona il primo eleggibile, crea la prenotazione e aggiorna la
richiesta nella stessa operazione transazionale. Chiamate ripetute non producono
una seconda prenotazione.

### 4.4 Identita', ruoli e ownership

L'identita' operativa deriva sempre dalla sessione. Il client puo' indicare una
risorsa, ma non scegliere l'attore. Gli helper comuni distinguono:

- `401` quando manca una sessione valida;
- `403` quando il ruolo non permette l'operazione;
- `403` o `404` per una risorsa altrui secondo la policy documentata.

La configurazione NextAuth esistente non e' stata riscritta: gli helper sono
stati aggiunti sopra il contratto corrente e riusati dalle route.

### 4.5 Eventi, notifiche e realtime

Le transizioni di coda usano tipi espliciti (`CODA_INGRESSO`,
`CODA_PROMOZIONE`, `CODA_SCADENZA`, `CODA_ANNULLATA`). Log e notifiche
conservano i riferimenti a utente, posto, richiesta e prenotazione. Gli eventi
realtime aggiornano i soli canali interessati. Il cron registra cosa ha
processato e usa protezioni idempotenti, così una seconda esecuzione ravvicinata
non cambia lo stato prodotto dalla prima.

### 4.6 Diagrammi

La fotografia AS-IS e' disponibile nei documenti indicati nella sezione 3.2.
I diagrammi TO-BE e il confronto affiancato sono prodotti dalla task correlata
[BIB-64, PR #49](https://github.com/mariocelzo/biblioflow-app/pull/49):

- diagramma dei componenti con servizio di dominio e lista d'attesa;
- diagramma delle transizioni di `Prenotazione` e `ListaAttesa`;
- confronto AS-IS/TO-BE e sintesi dei ripple effect.

Il collegamento alla PR e' intenzionale: al commit analizzato BIB-64 non e'
ancora integrata in `main`, pertanto BIB-65 non ne usa il branch come base e non
duplica i diagrammi nel report.

## 5. Realizzazione incrementale

### 5.1 Sequenza degli incrementi

| Fase | Incremento | Dipendenza soddisfatta |
| --- | --- | --- |
| 0 | Regole Git, framework di test e pipeline CI. | Processo riproducibile prima delle modifiche. |
| 1 | Analisi AS-IS e test pre-modifica. | Baseline osservabile e difetti caratterizzati. |
| 2 | Schema, vincoli, autenticazione e servizio di dominio. | Fondamenta condivise per tutte le route. |
| 3 | API di prenotazione sicure e atomiche. | Esposizione HTTP del dominio senza identita' client autorevole. |
| 4 | Automazioni, notifiche e realtime. | Promozione su no-show/scadenza e tracciabilita'. |
| 5 | Amministrazione, middleware, UI e statistiche. | Chiusura dei ripple effect verso operatori e utenti. |
| 6 | Specifica post-modifica, esecuzione e regressione. | Verifica esplicita di CA-01–CA-06. |
| 7 | Diagrammi TO-BE e report finale. | Consolidamento dei deliverable del corso. |

### 5.2 Migrazioni dati

| Migrazione | Scopo |
| --- | --- |
| `20260829102939_lista_attesa` | Introduce entita', stato e indici della lista d'attesa. |
| `20260829131500_vincolo_anti_sovrapposizione_prenotazioni` | Impone la non sovrapposizione delle prenotazioni attive a livello PostgreSQL. |
| `20260829133500_estensione_enum_coda` | Estende, senza rinominare o rimuovere, gli enum di notifiche ed eventi. |
| `20260902113000_enable_rls_public_tables` | Abilita RLS sulle tabelle pubbliche come hardening della persistenza. |

Le migrazioni sono versionate e la pipeline di deploy usa Prisma in modo
separato dalla build applicativa. I dati storici con stati terminali restano
compatibili con i nuovi vincoli.

### 5.3 Cronologia Git sintetica

La cronologia completa resta in Git; qui sono riportati gli incrementi che
ricostruiscono il percorso della CR:

| Commit su `main` | Incremento |
| --- | --- |
| `8173151`, `c9695e5` | Convenzioni di lavoro e CI. |
| `7469969`, `92ee17d`, `ff50938`, `026eb5d`, `4de697b`, `6f59dc4` | Setup test, analisi e prove pre-modifica. |
| `b0e6138` | Fase 2 — dati e dominio, BIB-23–BIB-31. |
| `068e1be` | Fase 3 — API prenotazione sicure, BIB-32–BIB-39. |
| `01237b7` | Fase 4 — automazioni, notifiche e realtime, BIB-40–BIB-48. |
| `cb4b95c`, `ae26680`, `1c31817`, `9592aad`, `adc5e30` | Fase 5 — middleware, amministrazione, UI e statistiche. |
| `071d28a`, `bba0882`, `f4e8d82`, `e88977f` | Fase 6 — specifica, report post-modifica, regressione e verifica finale. |
| `daa090a` | Chiusura dei varchi CA-01 emersi durante la verifica finale. |
| `76ecb1e` | Hardening successivo all'audit API, dichiarato fuori dal perimetro funzionale CR-BF-01. |

Gli interventi di dipendenze, RLS e distribuzione delle migrazioni sono rimasti
in commit separati per non confondere l'evoluzione funzionale con hardening e
infrastruttura.

## 6. Criteri di accettazione ed evidenze

| Criterio | Risultato | Evidenza principale |
| --- | :---: | --- |
| CA-01 — Accesso | PASS | Helper di sessione/ownership, suite auth e 36/36 casi admin dopo BIB-68. |
| CA-02 — Concorrenza | PASS | Vincolo DB, transazioni `Serializable` e test concorrenti PostgreSQL ripetuti. |
| CA-03 — Lista d'attesa | PASS | Unicita' attiva, FIFO deterministico e flussi UI mappa/mobile. |
| CA-04 — Riassegnazione | PASS | Promozione su cancellazione/no-show/scadenza, lock e idempotenza. |
| CA-05 — Tracciabilita' | PASS | Log, notifiche, correlazione e realtime delle transizioni di coda. |
| CA-06 — Regressione | PASS | 20/20 casi invariati con esito identico alla baseline. |

La decisione e le prove dettagliate sono in
[verifica finale dei criteri](test/verifica-finale-criteri-accettazione.md).
Il documento conserva anche l'anomalia rilevata nella prima verifica di CA-01 e
la successiva correzione, senza riscrivere retroattivamente l'evidenza.

## 7. Strategia ed esiti di test

### 7.1 Deliverable

| Documento | Ruolo nel processo |
| --- | --- |
| [Specifica pre-modifica](test/spec-pre-modifica.md) | Definisce gli scenari originali e gli ID stabili. |
| [Report pre-modifica](test/report-pre-modifica.md) | Registra l'esecuzione sulla baseline. |
| [Specifica post-modifica](test/spec-post-modifica.md) | Classifica casi aggiunti, modificati, invariati ed eliminati. |
| [Report parti modificate](test/report-post-modifica.md) | Verifica funzionalita' nuove e cambiate. |
| [Report regressione](test/report-regressione.md) | Confronta i 20 casi invariati con la baseline. |
| [Verifica finale](test/verifica-finale-criteri-accettazione.md) | Decide CA-01–CA-06 sulla versione integrata. |

### 7.2 Risultati consolidati

- La specifica post-modifica registra 181 casi aggiunti, 14 modificati, 20
  invariati e nessun caso eliminato alla prima esecuzione di Fase 6.
- Il report delle parti modificate ha prodotto 179 pass e 2 target di sicurezza
  inizialmente attesi come fallimenti.
- BIB-68 ha corretto i tre percorsi admin coinvolti; la suite finale ha prodotto
  **187 test passati e 0 expected fail**.
- Il report di regressione ha prodotto **20/20 PASS**, senza differenze rispetto
  alla baseline per i casi invariati.
- La verifica focalizzata di concorrenza ha ripetuto cinque volte i due scenari
  PostgreSQL, per un totale di **10/10 PASS**.
- L'insieme focalizzato su CA-03, CA-04 e CA-05 ha prodotto **113/113 PASS**.

Le differenze su intervalli invertiti, ricomposizione `Date`/`Time`, check-in e
payload utente sono correzioni volute e risultano classificate come casi
modificati, non come regressioni.

## 8. Anomalie e limiti osservati

1. La prima verifica finale aveva rilevato tre varchi amministrativi relativi a
   401/403. Sono stati documentati prima della correzione e chiusi da BIB-68.
2. Una singola esecuzione esplorativa della suite ha mostrato un errore non
   riproducibile dopo ricreazione del database; dieci esecuzioni complete
   consecutive e cinque esecuzioni della concorrenza sono risultate verdi.
3. La baseline PWA dichiarava due screenshot assenti e proteggeva alcuni asset
   prima del login. Il confronto Git dimostra che si tratta di limiti storici,
   non di regressioni della CR.
4. I test di caratterizzazione pre-modifica sono intenzionalmente separati dalla
   suite corrente: eseguirli indiscriminatamente sul codice TO-BE confonderebbe
   differenze volute e regressioni.
5. I diagrammi TO-BE sono ancora nella PR correlata #49 al commit finale qui
   analizzato; il merge e' necessario affinche' i collegamenti relativi TO-BE
   diventino parte di `main`.

## 9. Valutazione finale

CR-BF-01 soddisfa i sei criteri di accettazione sulla versione verificata. La
soluzione non affida la correttezza a un singolo livello: sessione e ownership
proteggono l'accesso, il dominio centralizza le regole, le transazioni coordinano
le scritture e il database garantisce l'assenza di sovrapposizioni anche nel
caso limite. La lista d'attesa completa il flusso utente e i ripple effect sono
coperti da automazioni, amministrazione, notifiche, realtime, UI e statistiche.

Il processo lascia una catena di tracciabilita' completa:

```text
change request
  -> impact analysis AS-IS
  -> test pre-modifica
  -> incrementi di dati, dominio, API e consumatori indiretti
  -> test post-modifica e regressione
  -> criteri CA-01–CA-06
  -> diagrammi e report TO-BE
```

Il report e i documenti collegati rendono verificabili sia il risultato tecnico
sia il processo di manutenzione seguito per ottenerlo.
