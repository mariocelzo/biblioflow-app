#!/usr/bin/env python3
"""Genera i documenti di consegna CR-BF-01 (DOCX + PDF) dai Markdown in docs/.

Uso, dalla radice del repository:

    python3 scripts/consegna/genera_documenti.py <cartella_output> <commit_verificato>

Prerequisiti: pandoc 3, LibreOffice (soffice con il modulo Python "uno"),
python-docx e Mermaid CLI (npx @mermaid-js/mermaid-cli). Vedi README.md.
"""
import copy
import os
import re
import glob
import shutil
import subprocess
import sys
import tempfile
import time

from docx import Document
from docx.enum.section import WD_SECTION
from docx.enum.text import WD_ALIGN_PARAGRAPH
from docx.oxml import OxmlElement
from docx.oxml.ns import qn
from docx.shared import Pt, RGBColor, Cm

HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.abspath(os.path.join(HERE, "..", ".."))
OUT = os.path.abspath(sys.argv[1])
COMMIT = sys.argv[2]
BUILD = tempfile.mkdtemp(prefix="consegna-")
IMG = os.path.join(BUILD, "img")
os.makedirs(OUT, exist_ok=True)
os.makedirs(IMG, exist_ok=True)

GRUPPO = [
    "Mario Celzo — NF22500193",
    "Renato Mancino — NF22500242",
    "Alfonso Maria Ferrara — NF22500210",
]
DATA = "13 ottobre 2026"
ACCENT = RGBColor(0x1F, 0x3A, 0x68)

DOCS = [
    {
        "file": "01 - Report finale CR-BF-01",
        "title": "Report di analisi, progettazione e realizzazione",
        "parts": [("main", "docs/report-finale.md")],
        "appendices": [
            ("Appendice A — Analisi AS-IS e impact analysis", [
                "docs/diagrammi/prenotazione-componenti-as-is.md",
                "docs/diagrammi/prenotazione-stati-as-is.md",
                "docs/analisi/matrice-ruoli-operazioni-as-is.md",
            ]),
            ("Appendice B — Progettazione TO-BE", [
                "docs/diagrammi/prenotazione-componenti-to-be.md",
                "docs/diagrammi/prenotazione-stati-to-be.md",
                "docs/diagrammi/confronto-prenotazioni-as-is-to-be.md",
            ]),
            ("Appendice C — Verifica finale dei criteri di accettazione", [
                "docs/test/verifica-finale-criteri-accettazione.md",
            ]),
        ],
    },
    {
        "file": "02 - Specifica dei casi di test pre-modifica",
        "title": "Specifica dei casi di test pre-modifica",
        "parts": [("main", "docs/test/spec-pre-modifica.md")],
    },
    {
        "file": "03 - Report di esecuzione dei test pre-modifica",
        "title": "Report di esecuzione dei test pre-modifica",
        "parts": [("main", "docs/test/report-pre-modifica.md")],
    },
    {
        "file": "04 - Specifica dei casi di test post-modifica",
        "title": "Specifica dei casi di test post-modifica",
        "subtitle": "Casi aggiunti, modificati, invariati ed eliminati",
        "parts": [("main", "docs/test/spec-post-modifica.md")],
    },
    {
        "file": "05 - Report dei test sulle parti modificate",
        "title": "Report di esecuzione dei test sulle parti aggiunte e modificate",
        "parts": [("main", "docs/test/report-post-modifica.md")],
    },
    {
        "file": "06 - Report dei test di regressione",
        "title": "Report di esecuzione dei test di regressione",
        "subtitle": "Casi di test sulle parti non modificate",
        "parts": [("main", "docs/test/report-regressione.md")],
    },
]

FENCE = re.compile(r"^(```|~~~)")


