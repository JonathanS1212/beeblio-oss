---
name: pdf
description: "Work with PDF files on the local computer: extract text, tables, metadata, and page images; OCR scanned documents; merge, split, and reorganize pages; and produce PDF charts and analysis exports. Use for any task whose primary input or output is a PDF."
---

# PDF processing

Handle PDFs through `bash` on the local computer. Install any missing utilities locally.

## Reading and extraction

- **Poppler** for text (`pdftotext -layout`), metadata (`pdfinfo`), and page images (`pdftoppm -png -r 150`). Page images feed visual inspection and OCR.
- **Python PDF libraries** for tables and custom processing: `pdfplumber` for table extraction and layout-aware text, `PyMuPDF` (fitz) for fast programmatic page manipulation, and `pypdf` for split/merge/rotate/metadata operations. `pandas.read_pdf`-style workflows should go through pdfplumber instead of retyping rows.
- **Tesseract** (`tesseract page.png out`) for scanned or image-only documents; rasterize the needed pages with `pdftoppm` first. Note OCR quality limits in the reply when the source is degraded.

Prefer `pdftotext` for plain text questions; reach for pdfplumber only when structure (tables, columns, coordinates) matters. For long PDFs, extract page ranges rather than the whole file, and cite evidence by page number.

## Page operations

Merge, split, extract, and rotate with `pypdf` from a saved script under `/workspace/3-Analysis` — never paste multiline Python as a shell command. Inputs under `/workspace/2-Data` and `/workspace/1-References` are read-only; write results under `/workspace/2-Data/derived`, `/workspace/3-Analysis`, or `/workspace/4-Reports` and never overwrite the source PDF.

## Producing PDFs

- **Charts and figures**: a saved Matplotlib or Seaborn script written as PDF (or PNG/SVG) under `/workspace/3-Analysis`, following `data-visualization-styling`.
- **Documents**: author or reuse a Markdown source and export it through `convert_markdown_document` — it routes the visual editor's conversion pipeline (including Zotero-aware citations) and renders ```mermaid fences server-side, so it is more faithful than rebuilding a PDF by hand. For PDF output, export DOCX and convert it with local software when appropriate.
- **Office-to-PDF conversion**: LibreOffice (`soffice --headless --convert-to pdf`) is available for converting DOCX/PPTX/XLSX deliverables produced by the `docx`, `pptx`, or `xlsx` skills.

Confirm output files exist before reporting them delivered, and verify page counts (`pdfinfo`) after merge/split operations.


## Fill And Validate AcroForms

Visual review alone is not a correctness check for a fillable PDF. A page `/Widget` annotation can render a value from its appearance stream while the canonical `/AcroForm/Fields` tree is missing or contains a stale value.

1. Keep the result interactive by default; set `flatten=True` only when the user explicitly requests a completed, static form. Preserve the source PDF, and do not flatten a signed PDF without an explicit workflow decision.
2. Inspect both representations before filling: enumerate fields from `reader.get_fields()` and `/Widget` annotations from every page's `/Annots`, following `/Parent` and `/Kids`. If a widget and a canonical field have the same name but are distinct objects with no `/Parent` relationship, do not call `reattach_fields()` blindly: it can create a second top-level field with the same name. Report the ambiguity or produce a static result.
3. Recover genuinely orphaned widgets, fill all pages, and write the result with `pypdf`:

```python
from pypdf import PdfReader, PdfWriter
from pypdf.generic import NameObject

reader = PdfReader(input_pdf)
writer = PdfWriter()
writer.clone_document_from_reader(reader)

# Restores widgets that are missing from /AcroForm/Fields.
writer.reattach_fields()
fields = writer.get_fields() or {}
missing = set(expected_values) - set(fields)
if missing:
    raise ValueError(f"Form fields not found after repair: {sorted(missing)}")

values_to_write = dict(expected_values)
if flatten:
    # Paint every existing value before removing every widget.
    values_to_write = {
        name: field.get("/V", "/Off" if field.get("/FT") == "/Btn" else "")
        for name, field in fields.items()
    }
    values_to_write.update(expected_values)

writer.update_page_form_field_values(
    None, values_to_write, auto_regenerate=False, flatten=flatten
)

if flatten:
    # pypdf's flatten=True paints appearances but does not remove widgets.
    writer.remove_annotations(subtypes="/Widget")
    writer.root_object.pop(NameObject("/AcroForm"), None)

with open(output_pdf, "wb") as stream:
    writer.write(stream)
```

4. Reopen the written PDF before delivery. For an interactive result, require every expected field to be present in `get_fields()` with the expected `/V`, enumerate page widgets again, and confirm their effective `/V` (the widget value or inherited `/Parent` value) agrees. Confirm each updated widget has a non-empty `/AP` `/N` appearance and render the final pages to catch stale or clipped appearances. Do not rely on `/NeedAppearances` or a successful PNG render as proof that logical field data was updated.
5. For a flattened result, require zero `/Widget` annotations and no remaining `/AcroForm` field tree after reopening, then render the final pages. Keep an editable copy when the user may need to revise the form.

## Quality Expectations

- Maintain polished visual design: consistent typography, spacing, margins, and section hierarchy.
- Avoid rendering issues: clipped text, overlapping elements, broken tables, black squares, or unreadable glyphs.
- Charts, tables, and images must be sharp, aligned, and clearly labeled.
- Use ASCII hyphens only. Avoid U+2011 and other Unicode dashes.
- Citations and references must be human-readable; never leave tool tokens or placeholder strings.

## Final Checks

- Do not deliver until the latest PNG inspection shows zero visual or formatting defects.
- Confirm headers, footers, page numbering, and section transitions look polished.
- Keep intermediate files organized or remove them after final approval.

## Final response

### Final response file references

- For a created or edited PDF, mention each final file once using its backticked workspace path, such as `/workspace/Reports/report.pdf`. Beeblio renders this path as a file chip the user can open. Summarize the result briefly.
- For a read-only answer, inspect the relevant pages and identify the source PDF with its backticked workspace path. Include page numbers in ordinary prose when they help locate evidence.
- Never reference rendered PNGs, scratch files, builders, or QA intermediates unless asked. Do not emit Codex-specific citation directives.
