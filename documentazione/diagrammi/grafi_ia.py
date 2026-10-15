"""Call graph AS-IS dell'impact analysis e matrici di raggiungibilita'.

Un solo elenco di archi per Change Request genera sia il diagramma Mermaid
(ia-crXX-as-is.mmd) sia la matrice LaTeX (../tabelle/raggiungibilita-crXX.tex):
figura e tabella non possono divergere.

Gli archi sono ricavati dal codice del baseline (tag baseline-pre-cr-bf-01):
import tra moduli, chiamate fetch delle pagine verso le route e passaggio
obbligato dal middleware per ogni richiesta /api.

Uso:  python3 grafi_ia.py
"""

from collections import deque
from pathlib import Path

QUI = Path(__file__).resolve().parent
TABELLE = QUI.parent / "tabelle"

# ---------------------------------------------------------------- CR01
CR01_NODI = [
    # (id, etichetta nel diagramma, etichetta breve per la matrice, livello)
    ("P_PREN", "prenota/page.tsx", "prenota/page", "ui"),
    ("P_LIST", "prenotazioni/page.tsx", "prenotazioni/page", "ui"),
    ("P_EST", "prenotazioni/[id]/estendi/page.tsx", "estendi/page", "ui"),
    ("QR", "components/qrcode-checkin.tsx", "qrcode-checkin", "ui"),
    ("MW", "middleware.ts", "middleware", "mw"),
    ("A_COLL", "api/prenotazioni", "api/prenotazioni", "api"),
    ("A_ITEM", "api/prenotazioni/[id]", "api/pren./[id]", "api"),
    ("A_CHECK", "api/prenotazioni/[id]/check-in", "api/.../check-in", "api"),
    ("A_EXT", "api/prenotazioni/[id]/estendi", "api/.../estendi", "api"),
    ("A_POSTO", "api/admin/posti/[id]", "api/admin/posti/[id]", "api"),
    ("A_RICH", "api/admin/richieste", "api/admin/richieste", "api"),
    ("A_SCAN", "api/admin/scanner/validate", "api/admin/scanner", "api"),
    ("AUTH", "lib/auth.ts", "lib/auth", "lib"),
    ("PRISMA", "lib/prisma.ts", "lib/prisma", "lib"),
    ("SCHEMA", "prisma/schema.prisma", "schema.prisma", "dati"),
]
API_CR01 = ["A_COLL", "A_ITEM", "A_CHECK", "A_EXT", "A_POSTO", "A_RICH", "A_SCAN"]
CR01_ARCHI = (
    [("P_PREN", "A_COLL"), ("P_LIST", "A_COLL"), ("P_LIST", "A_ITEM"),
     ("P_EST", "A_EXT"), ("QR", "A_CHECK")]
    + [("MW", a) for a in API_CR01]
    + [(a, "AUTH") for a in ("A_CHECK", "A_POSTO", "A_SCAN")]
    + [(a, "PRISMA") for a in API_CR01]
    + [("AUTH", "PRISMA"), ("PRISMA", "SCHEMA")]
)