def split_code(text):
    """Restituisce segmenti (is_code, testo) per non toccare i blocchi di codice."""
    out, buf, in_code = [], [], False
    for line in text.splitlines(keepends=True):
        if FENCE.match(line):
            if not in_code:
                out.append((False, "".join(buf)))
                buf, in_code = [line], True
            else:
                buf.append(line)
                out.append((True, "".join(buf)))
                buf, in_code = [], False
        else:
            buf.append(line)
    out.append((in_code, "".join(buf)))
    return out


GRAVE = {"a": "à", "e": "è", "i": "ì", "o": "ò", "u": "ù",
         "A": "À", "E": "È", "I": "Ì", "O": "Ò", "U": "Ù"}
ACCENTO = re.compile(r"(?<![A-Za-z])([A-Za-z]*?)([aeiouAEIOU])'(?![A-Za-z])")


def accenti(line):
    """I sorgenti scrivono gli accenti finali con l'apostrofo (ASCII): nel
    documento impaginato diventano lettere accentate. Il codice inline resta
    invariato."""

    def fix(m):
        stem, vowel = m.group(1), m.group(2)
        if vowel in "eE" and (stem.lower().endswith("ch") or stem.lower() in ("n", "s")):
            return stem + ("é" if vowel == "e" else "É")
        return stem + GRAVE[vowel]

    parts = re.split(r"(`[^`]*`)", line)
    return "".join(p if p.startswith("`") else ACCENTO.sub(fix, p) for p in parts)


def transform(path, shift, drop_first_h1):
    text = open(os.path.join(REPO, path), encoding="utf-8").read()
    stem = os.path.splitext(os.path.basename(path))[0]
    fig = 0
    dropped = not drop_first_h1
    result = []
    for is_code, seg in split_code(text):
        if is_code:
            if seg.startswith("```mermaid"):
                fig += 1
                png = os.path.join(IMG, f"{stem}-{fig}.png")
                if not os.path.exists(png):
                    raise SystemExit(f"Immagine mancante: {png}")
                result.append(f"\n![]({png}){{width=16cm}}\n\n")
            else:
                result.append(seg)
            continue
        lines = []
        for line in seg.splitlines(keepends=True):
            m = re.match(r"^(#{1,6})\s+(.*)$", line)
            if m:
                level = len(m.group(1))
                if level == 1 and not dropped:
                    dropped = True
                    continue
                level = max(1, min(6, level + shift))
                line = "#" * level + " " + m.group(2).rstrip() + "\n"
            # link relativi a file del repository: resta il solo testo
            line = re.sub(r"\[([^\]]+)\]\((?!https?://|#)[^)]*\)", r"\1", line)
            line = accenti(line)
            lines.append(line)
        result.append("".join(lines))
    return "".join(result)


def cover_md(doc):
    sub = doc.get("subtitle", "")
    members = "\n".join(f"::: {{custom-style=\"Cover Member\"}}\n{m}\n:::\n" for m in GRUPPO)
    return f"""::: {{custom-style="Cover Kicker"}}
BiblioFlow — Change request CR-BF-01
:::

::: {{custom-style="Title"}}
{doc['title']}
:::

{f'::: {{custom-style="Subtitle"}}{chr(10)}{sub}{chr(10)}:::' if sub else ''}

::: {{custom-style="Cover Meta"}}
Ingegneria, Gestione ed Evoluzione del Software — A.A. 2025/2026
:::

::: {{custom-style="Cover Label"}}
Gruppo
:::

{members}

::: {{custom-style="Cover Meta"}}
Repository: https://github.com/mariocelzo/biblioflow-app — codice verificato al commit `{COMMIT}`
:::

::: {{custom-style="Cover Meta"}}
Data: {DATA}
:::

```{{=openxml}}
<w:p><w:r><w:br w:type="page"/></w:r></w:p>
```

::: {{custom-style="TOC Heading"}}
Indice
:::

```{{=openxml}}
<w:p><w:r><w:fldChar w:fldCharType="begin" w:dirty="true"/></w:r><w:r><w:instrText xml:space="preserve"> TOC \\o "1-2" \\h \\z \\u </w:instrText></w:r><w:r><w:fldChar w:fldCharType="separate"/></w:r><w:r><w:t>Indice da aggiornare</w:t></w:r><w:r><w:fldChar w:fldCharType="end"/></w:r></w:p>
<w:p><w:r><w:br w:type="page"/></w:r></w:p>
```

"""


