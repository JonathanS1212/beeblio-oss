# Spreadsheets

Use this guidance for `.xlsx`, CSV, or TSV tasks. Clarify the desired rows, columns, formulas, and output format from the request. Preserve the input file unless the user explicitly asks to overwrite it.

Use the local ExcelJS package for XLSX files when it supports the required features; use a CSV parser for plain text tables. Inspect workbook sheet names, dimensions, formula cells, and number formats before editing. Keep calculations as formulas when the user needs an editable model, and record assumptions beside their inputs.

After editing, reopen the saved file and check sheet names, key values, formulas, and data types. ExcelJS writes formulas but does not calculate their results, so independently calculate a few important expected values and disclose when formula caches are unavailable. Avoid treating an empty cached value as a zero.
