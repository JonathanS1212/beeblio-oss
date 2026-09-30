---
name: literature-matrix
description: Procedure for building and filling literature matrices (.matrix comparison tables) with the update_matrix tool.
---

# Literature Matrix Procedure

A literature matrix compares studies side by side: one row per paper, one column per
attribute. Rows are keyed by their citation key in `/workspace/1-References/references.bib`;
bibliographic columns (year, authors, venue, publisher, doi, type) are derived from that
file automatically, and every other column (Method, Key Findings, Sample size, …) is a
custom comparison column stored in the matrix.

## Reading a matrix

Use `read_file` on the `.matrix` path (default `/workspace/3-Analysis/literature-matrix.matrix`).
It is JSON: `columns` (derived vs custom, each custom column has an `id` and optionally a
`description` of what it compares) and `rows` (each with `citationKey`, `doi`, a `snapshot`,
and `cells` keyed by column id).

## Modifying a matrix

Always use the `update_matrix` tool — never `write_file` on a `.matrix` file. Operations are
applied atomically in order:

- `add_papers`: append studies. **Every paper must already be a citation in references.bib.**
  If it is not, add it first with `update_bibliography` (`add_papers` for papers with a DOI,
  PMID, or OpenAlex id from your search results; `add_entries` for unindexed works), then
  `add_papers` here with the exact citation key the tool returned.
  The tool warns you about unlinked keys — fix them with `update_bibliography`.
- `add_column`: create a comparison column. You get the new `columnId` back; use it
  immediately with `set_cells`. Give the column a short label and a `description` of what
  it compares.
- `set_cells`: fill values, one update per `{citationKey, columnId, value}`. Derived columns
  cannot be set — they come from the bibliography.
- `remove_rows` / `remove_column`: remove studies or columns when asked.

## Filling a column (the core task)

When the user asks to add or fill a comparison column (e.g. "compare sample sizes and study
locations"):

1. Read the matrix to list the studies and their citation keys and DOIs.
2. For each study, in order of reliability:
   - Extract the saved paper's text with `pdftotext` through `bash` when a PDF exists in `/workspace/1-References/`.
   - `get_paper_details` (by DOI or title) for structured metadata and the abstract.
   - `search_literature` with the exact title, then `web_fetch` the publisher page.
3. Write all cells for the column in one `set_cells` batch.
4. Report what could not be found rather than leaving cells silently empty.

**Cell style:** at most ~15 words, quantitative when possible (e.g. `n = 342; RCT, 6 schools`,
`Survey; 12 interviews`, `Chicago public schools, 2019–2021`). When a study does not report
the attribute, write `Not reported` — never guess, never invent a value, and never invent a
citation. Long prose belongs in the report, not the matrix.

## Adding studies to a matrix

When asked to find and add studies: search with `search_literature`, pick relevant and recent
work, append each citation to the project bibliography, then `add_papers` with the resulting
keys. Optionally fill existing custom columns for the new studies in the same turn.

## Exporting

When the user wants the matrix in a document, write a Markdown pipe table to
`/workspace/4-Reports/` (Study column = title, then each column). Use `open_file` on the
result so the user sees it.
