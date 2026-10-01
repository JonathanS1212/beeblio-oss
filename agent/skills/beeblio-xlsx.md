# Beeblio spreadsheets

Use for `.xlsx`, CSV, and TSV work. Preserve inputs and create versioned outputs. Work in the linked project folder. Use installed tools only; do not assume `/opt/beeblio-skills` exists. The shared verifier is `scripts/office/verify.py` in the application checkout when accessible.

## Route

1. **Read or analyze:** use `read_office` for bounded cells, sheet names, formulas, and displayed values. Page through large sheets; its default sample is not the whole workbook. For substantial statistics, read the file with a local data library and validate row counts, missing values, and data types before interpreting results.
2. **Create:** use ExcelJS for `.xlsx` if installed. Define sheet names, column types, number formats, input cells, formulas, filters, frozen headers, and source notes. Use a proper CSV parser for CSV/TSV and preserve encoding and delimiters.
3. **Edit:** inspect the source sheets, dimensions, formulas, styles, named ranges, charts, tables, hidden sheets, validation, external links, and macros before saving. Change only the needed cells or sheets. ExcelJS does not preserve every advanced Excel feature; test the output against the source and disclose any feature that cannot be retained. Never round trip an `.xlsm` through an editor that drops VBA.
4. **Model or dashboard:** separate assumptions, calculations, and outputs. Keep derived cells as formulas where users need to change inputs. Add native charts only when the selected library supports them reliably; otherwise provide a separate figure and state that it is not an editable Excel chart.

## Formula and data checks

- ExcelJS writes formulas but does not calculate them. A missing cached result is unknown, not zero. Independently compute several key outputs from input cells and record the expected values.
- Check units, dates, percentages, currencies, missing values, duplicates, and totals. Do not turn identifiers such as ZIP codes into numbers.
- Reopen the output and compare sheet names, dimensions, important values, number formats, formulas, and any retained advanced features with the source.

## Verification

Call `verify_office` on the output, with `sourceFilePath` for an edit. Resolve all reported error cells and broken relationships. The verifier cannot calculate formulas or judge chart quality. If LibreOffice is available, recalculate a temporary copy and compare key outputs, without overwriting the deliverable. Report any unverified formula results or advanced features.
