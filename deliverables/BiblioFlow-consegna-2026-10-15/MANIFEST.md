# Manifest della consegna

Documenti compilati da `documentazione/*.tex` (stile in
`documentazione/stile/biblioflow-ista.sty`). Il file è generato da
`documentazione/aggiorna_consegna.py`: non modificarlo a mano.

## Documenti

Le richieste delle linee guida del corso sono: (1) report di analisi,
progettazione e realizzazione con impact analysis; (2a) specifica ed
esecuzione dei test prima della modifica; (2b) specifica dei test dopo la
modifica, distinguendo casi aggiunti, eliminati, modificati e invariati;
(2c) esecuzione dei test sulle parti modificate e di regressione.

| N. | File in `documenti/` | Richiesta | Contenuto |
| --- | --- | --- | --- |
| 1 | `1 - Report_Progetto.pdf` | 1 | Descrizione del sistema di partenza: contesto, package, flussi e diagrammi |
| 2 | `2 - Change_Requests.pdf` | 1 | Le due change request (CR01, CR02) |
| 3 | `3 - Impact_Analysis.pdf` | 1 | Impact analysis: call graph, matrici di raggiungibilità, SIS, CIS, AIS, FPIS, DIS, precision e recall |
| 4 | `4 - Master_Test_Plan.pdf` | 2 | Strategie, livelli di test e criteri di accettazione |
| 5 | `5 - Pre_Modification_Test_Document.pdf` | 2a | Specifica dei casi di test prima della modifica (category partition) ed esito sulla baseline |
| 6 | `6 - Pre_Modification_Test_Incident_Report.pdf` | 2a | Incidenti emersi eseguendo la suite sulla baseline |
| 7 | `7 - Post_Modification_Test_Execution.pdf` | 2b, 2c | Casi aggiunti, modificati, eliminati e invariati; esecuzione sulle parti modificate e regressione; copertura; E2E |
| 8 | `8 - Report_Finale.pdf` | 1 | Sintesi del percorso evolutivo e degli esiti |
| — | `02.Informazioni progetto ISTA - BiblioFlow.xlsx` | — | Foglio del corso (fogli `progetto` e `partecipanti`) |

## SHA-256 dei PDF

| File | SHA-256 |
| --- | --- |
| `1 - Report_Progetto.pdf` | `03217c1ebb52dc4e73cb0edf851f8f9cf1f43918eaf9528ee63298582d651ec2` |
| `2 - Change_Requests.pdf` | `1efbefc87b2c36db3c538da5a5fad159f330eb74b7acdd1a7ba113e3dd2bf3f9` |
| `3 - Impact_Analysis.pdf` | `062f9b86b195e50a5e8ddf504d2c2152d24e97df2a69d7e560967a8de024c6c4` |
| `4 - Master_Test_Plan.pdf` | `ada549b47503a438d2d544b865d6aa483051bd9eb18fbb761d08a80b0cdd24e2` |
| `5 - Pre_Modification_Test_Document.pdf` | `9a7b09050c4a3e2b485b5660b793de7c2686a68c7ce61a6ddf3246bb6c7f3369` |
| `6 - Pre_Modification_Test_Incident_Report.pdf` | `c5ec1c3ae22a13172430ee1cfb5a84ce1c00297c7ae8a5726e6ed82c4bb54038` |
| `7 - Post_Modification_Test_Execution.pdf` | `30d9634e0f7f964d168c713808680020eb1cd275746e3d7583b63f30f356c179` |
| `8 - Report_Finale.pdf` | `e758d79fb82e06953ca4c72b8dcd18aa8f072c37d53e27340073cefc43f7ecaa` |
