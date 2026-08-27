# Come si contribuisce — Progetto CR-BF-01

Questo documento definisce **come lavoriamo** sul repository durante l'intervento di
manutenzione evolutiva **CR-BF-01** (corso di Ingegneria, Gestione ed Evoluzione del
Software — UniSA, A.A. 2025/2026).

Vale per tutti i membri del gruppo: **Mario Celzo**, **Renato Mancino**, **Alfonso**.

---

## 1. Baseline congelata

Lo stato del sistema **prima** di qualsiasi modifica della change request è marcato dal
tag Git:

| Tag | Commit | Data |
| --- | --- | --- |
| `baseline-pre-cr-bf-01` | `e0742bfca4c5b05a0223bbca71f9756af9f42596` | 21 gennaio 2026 |

- Il tag **non va mai spostato**: è il riferimento immutabile per l'impact analysis, per
  i test pre-modifica e per il confronto di regressione richiesti dal corso.
- Per ripartire dalla baseline in locale:
  ```bash
  git fetch --tags
  git checkout baseline-pre-cr-bf-01   # HEAD detached: solo lettura / confronto
  ```

---

## 2. Strategia dei branch

- Il branch `main` contiene **solo codice integrato tramite Pull Request**. Nessuno
  committa o pusha direttamente su `main`.
- Ogni unità di lavoro parte da un branch dedicato con il prefisso `cr-bf-01-` seguito
  dall'**area** funzionale:

  | Branch | Area | Riferimento sulla board |
  | --- | --- | --- |
  | `cr-bf-01-setup` | Infrastruttura, CI, documentazione di progetto | Fase 0 |
  | `cr-bf-01-core` | Schema dati, servizio di dominio, API prenotazione sicure | Fasi 2–3 |
  | `cr-bf-01-automazioni` | Automazioni, cron, notifiche, eventi SSE della coda | Fase 4 |
  | `cr-bf-01-admin-ui` | Area admin, UI mappa/mobile, statistiche | Fase 5 |

  Se serve un branch più fine si usa lo stesso prefisso in modo descrittivo, ad es.
  `cr-bf-01-core-lista-attesa`.

- **Si parte sempre da `main` aggiornato**:
  ```bash
  git checkout main
  git pull origin main
  git checkout -b cr-bf-01-<area>
  ```

- Il branch di un'altra persona **non si usa come base**: se serve il lavoro altrui,
  si aspetta che sia mergiato su `main` e si fa `git pull` / rebase da `main`.

---

## 3. Convenzione dei commit

Formato del subject:

```
tipo(area): descrizione breve in italiano + riferimento al criterio di accettazione
```

- **tipo**: uno tra
  `feat` (nuova funzionalità), `fix` (correzione di un difetto),
  `refactor` (modifica interna senza cambio di comportamento),
  `test` (aggiunta/modifica di test), `docs` (documentazione),
  `chore` (dipendenze, config, tooling), `ci` (pipeline).
- **area**: la stessa nomenclatura dei branch/board — es. `schema`, `prenotazioni`,
  `auth`, `coda`, `automazioni`, `notifiche`, `realtime`, `admin`, `ui`, `statistiche`,
  `test`, `middleware`.
- **riferimento al criterio di accettazione**: quando il commit contribuisce a un
  criterio, si cita l'ID tra parentesi finali: `(CA-01)` … `(CA-06)`.

Esempi validi:

```
feat(schema): entità ListaAttesa con vincolo unicità e indice FIFO (CA-03)
feat(prenotazioni): creazione atomica transazionale (CA-02)
fix(api): check-in rifiuta richieste in coda non promosse (CA-06)
test(api): concorrenza su creazione prenotazione (CA-02)
docs(analisi): diagramma stati Prenotazione AS-IS
```

Da **evitare** sempre:

- messaggi generici: `wip`, `fix`, `update`, `modifiche varie`, `aggiornamento`;
- commit che mescolano aree diverse: un commit = un cambiamento coerente e descrivibile
  in una riga;
- commit che rompono la build o i test già verdi (`npm run lint`, `npx tsc --noEmit`,
  `npm run build`, `npm test` prima di pushare).

Il corpo del commit (facoltativo) spiega il **perché** della modifica e l'eventuale
impatto indiretto sui componenti riverificati.

---

## 4. Pull Request

- Ogni PR ha **come base `main`** e un titolo che segue la stessa convenzione dei commit.
- La descrizione della PR elenca:
  - le card della board coperte;
  - i **criteri di accettazione** (CA-01…CA-06) toccati e come sono verificati;
  - i componenti a **impatto indiretto** riverificati (vedi nota di impact analysis);
  - le istruzioni per provarla in locale (comandi, eventuali migrazioni).
- La PR va **revisionata da almeno un altro membro** del gruppo prima del merge.
- Tutti i job della pipeline CI devono essere **verdi** prima del merge (vedi §5).
- Merge preferito: **squash & merge**, così la history di `main` resta una sequenza
  leggibile di cambiamenti coerenti.
- Dopo il merge si cancella il branch remoto.

---

## 5. Integrazione continua e protezione di `main`

- La pipeline GitHub Actions (`.github/workflows/ci.yml`) esegue su ogni PR verso `main`:
  `lint`, `typecheck`, `build`, `test`, `audit`.
- Il branch `main` è protetto: niente push diretti, PR obbligatoria, branch aggiornato
  rispetto a `main` prima del merge e — quando la CI è attiva — check di stato
  obbligatori sui cinque job.

---

## 6. Collegamento con la board Trello

Board: **BiblioFlow - CR-BF-01**.

- Una card passa in **Doing** quando si apre il branch corrispondente.
- Una card passa in **Done** quando la PR che la implementa è **mergiata** su `main`.
- L'etichetta della card (Mario / Renato / Alfonso / Tutti) indica il responsabile.
- Le card marcate come **bloccanti** vanno chiuse prima di iniziare quelle dipendenti
  (es. framework di test prima di qualsiasi card di test; PR delle fondamenta prima
  delle Fasi 4 e 5).

---

## 7. Definition of Done di una card

Una card è completata quando:

1. il codice/documento è su `main` tramite PR revisionata e mergiata;
2. la sezione **DONE QUANDO** della card è verificata con evidenza (output di comando,
   test verde, screenshot o link);
3. gli eventuali **criteri di accettazione** citati hanno almeno un test o una prova
   che li dimostra;
4. la documentazione collegata (README, diagrammi, spec di test) è aggiornata di
   conseguenza.