PAGE_BREAK = '\n```{=openxml}\n<w:p><w:r><w:br w:type="page"/></w:r></w:p>\n```\n\n'


def build_markdown(doc):
    parts = [cover_md(doc)]
    for _, path in doc["parts"]:
        raw = open(os.path.join(REPO, path), encoding="utf-8").read()
        h1 = sum(1 for is_code, s in split_code(raw) if not is_code
                 for l in s.splitlines() if re.match(r"^#\s", l))
        if h1 <= 1:
            parts.append(transform(path, shift=-1, drop_first_h1=True))
        else:
            parts.append(transform(path, shift=0, drop_first_h1=False))
    for title, files in doc.get("appendices", []):
        parts.append(PAGE_BREAK + f"# {title}\n\n")
        for f in files:
            parts.append(transform(f, shift=1, drop_first_h1=False) + "\n")
    return "\n".join(parts)


# ---------------------------------------------------------------- reference

def set_font(style, name, size=None, bold=None, color=None):
    style.font.name = name
    rpr = style.element.get_or_add_rPr()
    rfonts = rpr.find(qn("w:rFonts"))
    if rfonts is None:
        rfonts = OxmlElement("w:rFonts")
        rpr.append(rfonts)
    for a in ("w:ascii", "w:hAnsi", "w:cs", "w:eastAsia"):
        rfonts.set(qn(a), name)
    for a in ("w:asciiTheme", "w:hAnsiTheme", "w:cstheme", "w:eastAsiaTheme"):
        if rfonts.get(qn(a)) is not None:
            del rfonts.attrib[qn(a)]
    if size:
        style.font.size = Pt(size)
    if bold is not None:
        style.font.bold = bold
    if color is not None:
        style.font.color.rgb = color


def add_field(par, instr):
    for kind, val in (("begin", None), ("instr", instr), ("separate", None), ("text", "1"), ("end", None)):
        r = OxmlElement("w:r")
        if kind == "instr":
            t = OxmlElement("w:instrText")
            t.set(qn("xml:space"), "preserve")
            t.text = val
            r.append(t)
        elif kind == "text":
            t = OxmlElement("w:t")
            t.text = val
            r.append(t)
        else:
            fc = OxmlElement("w:fldChar")
            fc.set(qn("w:fldCharType"), kind)
            r.append(fc)
        par._p.append(r)


class StyleMap:
    """Accesso agli stili per nome visualizzato (pandoc usa 'Heading 1' maiuscolo)."""

    def __init__(self, styles):
        self.styles = styles

    def __iter__(self):
        return iter(self.styles)

    def __getitem__(self, name):
        for s in self.styles:
            if s.name == name:
                return s
        raise KeyError(name)

    def add_style(self, name, kind):
        for s in self.styles:
            if s.name == name:
                return s
        return self.styles.add_style(name, kind)


