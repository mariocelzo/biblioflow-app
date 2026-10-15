# Pacchetto di consegna BiblioFlow

Data di preparazione: 15 ottobre 2026.

Insegnamento: Ingegneria del Software: Tecniche Avanzate, Laurea Magistrale in
Informatica, Università degli Studi di Salerno, A.A. 2025-2026.

Gruppo: Mario Celzo (NF22500193), Renato Mancino (NF22500242), Alfonso Maria
Ferrara (NF22500210).

## Contenuto

- `documenti/`: gli otto documenti di progetto in PDF, nella stessa struttura
  del pacchetto di riferimento (Report di Progetto, Change Requests, Impact
  Analysis, Master Test Plan, Pre-Modification Test Document, Test Incident
  Report, Post-Modification Test Document, Report Finale). La corrispondenza
  con le richieste delle linee guida e le impronte SHA-256 sono in
  `MANIFEST.md`.
- `02.Informazioni progetto ISTA - BiblioFlow.xlsx`: foglio del corso compilato.

I sorgenti LaTeX, i diagrammi e il registro delle modifiche sono nella cartella
`documentazione/` della repository.

## Come aggiornare i PDF

```bash
cd documentazione
latexmk                      # compila gli otto documenti in documentazione/pdf/
python3 aggiorna_consegna.py # copia i PDF qui e rigenera MANIFEST.md
```

Il logo dell'università è in `documentazione/immagini/loghi/logo-unisa.png`.
Per aggiungere il logo del laboratorio basta copiare `logo-sesa.png` (o `.pdf`)
nella stessa cartella e ricompilare: comparirà in fondo alla copertina.

## Verifica del codice consegnato

Suite automatica: 123 file, 1013 test superati (unità, componenti,
integrazione su PostgreSQL 16, vincoli del database); suite E2E Playwright:
12 scenari su 12; copertura del codice server 95,2% delle istruzioni e 89,4%
dei rami. I dettagli sono nel Post-Modification Test Document.
