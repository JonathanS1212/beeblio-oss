---
name: data-cleaning-heuristics
description: Best practices for cleaning and preparing data with Beeblio's native Python runtime.
---

# Data Cleaning Heuristics

When asked to clean, merge, or wrangle datasets, apply the following rigorous standards. Use a saved Python script with pandas, Polars, PyArrow, openpyxl, PyReadStat, or DuckDB as the analysis route; `import beeblio_research` for provenance-safe table I/O and quick profiling (`read_table`, `write_table`, `describe`, `frequencies`, `profile`, `is_missing`, `number`).

## 1. Immutable Raw Data
- **CRITICAL:** NEVER overwrite the original uploaded data files.
- Always read the original file and write the cleaned output to a clearly named new file under `/workspace/2-Data/derived` (e.g., `/workspace/2-Data/derived/dataset_cleaned_v2.csv`).

## 2. Technical Execution
- Inspect files by path and choose a reader from the actual format: pandas/Polars for delimited data, PyArrow/DuckDB for Parquet and larger-than-memory workflows, openpyxl/odfpy/pyxlsb for spreadsheets, and PyReadStat for SPSS/Stata/SAS metadata formats.
- Save the complete `.py` source under `/workspace/3-Analysis`, pass input/output paths as command-line arguments, execute it with `bash`, and retain the script as the audit trail. Never paste dataset contents into generated code.
- For large inputs, scan metadata first and use chunking, lazy frames, Arrow datasets, or DuckDB queries rather than loading the entire file blindly.
- Print only compact validation summaries to stdout; write cleaned data, profiles, and detailed diagnostics to durable files.

## 3. Handling Missing Values (NAs) and Outliers
- Identify common missing value representations in raw data (e.g., `""`, `"NA"`, `"N/A"`, `-99`, `999`) and standardize them to a proper null/undefined state.
- Decide between imputation (e.g., mean/median substitution) and listwise/pairwise deletion based on the user's domain. Document this choice.
- Check for outliers (e.g., values > 3 standard deviations from the mean). Depending on the field, apply winsorizing, capping, or log-transformations, but always ask the user for confirmation if unsure.

## 4. Data Type Standardization
- Ensure numeric columns are actually parsed as numbers, not strings.
- Standardize date strings into consistent ISO formats only after validating the source convention and ambiguous day/month ordering.
- Strip leading/trailing whitespaces from string/categorical columns and unify casing (e.g., converting all to lowercase).

## 5. Recoding & Transformations
- When creating categorical dummy variables or recoding scales (e.g., reversing a Likert scale from 1-5 to 5-1), double-check the mathematical logic.
- Document any composite indices created (e.g., "Socioeconomic Status Index = mean(income, education)").

## 6. Audit Trail
- Always output a brief summary of what was dropped, changed, or merged (e.g., "Dropped 45 rows due to missing Income data. Recoded 'Gender' to binary indicators.")
- Retain the executed `.py` file so the researcher receives a durable executable record of the transformation.

## 7. Sandbox Execution & Scripting Best Practices (CRITICAL)
- **Choose the runtime deliberately:** Use saved Python scripts for tabular and scientific workflows. Use JavaScript only when it is genuinely a better fit. Do not compress substantial programs into shell one-liners.
- **Use normal programs:** `bash` executes saved scripts and native utilities on the local computer. Keep source code in `/workspace/3-Analysis`, pass paths as arguments, and use installed local packages.
- **Output Destination:** `/workspace` is the linked local project folder; `/tmp` is temporary host storage. Save every deliverable under `/workspace`, using `/tmp` only for disposable intermediates.
