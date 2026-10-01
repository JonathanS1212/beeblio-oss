#!/usr/bin/env python3
"""Small, dependency-free structural check for newly written Office files.

Usage: python3 verify.py output.docx [--source input.docx] [--render-dir /tmp/pages]
This is an original Beeblio checker; it does not repair files or judge visual quality.
"""

import argparse
import json
import re
import shutil
import subprocess
import sys
from pathlib import Path, PurePosixPath
from xml.etree import ElementTree as ET
from zipfile import BadZipFile, ZipFile

NS = {
    "w": "http://schemas.openxmlformats.org/wordprocessingml/2006/main",
    "a": "http://schemas.openxmlformats.org/drawingml/2006/main",
    "p": "http://schemas.openxmlformats.org/presentationml/2006/main",
    "x": "http://schemas.openxmlformats.org/spreadsheetml/2006/main",
}
REL_NS = "http://schemas.openxmlformats.org/package/2006/relationships"


def natural_key(name):
    return [int(part) if part.isdigit() else part for part in re.split(r"(\d+)", name)]


def inspect(path):
    result = {"file": str(path), "format": path.suffix.lower().lstrip("."), "errors": [], "warnings": [], "metrics": {}}
    if not path.is_file():
        result["errors"].append("File does not exist")
        return result
    if path.suffix.lower() not in (".docx", ".xlsx", ".pptx"):
        result["errors"].append("Expected DOCX, XLSX, or PPTX")
        return result
    try:
        with ZipFile(path) as package:
            bad = package.testzip()
            if bad:
                result["errors"].append(f"Corrupt ZIP member: {bad}")
                return result
            names = set(package.namelist())
            if "[Content_Types].xml" not in names or "_rels/.rels" not in names:
                result["errors"].append("Missing required OOXML package metadata")
            for name in names:
                if name.endswith(".xml") or name.endswith(".rels"):
                    try:
                        ET.fromstring(package.read(name))
                    except ET.ParseError as exc:
                        result["errors"].append(f"Invalid XML in {name}: {exc}")
            check_relationships(package, names, result)
            if path.suffix.lower() == ".docx":
                inspect_docx(package, names, result)
            elif path.suffix.lower() == ".xlsx":
                inspect_xlsx(package, names, result)
            else:
                inspect_pptx(package, names, result)
    except (BadZipFile, OSError) as exc:
        result["errors"].append(f"Cannot open package: {exc}")
    return result


def check_relationships(package, names, result):
    broken = []
    for rel_name in (n for n in names if n.endswith(".rels")):
        try:
            root = ET.fromstring(package.read(rel_name))
        except ET.ParseError:
            continue
        base = PurePosixPath(rel_name).parent.parent if rel_name != "_rels/.rels" else PurePosixPath(".")
        for rel in root.findall(f"{{{REL_NS}}}Relationship"):
            if rel.get("TargetMode") == "External":
                continue
            target = rel.get("Target", "").split("#", 1)[0].split("?", 1)[0].lstrip("/")
            parts = []
            for part in (str(base / target) if not rel.get("Target", "").startswith("/") else target).split("/"):
                if part == "..":
                    if parts:
                        parts.pop()
                elif part and part != ".":
                    parts.append(part)
            if "/".join(parts) not in names:
                broken.append(f"{rel_name}: {rel.get('Target')}")
    if broken:
        result["errors"].append(f"Broken internal relationships: {broken[:10]}")


def inspect_docx(package, names, result):
    if "word/document.xml" not in names:
        result["errors"].append("Missing word/document.xml")
        return
    root = ET.fromstring(package.read("word/document.xml"))
    paragraphs = root.findall(".//w:p", NS)
    tables = root.findall(".//w:tbl", NS)
    text = "".join(node.text or "" for node in root.findall(".//w:t", NS))
    result["metrics"].update(paragraphs=len(paragraphs), tables=len(tables), text_characters=len(text),
                             images=len([n for n in names if n.startswith("word/media/")]),
                             comments="word/comments.xml" in names,
                             tracked_changes=bool(root.findall(".//w:ins", NS) or root.findall(".//w:del", NS)),
                             footnotes="word/footnotes.xml" in names,
                             headers=len([n for n in names if re.fullmatch(r"word/header\d+\.xml", n)]),
                             hyperlinks=len(root.findall(".//w:hyperlink", NS)))
    if not text.strip():
        result["warnings"].append("No ordinary document text found; image-only content needs visual review")


