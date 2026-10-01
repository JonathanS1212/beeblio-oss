# Beeblio Office checks

`verify.py` is a local command-line checker for DOCX, XLSX, and PPTX. The deployed agent uses the matching `verify_office` tool, implemented in TypeScript so it does not depend on Python in production. Both report package integrity and a small preservation inventory. The command-line checker can additionally render a PDF and PNG previews with LibreOffice and Poppler.

Run the fixture suite with:

```sh
python3 scripts/office/evaluate.py
```

The suite creates a Word report with a table, a formula workbook, and a two-slide deck. It asserts that valid files pass, a broken DOCX and an Excel error cell fail, and removing a slide produces a preservation warning. These are structural checks. They do not prove formula correctness, visual quality, or fidelity to a complex source file.

For a new or edited user artifact, run `verify_office` and compare its metrics with the request. For visual review from a checkout with `soffice` installed:

```sh
python3 scripts/office/verify.py output.pptx --render-dir /tmp/beeblio-slide-preview
```

Open every produced preview image. For XLSX, calculate key formulas independently; the checker cannot evaluate them. For edits, provide `--source original.docx` (or the corresponding format) and review any decreased feature count. A warning identifies a possible loss, not necessarily a defect: a user may have asked to remove that content.

## Capability benchmark to grow

Use three cases per format when assessing a future skill change: creation, focused edit of an existing file, and a file with advanced features. Record whether the output opens, requested content is correct, unrelated content survives, and rendered pages or slides pass review. Useful advanced cases include Word comments and fields; Excel charts, validation, and macros; and PowerPoint notes, charts, and a supplied template. Keep benchmark files authored by Beeblio or licensed for redistribution.