def make_reference(path):
    subprocess.run(["pandoc", "-o", path, "--print-default-data-file", "reference.docx"], check=True)
    d = Document(path)
    st = StyleMap(d.styles)
    for name in ("Normal", "Body Text", "First Paragraph", "Compact"):
        if name in [s.name for s in st]:
            set_font(st[name], "Calibri", 10.5)
    for s in ("Body Text", "First Paragraph"):
        pf = st[s].paragraph_format
        pf.space_after = Pt(6)
        pf.line_spacing = 1.12
    sizes = {1: 17, 2: 13.5, 3: 11.5, 4: 10.5, 5: 10.5, 6: 10.5}
    for lvl, sz in sizes.items():
        s = st[f"Heading {lvl}"]
        set_font(s, "Calibri", sz, True, ACCENT)
        s.font.italic = False
        s.paragraph_format.space_before = Pt(16 if lvl == 1 else 11)
        s.paragraph_format.space_after = Pt(6)
        s.paragraph_format.keep_with_next = True
    set_font(st["Title"], "Calibri", 28, True, ACCENT)
    st["Title"].paragraph_format.space_after = Pt(10)
    st["Title"].paragraph_format.alignment = WD_ALIGN_PARAGRAPH.LEFT
    st["Subtitle"].paragraph_format.alignment = WD_ALIGN_PARAGRAPH.LEFT
    set_font(st["Subtitle"], "Calibri", 15, False, RGBColor(0x44, 0x4F, 0x60))
    for nm, sz, b, col, before in (("Cover Kicker", 12, True, RGBColor(0x5A, 0x67, 0x7D), 150),
                                   ("Cover Meta", 10.5, False, RGBColor(0x33, 0x33, 0x33), 8),
                                   ("Cover Label", 10.5, True, ACCENT, 26),
                                   ("Cover Member", 11, False, RGBColor(0x22, 0x22, 0x22), 2),
                                   ("TOC Heading", 17, True, ACCENT, 0)):
        s = st.add_style(nm, 1)
        s.base_style = st["Normal"]
        set_font(s, "Calibri", sz, b, col)
        s.paragraph_format.space_before = Pt(before)
        s.paragraph_format.space_after = Pt(4)
    code = st.add_style("Source Code", 1)
    code.base_style = st["Normal"]
    set_font(code, "Consolas", 8.5)
    code.paragraph_format.space_after = Pt(0)
    code.paragraph_format.line_spacing = 1.0
    ppr = code.element.get_or_add_pPr()
    shd = OxmlElement("w:shd")
    shd.set(qn("w:val"), "clear")
    shd.set(qn("w:color"), "auto")
    shd.set(qn("w:fill"), "F3F5F8")
    ppr.append(shd)
    verb = st.add_style("Verbatim Char", 2)
    set_font(verb, "Consolas", 9)
    verb.font.color.rgb = RGBColor(0x8A, 0x1F, 0x3D)
    if "Hyperlink" in [s.name for s in st]:
        st["Hyperlink"].font.color.rgb = RGBColor(0x1F, 0x5F, 0xAD)
    sec = d.sections[0]
    sec.page_width, sec.page_height = Cm(21), Cm(29.7)
    sec.left_margin = sec.right_margin = Cm(2.2)
    sec.top_margin, sec.bottom_margin = Cm(2.2), Cm(2.0)
    sec.different_first_page_header_footer = True
    hp = sec.header.paragraphs[0]
    hp.text = "BiblioFlow — CR-BF-01"
    hp.alignment = WD_ALIGN_PARAGRAPH.RIGHT
    hp.runs[0].font.size = Pt(8.5)
    hp.runs[0].font.color.rgb = RGBColor(0x70, 0x70, 0x70)
    fp = sec.footer.paragraphs[0]
    fp.alignment = WD_ALIGN_PARAGRAPH.CENTER
    run = fp.add_run("Pagina ")
    run.font.size = Pt(8.5)
    add_field(fp, " PAGE ")
    d.save(path)


# ---------------------------------------------------------------- post-process

def shade(cell_el, fill):
    tcpr = cell_el.get_or_add_tcPr()
    sh = OxmlElement("w:shd")
    sh.set(qn("w:val"), "clear")
    sh.set(qn("w:color"), "auto")
    sh.set(qn("w:fill"), fill)
    tcpr.append(sh)