def inspect_xlsx(package, names, result):
    if "xl/workbook.xml" not in names:
        result["errors"].append("Missing xl/workbook.xml")
        return
    workbook = ET.fromstring(package.read("xl/workbook.xml"))
    sheets = [node.get("name") for node in workbook.findall(".//x:sheet", NS)]
    sheet_files = sorted((n for n in names if re.fullmatch(r"xl/worksheets/sheet\d+\.xml", n)), key=natural_key)
    formulas = errors = cells = 0
    for name in sheet_files:
        root = ET.fromstring(package.read(name))
        for cell in root.findall(".//x:sheetData/x:row/x:c", NS):
            cells += 1
            formulas += cell.find("x:f", NS) is not None
            errors += cell.get("t") == "e"
    result["metrics"].update(sheets=sheets, worksheet_parts=len(sheet_files), cells=cells, formulas=formulas, error_cells=errors,
                             charts=len([n for n in names if re.fullmatch(r"xl/charts/chart\d+\.xml", n)]),
                             tables=len([n for n in names if re.fullmatch(r"xl/tables/table\d+\.xml", n)]),
                             macros="xl/vbaProject.bin" in names)
    if not sheets or not sheet_files:
        result["errors"].append("Workbook has no worksheets")
    if errors:
        result["errors"].append(f"Workbook contains {errors} cached error cell(s)")
    if formulas:
        result["warnings"].append("Formula syntax and cached results were not recalculated; verify key outputs independently")
    if "xl/vbaProject.bin" in names:
        result["warnings"].append("Workbook contains VBA; macro behavior was not checked")


def inspect_pptx(package, names, result):
    if "ppt/presentation.xml" not in names:
        result["errors"].append("Missing ppt/presentation.xml")
        return
    slides = sorted((n for n in names if re.fullmatch(r"ppt/slides/slide\d+\.xml", n)), key=natural_key)
    texts = []
    for name in slides:
        root = ET.fromstring(package.read(name))
        texts.append("".join(node.text or "" for node in root.findall(".//a:t", NS)))
    result["metrics"].update(slides=len(slides), text_characters=sum(map(len, texts)),
                             media=len([n for n in names if n.startswith("ppt/media/")]),
                             charts=len([n for n in names if re.fullmatch(r"ppt/charts/chart\d+\.xml", n)]),
                             notes=len([n for n in names if re.fullmatch(r"ppt/notesSlides/notesSlide\d+\.xml", n)]),
                             slides_without_text=[i + 1 for i, value in enumerate(texts) if not value.strip()])
    if not slides:
        result["errors"].append("Presentation has no slides")
    if result["metrics"]["slides_without_text"]:
        result["warnings"].append("Some slides have no extractable text; review them visually")


def render(path, directory, result):
    soffice = shutil.which("soffice") or shutil.which("libreoffice")
    if not soffice:
        result["warnings"].append("LibreOffice unavailable; visual rendering skipped")
        return
    directory.mkdir(parents=True, exist_ok=True)
    run = subprocess.run([soffice, "-env:UserInstallation=file:///tmp/beeblio-office-verify", "--headless", "--convert-to", "pdf", "--outdir", str(directory), str(path)], capture_output=True, text=True, timeout=90)
    pdf = directory / (path.stem + ".pdf")
    if run.returncode or not pdf.exists():
        result["warnings"].append(f"PDF render failed: {(run.stderr or run.stdout).strip()[:300]}")
        return
    result["rendered_pdf"] = str(pdf)
    pdftoppm = shutil.which("pdftoppm")
    if pdftoppm:
        run = subprocess.run([pdftoppm, "-f", "1", "-l", "30", "-scale-to", "1200", "-png", str(pdf), str(directory / path.stem)], capture_output=True, text=True, timeout=90)
        if run.returncode:
            result["warnings"].append("PDF rendered, but PNG previews failed")
        else:
            result["preview_images"] = len(list(directory.glob(path.stem + "-*.png")))
    result["warnings"].append("Rendered output needs human inspection for clipping, fonts, and layout")


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("file", type=Path)
    parser.add_argument("--source", type=Path, help="Original file for a preservation inventory")
    parser.add_argument("--render-dir", type=Path, help="Write a PDF and PNG previews for visual review")
    args = parser.parse_args()
    result = inspect(args.file)
    if args.source:
        source = inspect(args.source)
        result["source_metrics"] = source["metrics"]
        if source["errors"]:
            result["warnings"].append("Source package has structural errors; compare manually")
        if source["format"] != result["format"]:
            result["errors"].append("Source and output formats differ")
        if result["format"] == "xlsx" and set(source["metrics"].get("sheets", [])) - set(result["metrics"].get("sheets", [])):
            result["warnings"].append("One or more source worksheets are missing")
        if result["format"] == "pptx" and source["metrics"].get("slides", 0) > result["metrics"].get("slides", 0):
            result["warnings"].append("Output contains fewer slides than source")
        preserved = {
            "docx": ("images", "comments", "tracked_changes", "footnotes", "headers", "hyperlinks"),
            "xlsx": ("charts", "tables", "macros"),
            "pptx": ("media", "charts", "notes"),
        }
        for feature in preserved.get(result["format"], ()):
            before = source["metrics"].get(feature, 0)
            after = result["metrics"].get(feature, 0)
            if before and (not after or isinstance(before, int) and not isinstance(before, bool) and after < before):
                result["warnings"].append(f"Source {feature} decreased or disappeared ({before} → {after}); confirm this was requested")
    if args.render_dir and not result["errors"]:
        render(args.file, args.render_dir, result)
    result["ok"] = not result["errors"]
    print(json.dumps(result, indent=2))
    return 0 if result["ok"] else 1


if __name__ == "__main__":
    sys.exit(main())