# ---------------------------------------------------------------- CR02
CR02_NODI = [
    ("P_PREN", "prenota/page.tsx", "prenota/page", "ui"),
    ("MAPPA", "components/mappa-biblioteca.tsx", "mappa-biblioteca", "ui"),
    ("GRIGLIA", "components/mobile-posti-grid.tsx", "mobile-posti-grid", "ui"),
    ("P_ADMIN", "admin/page.tsx", "admin/page", "ui"),
    ("P_STAT", "admin/statistiche/page.tsx", "admin/statistiche", "ui"),
    ("USE_SSE", "hooks/use-sse.ts", "use-sse", "ui"),
    ("A_COLL", "api/prenotazioni", "api/prenotazioni", "api"),
    ("A_ITEM", "api/prenotazioni/[id]", "api/pren./[id]", "api"),
    ("A_ADMIN", "api/admin/prenotazioni", "api/admin/pren.", "api"),
    ("A_ANOM", "api/admin/anomalie", "api/admin/anomalie", "api"),
    ("A_SCAN", "api/admin/scanner/validate", "api/admin/scanner", "api"),
    ("A_STAT", "api/admin/statistiche", "api/admin/statist.", "api"),
    ("A_DISP", "api/disponibilita-giorni", "api/disp.-giorni", "api"),
    ("A_CRON", "api/cron/automations", "api/cron", "api"),
    ("A_SSE", "api/sse/posti", "api/sse/posti", "api"),
    ("AUTO", "lib/automation-service.ts", "automation-service", "lib"),
    ("RT", "lib/realtime-events.ts", "realtime-events", "lib"),
    ("SSE", "lib/sse-emitter.ts", "sse-emitter", "lib"),
    ("SCHEMA", "prisma/schema.prisma", "schema.prisma", "dati"),
]
CR02_ARCHI = [
    ("P_PREN", "MAPPA"), ("MAPPA", "GRIGLIA"), ("P_PREN", "A_COLL"), ("P_STAT", "A_STAT"),
    ("P_ADMIN", "SCHEMA"), ("USE_SSE", "A_SSE"), ("A_SSE", "SSE"),
    ("RT", "SSE"), ("RT", "SCHEMA"), ("A_CRON", "AUTO"), ("AUTO", "SCHEMA"),
] + [(a, "SCHEMA") for a in ("A_COLL", "A_ITEM", "A_ADMIN", "A_ANOM", "A_SCAN", "A_STAT", "A_DISP")]

# Livelli per la matrice cross-layer della CR02 (come nel documento di
# riferimento, che per la seconda CR ragiona per livelli e non per file).
CR02_LIVELLI = [
    ("UI prenotazione", ["P_PREN", "MAPPA", "GRIGLIA"]),
    ("UI staff", ["P_ADMIN", "P_STAT"]),
    ("Client realtime", ["USE_SSE"]),
    ("Route handler", ["A_COLL", "A_ITEM", "A_ADMIN", "A_ANOM", "A_SCAN", "A_STAT", "A_DISP"]),
    ("Cron", ["A_CRON"]),
    ("automation-service", ["AUTO"]),
    ("Canale SSE", ["A_SSE", "SSE", "RT"]),
    ("Schema dati", ["SCHEMA"]),
]

CLASSI = {
    "ui": "fill:#dbeafe,stroke:#2563eb,color:#172554",
    "mw": "fill:#ede9fe,stroke:#7c3aed,color:#2e1065",
    "api": "fill:#fef3c7,stroke:#d97706,color:#451a03",
    "lib": "fill:#dcfce7,stroke:#16a34a,color:#052e16",
    "dati": "fill:#f3f4f6,stroke:#6b7280,color:#111827",
}
GRUPPI = {"ui": "Pagine e componenti", "mw": None, "api": "Route handler",
          "lib": "Librerie di servizio", "dati": None}


def distanze(nodi, archi):
    adiacenti = {n[0]: [] for n in nodi}
    for a, b in archi:
        adiacenti[a].append(b)
    risultato = {}
    for sorgente in adiacenti:
        visti = {sorgente: 0}
        coda = deque([sorgente])
        while coda:
            corrente = coda.popleft()
            for vicino in adiacenti[corrente]:
                if vicino not in visti:
                    visti[vicino] = visti[corrente] + 1
                    coda.append(vicino)
        risultato[sorgente] = visti
    return risultato


def mermaid(nodi, archi, direzione="LR"):
    righe = [f"flowchart {direzione}"]
    for livello, titolo in GRUPPI.items():
        membri = [n for n in nodi if n[3] == livello]
        if not membri:
            continue
        if titolo:
            righe.append(f'    subgraph {livello.upper()}["{titolo}"]')
        for nid, etichetta, _, _ in membri:
            forma = f'[("{etichetta}")]' if livello == "dati" else f'["{etichetta}"]'
            righe.append(f"        {nid}{forma}" if titolo else f"    {nid}{forma}")
        if titolo:
            righe.append("    end")
    righe.append("")
    for a, b in archi:
        righe.append(f"    {a} --> {b}")
    righe.append("")
    for livello, stile in CLASSI.items():
        membri = [n[0] for n in nodi if n[3] == livello]
        if membri:
            righe.append(f"    classDef {livello} {stile}")
            righe.append(f"    class {','.join(membri)} {livello}")
    return "\n".join(righe) + "\n"