def postprocess(path):
    d = Document(path)
    for t in d.tables:
        tblpr = t._tbl.tblPr
        for tag in ("w:tblBorders", "w:tblW", "w:tblLayout"):
            for e in tblpr.findall(qn(tag)):
                tblpr.remove(e)
        w = OxmlElement("w:tblW")
        w.set(qn("w:w"), "5000")
        w.set(qn("w:type"), "pct")
        tblpr.append(w)
        borders = OxmlElement("w:tblBorders")
        for side in ("top", "left", "bottom", "right", "insideH", "insideV"):
            b = OxmlElement(f"w:{side}")
            b.set(qn("w:val"), "single")
            b.set(qn("w:sz"), "4")
            b.set(qn("w:color"), "B8C2D0")
            borders.append(b)
        tblpr.append(borders)
        for ri, row in enumerate(t.rows):
            if ri == 0:
                trpr = row._tr.get_or_add_trPr()
                th = OxmlElement("w:tblHeader")
                trpr.append(th)
            for cell in row.cells:
                if ri == 0:
                    shade(cell._tc, "E3E9F2")
                for p in cell.paragraphs:
                    p.paragraph_format.space_after = Pt(1)
                    p.paragraph_format.space_before = Pt(1)
                    for r in p.runs:
                        r.font.size = Pt(8.5)
                        if ri == 0:
                            r.font.bold = True
    # immagini centrate
    for p in d.paragraphs:
        if p._p.findall(".//" + qn("w:drawing")):
            p.alignment = WD_ALIGN_PARAGRAPH.CENTER
    d.save(path)


UNO_SCRIPT = os.path.join(HERE, "aggiorna_e_esporta.py")


def render_diagrams():
    """Estrae i blocchi mermaid da docs/diagrammi e li rende in PNG."""
    mmdc = os.environ.get("MMDC", "npx -y @mermaid-js/mermaid-cli").split()
    extra = ["-p", os.environ["PUPPETEER_CONFIG"]] if os.environ.get("PUPPETEER_CONFIG") else []
    for f in sorted(glob.glob(os.path.join(REPO, "docs", "**", "*.md"), recursive=True)):
        stem = os.path.splitext(os.path.basename(f))[0]
        for i, seg in enumerate([s for c, s in split_code(open(f, encoding="utf-8").read())
                                 if c and s.startswith("```mermaid")]):
            body = "".join(accenti(l) for l in seg.splitlines(keepends=True)[1:-1])
            src = os.path.join(IMG, f"{stem}-{i + 1}.mmd")
            open(src, "w", encoding="utf-8").write(body)
            subprocess.run(mmdc + extra + ["-i", src, "-o", src[:-4] + ".png", "-s", "2.5", "-b", "white"],
                           check=True)


def main():
    render_diagrams()
    ref = os.path.join(BUILD, "reference.docx")
    make_reference(ref)
    raws = []
    for doc in DOCS:
        md = build_markdown(doc)
        md_path = os.path.join(BUILD, doc["file"] + ".md")
        open(md_path, "w", encoding="utf-8").write(md)
        raw_docx = os.path.join(BUILD, doc["file"] + ".raw.docx")
        subprocess.run([
            "pandoc", md_path, "-f", "markdown+pipe_tables+raw_attribute+fenced_divs-implicit_figures",
            "-t", "docx", "--reference-doc", ref, "-o", raw_docx,
            "--metadata", "lang=it-IT",
        ], check=True)
        postprocess(raw_docx)
        raws.append(raw_docx)
    soffice = subprocess.Popen(["soffice", "--headless", "--invisible", "--norestore",
                                f"-env:UserInstallation=file://{BUILD}/lo-profile",
                                "--accept=socket,host=localhost,port=2002;urp;"])
    try:
        subprocess.run([sys.executable, UNO_SCRIPT, OUT] + raws, check=True)
    finally:
        soffice.terminate()
        time.sleep(1)
    shutil.rmtree(BUILD, ignore_errors=True)


if __name__ == "__main__":
    main()
