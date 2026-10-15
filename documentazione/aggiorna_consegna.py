"""Copia gli 8 PDF compilati nel pacchetto di consegna e ne rigenera il MANIFEST.

Da lanciare dopo aver ricompilato i documenti (latexmk in documentazione/),
per esempio dopo aver aggiunto il logo del laboratorio o aggiornato
un'immagine:

    cd documentazione && latexmk && python3 aggiorna_consegna.py
"""

import hashlib
import shutil
from pathlib import Path

QUI = Path(__file__).resolve().parent
PACCHETTO = QUI.parent / "deliverables" / "BiblioFlow-consegna-2026-10-15"

# Ordine e corrispondenza con le richieste delle linee guida del corso.
DOCUMENTI = [
    ("Report_Progetto", "1", "Descrizione del sistema di partenza: contesto, package, flussi e diagrammi"),
    ("Change_Requests", "1", "Le due change request (CR01, CR02)"),
    ("Impact_Analysis", "1", "Impact analysis: call graph, matrici di raggiungibilità, SIS, CIS, AIS, FPIS, DIS, precision e recall"),
    ("Master_Test_Plan", "2", "Strategie, livelli di test e criteri di accettazione"),
    ("Pre_Modification_Test_Document", "2a", "Specifica dei casi di test prima della modifica (category partition) ed esito sulla baseline"),
    ("Pre_Modification_Test_Incident_Report", "2a", "Incidenti emersi eseguendo la suite sulla baseline"),
    ("Post_Modification_Test_Execution", "2b, 2c", "Casi aggiunti, modificati, eliminati e invariati; esecuzione sulle parti modificate e regressione; copertura; E2E"),
    ("Report_Finale", "1", "Sintesi del percorso evolutivo e degli esiti"),
]


def sha256(percorso: Path) -> str:
    return hashlib.sha256(percorso.read_bytes()).hexdigest()


def main() -> None:
    cartella = PACCHETTO / "documenti"
    cartella.mkdir(parents=True, exist_ok=True)
    righe_doc, righe_hash = [], []
    for indice, (nome, richiesta, contenuto) in enumerate(DOCUMENTI, start=1):
        sorgente = QUI / "pdf" / f"{nome}.pdf"
        destinazione = cartella / f"{indice} - {nome}.pdf"
        shutil.copyfile(sorgente, destinazione)
        righe_doc.append(f"| {indice} | `{destinazione.name}` | {richiesta} | {contenuto} |")
        righe_hash.append(f"| `{destinazione.name}` | `{sha256(destinazione)}` |")

    manifest = "\n".join([
        "# Manifest della consegna",
        "",
        "Documenti compilati da `documentazione/*.tex` (stile in",
        "`documentazione/stile/biblioflow-ista.sty`). Il file è generato da",
        "`documentazione/aggiorna_consegna.py`: non modificarlo a mano.",
        "",
        "## Documenti",
        "",
        "Le richieste delle linee guida del corso sono: (1) report di analisi,",
        "progettazione e realizzazione con impact analysis; (2a) specifica ed",
        "esecuzione dei test prima della modifica; (2b) specifica dei test dopo la",
        "modifica, distinguendo casi aggiunti, eliminati, modificati e invariati;",
        "(2c) esecuzione dei test sulle parti modificate e di regressione.",
        "",
        "| N. | File in `documenti/` | Richiesta | Contenuto |",
        "| --- | --- | --- | --- |",
        *righe_doc,
        "| — | `02.Informazioni progetto ISTA - BiblioFlow.xlsx` | — | Foglio del corso (fogli `progetto` e `partecipanti`) |",
        "",
        "## SHA-256 dei PDF",
        "",
        "| File | SHA-256 |",
        "| --- | --- |",
        *righe_hash,
        "",
    ])
    (PACCHETTO / "MANIFEST.md").write_text(manifest, encoding="utf-8")


if __name__ == "__main__":
    main()
