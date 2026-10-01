# Beeblio Word documents

Use for `.docx` creation, reading, and editing. Work in the linked project folder. Keep the original and save a versioned output unless the user explicitly asks to replace it. Use paths available in the project sandbox; the application checkout and `scripts/office/verify.py` might not be mounted there. Never assume `/opt/beeblio-skills` exists.

## Route

1. **Read or summarize:** call `read_office` for content. It does not reveal exact page layout, comments, tracked changes, or all fields. For those, inspect the DOCX ZIP/XML or a rendered copy.
2. **Create from content:** write and review an editable Markdown source in the project. Use `convert_markdown_document` for standard or Zotero-aware DOCX. Check that citation keys resolve and that tables, images, headings, and links survived export.
3. **Create a designed document:** use the local `docx` Node package only if installed, or `python-docx` if installed in the project shell. Build named paragraph styles, page margins, headers, footers, and real tables. Keep the generating script beside the deliverable. If neither is available, use the Markdown exporter rather than inventing a dependency.
4. **Edit an existing document:** inspect paragraphs, tables, styles, sections, headers, footers, hyperlinks, images, comments, fields, and revision markers before choosing an editor. For routine content or style changes, make a copy with `python-docx` when available. Replace the smallest possible span. Check the output against the original. If the file has tracked changes, comments, content controls, complex fields, or embedded objects and the edit library cannot preserve them, explain the specific risk and use a safer route such as a proposed patch or a new document.

## Editing and preservation

- Do not rebuild an existing DOCX from extracted text: that loses structure and formatting.
- `python-docx` is suitable for many paragraphs, styles, tables, headers, and sections. It does not provide a complete editing API for revisions, comments, fields, or every drawing. Test preservation on a copy before delivery.
- Keep semantic headings rather than manually styled body paragraphs. Preserve table header rows and alt text where possible.
- For citations, retain existing citation tokens or fields unless the user explicitly asks to change citation style.

## Verification

Reopen the saved file. Compare requested text, headings, table counts, links, and images with the source and the task. Call `verify_office` on the output, with `sourceFilePath` for an edit. If the application checkout is accessible, `python3 scripts/office/verify.py OUTPUT.docx --render-dir PREVIEW_DIR` can also produce page previews. Inspect every rendered page for clipping, blank pages, bad line breaks, and font substitution. If no renderer is available, report what was not visually checked. Structural success alone does not prove layout quality.
