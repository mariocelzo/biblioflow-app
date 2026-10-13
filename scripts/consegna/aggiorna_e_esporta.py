#!/usr/bin/env python3
"""Aggiorna sommario e campi con LibreOffice, salva DOCX finale ed esporta PDF.

Uso: python3 uno_finalize.py <out_dir> <raw.docx> [<raw.docx> ...]
Richiede soffice in ascolto su porta 2002.
"""
import os
import sys
import time

import uno
from com.sun.star.beans import PropertyValue


def prop(name, value):
    p = PropertyValue()
    p.Name, p.Value = name, value
    return p


out_dir = sys.argv[1]
local = uno.getComponentContext()
resolver = local.ServiceManager.createInstanceWithContext("com.sun.star.bridge.UnoUrlResolver", local)
for _ in range(60):
    try:
        ctx = resolver.resolve("uno:socket,host=localhost,port=2002;urp;StarOffice.ComponentContext")
        break
    except Exception:
        time.sleep(1)
desktop = ctx.ServiceManager.createInstanceWithContext("com.sun.star.frame.Desktop", ctx)

for raw in sys.argv[2:]:
    name = os.path.basename(raw).replace(".raw.docx", "")
    doc = desktop.loadComponentFromURL(uno.systemPathToFileUrl(os.path.abspath(raw)), "_blank", 0,
                                       (prop("Hidden", True),))
    # due passaggi: il primo inserisce le voci, il secondo corregge i numeri di pagina
    for _ in range(2):
        idx = doc.getDocumentIndexes()
        for i in range(idx.getCount()):
            idx.getByIndex(i).update()
        doc.getTextFields().refresh()
    docx_out = os.path.join(out_dir, name + ".docx")
    pdf_out = os.path.join(out_dir, name + ".pdf")
    doc.storeToURL(uno.systemPathToFileUrl(docx_out), (prop("FilterName", "MS Word 2007 XML"),))
    doc.storeToURL(uno.systemPathToFileUrl(pdf_out), (
        prop("FilterName", "writer_pdf_Export"),
        prop("FilterData", uno.Any("[]com.sun.star.beans.PropertyValue", tuple([
            prop("ExportBookmarks", True),
            prop("UseTaggedPDF", True),
        ]))),
    ))
    doc.close(True)
    print("ok", name)