def cella(d):
    if d is None:
        return "--"
    tono = {0: 55, 1: 38, 2: 26, 3: 16}.get(d, 8)
    return f"\\cellcolor{{viola!{tono}}}{d}"


def matrice_file(nodi, archi, colonne_per_blocco, didascalia, etichetta):
    dist = distanze(nodi, archi)
    ids = [n[0] for n in nodi]
    brevi = {n[0]: n[2] for n in nodi}
    blocchi = [ids[i:i + colonne_per_blocco] for i in range(0, len(ids), colonne_per_blocco)]
    out = ["% Generato da diagrammi/grafi_ia.py: non modificare a mano.",
           "\\begin{table}[H]", "\\centering", "\\scriptsize",
           "\\setlength{\\tabcolsep}{3pt}"]
    for i, blocco in enumerate(blocchi):
        spec = "l" + "c" * len(blocco)
        out.append(f"\\begin{{tabular}}{{{spec}}}")
        out.append("\\toprule")
        intestazione = " & ".join(f"\\rotatebox{{90}}{{\\file{{{brevi[c]}}}}}" for c in blocco)
        out.append(f"\\tb{{Sorgente $\\backslash$ Destinazione}} & {intestazione} \\\\")
        out.append("\\midrule")
        for r in ids:
            valori = " & ".join(cella(dist[r].get(c)) for c in blocco)
            out.append(f"\\file{{{brevi[r]}}} & {valori} \\\\")
        out.append("\\bottomrule")
        out.append("\\end{tabular}")
        if i < len(blocchi) - 1:
            out.append("\\par\\vspace{0.8em}")
    out.append(f"\\caption{{{didascalia}}}\\label{{{etichetta}}}")
    out.append("\\end{table}")
    return "\n".join(out) + "\n"


def matrice_livelli(nodi, archi, livelli, didascalia, etichetta):
    dist = distanze(nodi, archi)
    def tra(sorg, dest):
        valori = [dist[a][b] for a in sorg for b in dest if b in dist[a]]
        return min(valori) if valori else None
    out = ["% Generato da diagrammi/grafi_ia.py: non modificare a mano.",
           "\\begin{table}[H]", "\\centering", "\\footnotesize",
           "\\setlength{\\tabcolsep}{3pt}",
           "\\begin{tabular}{l" + "c" * len(livelli) + "}", "\\toprule"]
    intestazione = " & ".join(f"\\rotatebox{{90}}{{{nome}}}" for nome, _ in livelli)
    out.append(f"\\tb{{Sorgente $\\backslash$ Destinazione}} & {intestazione} \\\\")
    out.append("\\midrule")
    for nome, membri in livelli:
        valori = " & ".join(cella(tra(membri, altri)) for _, altri in livelli)
        out.append(f"{nome} & {valori} \\\\")
    out += ["\\bottomrule", "\\end{tabular}",
            f"\\caption{{{didascalia}}}\\label{{{etichetta}}}", "\\end{table}"]
    return "\n".join(out) + "\n"


def main():
    TABELLE.mkdir(exist_ok=True)
    (QUI / "ia-cr01-as-is.mmd").write_text(mermaid(CR01_NODI, CR01_ARCHI))
    (QUI / "ia-cr02-as-is.mmd").write_text(mermaid(CR02_NODI, CR02_ARCHI))
    (TABELLE / "raggiungibilita-cr01.tex").write_text(matrice_file(
        CR01_NODI, CR01_ARCHI, 15,
        "Matrice di Raggiungibilità tra le componenti del sistema (CR01)",
        "tab:raggiungibilita-cr01"))
    (TABELLE / "raggiungibilita-cr02.tex").write_text(matrice_livelli(
        CR02_NODI, CR02_ARCHI, CR02_LIVELLI,
        "Matrice di Raggiungibilità Cross-Layer (CR02)",
        "tab:raggiungibilita-cr02"))


if __name__ == "__main__":
    main()
