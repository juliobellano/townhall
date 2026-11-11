#!/usr/bin/env python3
"""Text report (v1).

Files a report written as plain text: takes a title and the body text and returns
a PDF with a deterministic filing id. Reads no company data and calls nothing.

Town Hall tool contract:
  python v1.py --schema   -> prints this tool's input JSON Schema
  python v1.py            -> reads JSON inputs on stdin, writes a JSON result on stdout
Failures print {"error": "..."} on stdout and exit with a non-zero status.
Returns the PDF in the reserved "_files" key (name, mime_type, base64).
"""
import base64
import hashlib
import json
import sys
import textwrap

SCHEMA = {
    "type": "object",
    "properties": {
        "title": {"type": "string", "maxLength": 120, "description": "Report title"},
        "text": {"type": "string", "maxLength": 20000, "description": "Report body as plain text. Blank lines separate paragraphs."},
        "author": {"type": "string", "maxLength": 80, "description": "Name printed under the title", "default": ""},
    },
    "required": ["title", "text"],
    "additionalProperties": False,
}

LINE_CHARS = 90
LINES_PER_PAGE = 52


def esc(s):
    s = s.encode("latin-1", "replace").decode("latin-1")
    return s.replace("\\", "\\\\").replace("(", "\\(").replace(")", "\\)")


def wrap(text):
    out = []
    for para in text.replace("\r\n", "\n").split("\n"):
        out.extend(textwrap.wrap(para, LINE_CHARS, replace_whitespace=False) or [""])
    return out


def build_pdf(title, author, filing_id, body_lines):
    pages = []
    first = LINES_PER_PAGE - 6
    pages.append(body_lines[:first])
    rest = body_lines[first:]
    while rest:
        pages.append(rest[:LINES_PER_PAGE])
        rest = rest[LINES_PER_PAGE:]
    objs = [None, None]  # catalog, pages: filled below
    kids = []
    fonts = "<< /Font << /F1 3 0 R /F2 4 0 R >> >>"
    objs += [b"<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
             b"<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>"]
    for n, lines in enumerate(pages):
        ops, y = [], 800
        if n == 0:
            ops.append(f"BT /F2 20 Tf 56 {y} Td ({esc(title)}) Tj ET")
            y -= 20
            sub = f"Filing id: {filing_id}" + (f"   Author: {author}" if author else "")
            ops.append(f"BT /F1 10 Tf 56 {y} Td ({esc(sub)}) Tj ET")
            y -= 12
            ops.append(f"0.5 w 56 {y} m 539 {y} l S")
            y -= 20
        for line in lines:
            ops.append(f"BT /F1 11 Tf 56 {y} Td ({esc(line)}) Tj ET")
            y -= 14
        ops.append(f"BT /F1 8 Tf 56 40 Td ({esc(filing_id)}  page {n + 1} of {len(pages)}) Tj ET")
        content = "\n".join(ops).encode("latin-1")
        cid = len(objs) + 2
        objs.append(f"<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Contents {cid} 0 R /Resources {fonts} >>".encode())
        objs.append(b"<< /Length " + str(len(content)).encode() + b" >>\nstream\n" + content + b"\nendstream")
        kids.append(f"{len(objs) - 1} 0 R")
    objs[0] = b"<< /Type /Catalog /Pages 2 0 R >>"
    objs[1] = f"<< /Type /Pages /Kids [{' '.join(kids)}] /Count {len(kids)} >>".encode()
    out = bytearray(b"%PDF-1.4\n")
    offs = []
    for i, body in enumerate(objs, 1):
        offs.append(len(out))
        out += f"{i} 0 obj\n".encode() + body + b"\nendobj\n"
    xref = len(out)
    out += f"xref\n0 {len(objs) + 1}\n".encode() + b"0000000000 65535 f \n"
    for o in offs:
        out += f"{o:010d} 00000 n \n".encode()
    out += f"trailer\n<< /Size {len(objs) + 1} /Root 1 0 R >>\nstartxref\n{xref}\n%%EOF\n".encode()
    return bytes(out), len(pages)


def fail(message):
    print(json.dumps({"error": message}))
    sys.exit(2)


def main():
    if "--schema" in sys.argv:
        print(json.dumps(SCHEMA, sort_keys=True))
        return
    try:
        inputs = json.load(sys.stdin)
    except json.JSONDecodeError:
        fail("inputs must be valid JSON")
    title, text, author = inputs.get("title"), inputs.get("text"), inputs.get("author") or ""
    if not isinstance(title, str) or not title.strip():
        fail("title must be a non-empty string")
    if not isinstance(text, str) or not text.strip():
        fail("text must be a non-empty string")
    if len(text) > 20000 or len(title) > 120 or len(str(author)) > 80:
        fail("title, text or author is too long")
    filing_id = "RPT-" + hashlib.sha256(json.dumps([title, text, author]).encode()).hexdigest()[:8].upper()
    pdf, pages = build_pdf(title.strip(), str(author).strip(), filing_id, wrap(text.strip()))
    print(json.dumps({
        "title": title.strip(), "filing_id": filing_id, "pages": pages, "status": "filed",
        "_files": [{"name": f"{filing_id}.pdf", "mime_type": "application/pdf", "base64": base64.b64encode(pdf).decode("ascii")}],
    }, sort_keys=True))


if __name__ == "__main__":
    main()
