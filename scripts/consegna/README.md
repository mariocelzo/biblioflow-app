# Generazione dei documenti di consegna

`genera_documenti.py` produce i sei documenti richiesti dalle linee guida del
corso, in PDF e in Word, a partire dai sorgenti Markdown di `docs/`. I sorgenti
restano l'unica fonte: dopo una correzione in `docs/` basta rigenerare.

## Cosa fa

1. rende in PNG i diagrammi Mermaid di `docs/` con Mermaid CLI;
2. compone ogni documento con copertina (gruppo, corso, commit verificato),
   indice, testo e, per il report finale, le Appendici A (AS-IS), B (TO-BE) e C
   (verifica dei criteri);
3. converte con pandoc in Word applicando uno stile uniforme (Calibri, tabelle
   con intestazione ripetuta, numeri di pagina);
4. aggiorna l'indice ed esporta il PDF con LibreOffice.

Nel testo impaginato gli accenti scritti con l'apostrofo nei sorgenti
(`identita'`, `e'`, `perche'`) diventano lettere accentate; il codice inline
non viene toccato. I link relativi ai file del repository restano come testo.

## Prerequisiti

- Python 3 con `python-docx`;
- pandoc 3;
- LibreOffice, con il modulo Python `uno` (pacchetto `python3-uno` su Linux);
- Node.js, per `npx @mermaid-js/mermaid-cli`.

## Uso

Dalla radice del repository:

```bash
python3 scripts/consegna/genera_documenti.py \
  deliverables/BiblioFlow-CR-BF-01-consegna-2026-10-13/documenti \
  <commit-del-codice-verificato>
```

Variabili facoltative:

- `MMDC`: comando Mermaid CLI da usare al posto di `npx -y @mermaid-js/mermaid-cli`;
- `PUPPETEER_CONFIG`: file JSON di configurazione di Puppeteer, per esempio per
  indicare un Chromium gia' installato.

Dopo la rigenerazione vanno aggiornate le impronte SHA-256 in
`deliverables/.../MANIFEST.md`.
