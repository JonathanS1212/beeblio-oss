---
name: xlsx
description: "Use this skill any time a spreadsheet file is the primary input or output. This means any task where the user wants to: open, read, edit, or fix an existing .xlsx, .xlsm, .csv, or .tsv file; create a new spreadsheet from scratch or from other data sources; analyze data and output results as an Excel file with charts; convert between tabular file formats (CSV/JSON/PDF → XLSX or vice versa); clean, merge, pivot, or transform tabular data. Trigger especially when the user references a spreadsheet file by name or path, says 'make a table/report/model', mentions Excel/CSV/数据分析/报表/汇总, or wants data visualization inside a spreadsheet."
---

# XLSX — Scene-Driven Spreadsheet Workbench

> **Beeblio Job runtime:** execute every command in this skill with `run_analysis`. Every dependency this skill mentions (Python `openpyxl`, `xlsxwriter`, pandas; LibreOffice; Noto CJK fonts) is preinstalled in the disposable Job image — never run `pip install`, `npm install`, or `apt` (Jobs have no network). Resolve `<skill_directory>` as `/opt/beeblio-skills/xlsx`. For read-only questions about a workbook, the `read_office` tool is a lighter alternative.

## Pre-Flight: Intent Gate

Before touching any code, confirm the user actually needs a spreadsheet:

- Report / analysis summary → **docx skill**
- Presentation / pitch deck → **pptx skill**
- Formal print document (contract, certificate, "PDF") → **pdf skill**
- Charts only, no data table needed → `data-visualization-styling` (Matplotlib)
- User explicitly says a format → respect it

If confirmed xlsx → proceed to Scene Router below.

**Request Decomposition** (do this every time):
- **Explicit needs**: sheets, columns, formulas, metrics the user stated
- **Implicit needs**: business context, downstream use (filter? sort? input?)
- **Multi-part requests**: generate ALL parts — never silently drop a component

**Multi-Intent Detection** — some requests combine multiple scenes:

```
"Create a financial model with charts and export a PDF summary"
 → scenes/finance.md + engines/chart.md + (hand off PDF to pdf skill)

"Analyze this CSV, build a dashboard, and make it look professional"
 → scenes/analyze.md + engines/chart.md + engines/design.md

"Edit this budget file, add a new quarter column, and create a pivot"
 → scenes/edit.md + quality/pipeline.md (pivot command)

"Convert these 5 CSVs into one xlsx with a summary sheet"
 → scenes/convert.md + scenes/create.md (for summary)
```

When multiple intents detected, load all matching files and execute in logical order: data preparation → analysis → visualization → styling → QA.

---

## File Loading Rules (MANDATORY)

**Always load ALL matched files. No shortcuts, no lazy loading, no "on demand".**

```
User Request
│
├─ 1. Read SKILL.md (this file) — always
├─ 2. Route to scene file(s) via Scene Router below — read COMPLETELY
├─ 3. If scene involves charts → ALSO read engines/chart.md
├─ 4. If scene produces styled output → ALSO read engines/design.md
├─ 5. If scene is analyze → ALSO read scenes/analyze-recipes.md
├─ 6. If scene is edit → ALSO read scenes/edit-patterns.md
├─ 7. If scene is VBA → ALSO read engines/vba-templates.md
└─ 8. QA: always run full pipeline (quality/pipeline.md)
```

**Rule: when in doubt, read the file.** The cost of reading an extra file is a few hundred tokens. The cost of NOT reading it is a broken output that needs to be redone.

**Chart + Design engines are loaded by default** unless the task is purely read-only (inspect/validate with no output file). If you are creating or editing an xlsx, you MUST read `engines/design.md`.

---

## Scene Router

```
User Request
│
├─ Involves an existing file?
│  ├─ Yes → Modify content or structure?
│  │         ├─ Yes ──────────────────── → scenes/edit.md
│  │         └─ No (read/analyze only) ─ → scenes/analyze.md
│  │
│  └─ Format conversion (CSV↔XLSX, JSON, PDF tables)?
│     └─ Yes ────────────────────────── → scenes/convert.md
│
├─ Create from scratch?
│  ├─ Financial / budget / forecast / cost tracking?
│  │  ├─ Complex (DCF / LBO / three-statement linkage (三表联动) / sensitivity / IB model)?
│  │  │  └─ Yes ─────────────────────── → scenes/finance.md
│  │  └─ Simple (budget table (预算表) / expense report (费用报表) / revenue vs cost (收支对比) / project cost (项目成本) / personal finance (个人记账))?
│  │     └─ Yes ─────────────────────── → scenes/finance_lite.md
│  └─ General table / report / template
│     └─ ──────────────────────────── → scenes/create.md
│
├─ Batch processing / large files / protection / validation?
│  └─ Yes ───────────────────────────── → scenes/advanced.md
│
├─ VBA / macros / automation inside Excel?
│  └─ Yes ───────────────────────────── → scenes/vba.md + engines/vba-templates.md
│
├─ Needs charts or data visualization?
│  └─ Yes ───────────── append ────────→ engines/chart.md
│
└─ Needs styling / design system?
   └─ Yes ───────────── append ────────→ engines/design.md
```

**Mixed requests**: load all matching files. Engine files always **append** to a scene.

**Finance detection**:
- **finance.md** (complex): DCF, LBO, P&L, 利润表, 资产负债, valuation, 估值, IRR, 三表联动, sensitivity, scenario
- **finance_lite.md** (simple): 预算, budget, 费用, expense, 收支, 记账, 项目成本, cost tracking, 报销, ROI

**VBA detection**: 宏, macro, VBA, 自动化, automation, .xlsm, 按钮, button, auto-run, 批量处理脚本

---

## Design Principles

### 1. Live Formula Guarantee
Every derived value SHOULD be an Excel formula so the spreadsheet stays dynamic.

**Exception — Programmatic Verification**: When the output file will be verified by Python (not opened in Excel), TOTAL/SUM rows should write **computed values** instead of formulas, because openpyxl cannot evaluate formulas and `data_only=True` returns `None` for newly-written formulas. Optionally add the formula as a cell comment for reference.

### 2. Zero Error Tolerance
Deliverables must have zero formula errors. All divisions wrapped with `IFERROR` or `IF(denom=0,...)`. Absolute references (`$C$42`) for shared denominators.

### 3. Compatibility First
No dynamic array functions (`FILTER`, `UNIQUE`, `XLOOKUP`, `SORT`, `SORTBY`, `XMATCH`, `SEQUENCE`, `LET`, `LAMBDA`, `RANDARRAY`). No implicit array formulas — use `SUMPRODUCT` alternatives.

### 4. Preserve & Match
When editing existing files: study and exactly match format, style, conventions. Existing patterns always override defaults. Text starting with `=` must be prefixed with `'`.

### 5. Language Mirror
Output language (sheet names, headers, labels) matches user's input language.

### 6. Data Consistency Over Instructions
When user instructions conflict with the actual data patterns in the existing file:
- **First priority**: match the existing data pattern (e.g., if existing data uses `0` for empty, don't switch to `-`)
- **Second priority**: follow user instructions literally
- Always flag the conflict to the user

Example: User says "show hyphen for zero" but existing data and answer key use numeric `0` → Use `0` and notify user of the discrepancy.

---

## Toolchain

### Script Path Setup (MANDATORY before any script call)

All CLI tools live relative to this skill's directory. Before calling any script, resolve the absolute path once:

```bash
XLSX_SKILL_DIR="<skill_directory>"   # ← parent directory of this SKILL.md

# Then all commands use absolute paths:
python3 "$XLSX_SKILL_DIR/xlsx.py" inspect data.xlsx --pretty
python3 "$XLSX_SKILL_DIR/xlsx.py" pivot data.xlsx output.xlsx --rows Region --values Revenue
python3 "$XLSX_SKILL_DIR/xlsx.py" validate output.xlsx
```

**For Python imports** (when generation code needs to import skill modules):

```python
import sys, os
XLSX_SKILL_DIR = "<skill_directory>"
for sub in [XLSX_SKILL_DIR, os.path.join(XLSX_SKILL_DIR, "templates")]:
    if sub not in sys.path:
        sys.path.insert(0, sub)
```

**⚠️ NEVER use bare `python3 xlsx.py ...`** — it only works if cwd happens to be the skill directory. Always use the absolute path.

### Tool Reference

| Tool | Use |
|------|-----|
| **openpyxl** | Formulas, formatting, charts, cell-level control |
| **pandas** | Data analysis, bulk operations, CSV/TSV |
| `load_workbook(read_only=True)` | Large file reads |
| `Workbook(write_only=True)` | Large file writes |
| **templates/base.py** | Design tokens, font resolution, style factories, utilities (single source of truth) |
| **xlsx.py** | QA commands (see `quality/pipeline.md`) |

Workbook metadata: `wb.properties.creator = "Beeblio"`

> **All code MUST import from `templates/base.py`** for colors, fonts, and style helpers. Never hardcode hex values or font names.

---

## Quality Gate

Every deliverable must pass the full integrity pipeline before delivery.

→ **Load `quality/pipeline.md` for the role-based integrity workflow.**

Quick reference:
```
Blueprint → Build & Self-check (per-sheet) → Inspect → Pivot (if needed) → Release
```

---

## Capability Matrix

| Capability | Supported | Scene/Engine |
|-----------|-----------|-------------|
| Create from scratch | ✅ | scenes/create |
| Edit existing file | ✅ | scenes/edit |
| Data analysis & EDA | ✅ | scenes/analyze |
| Format conversion | ✅ | scenes/convert |
| Financial models (DCF/LBO/P&L) | ✅ | scenes/finance |
| Simple budgets & expenses | ✅ | scenes/finance_lite |
| VBA macros & automation | ✅ | scenes/vba + engines/vba-templates |
| Batch processing | ✅ | scenes/advanced |
| Embedded charts | ✅ | engines/chart |
| Smart chart recommendation | ✅ | engines/chart |
| Design system & styling | ✅ | engines/design |
| PivotTable creation | ✅ | quality/pipeline (pivot cmd) |
| Formula validation | ✅ | quality/pipeline |
| Structural validation | ✅ | quality/pipeline |
| Data provenance tracking | ✅ | scenes/analyze |
| Large file handling | ✅ | scenes/advanced |
| Data protection & locking | ✅ | scenes/advanced |



## Writing Quality and Authored Content
Apply these defaults to text you write, including titles, labels and messages returned by formulas. User instructions and preferences, reference/template conventions and domain guidance take precedence, in that order. For edits, do not change unrelated content outside of the user's request and follow the workbook’s existing writing style.

- Write for the intended audience. Never include internal file paths, authoring commentary, planning notes, or requester instructions in the artifact unless explicitly requested. Do not repeat audience or style directives such as “executive-friendly” in headings, content, or comments.
  - Omit: `Discussion support only. This workbook does not make final rating or promotion decisions.` just because the user asked for a workbook for discussion.
  - Omit: `Supports discussion and consistency checks. Human reviewers remain responsible.` unless that limitation is explicitly required.

- Include text only when it helps the reader understand the data or use the workbook. Keep clear text unchanged. Rewrite useful text that is unclear. Delete unnecessary text instead of replacing it with a cleaner version of the same filler.

- Use concise, plain-language titles and labels. Name the specific subject, issue or action and avoid internal jargon and vague status labels. Preserve what each label measures, including the population, period, units, comparison, and uncertainty. Do not shorten a label by removing a distinction the reader needs.
  - Good: `Weekly metrics`. Bad: `Follow the weekly trends`
  - Use `Metric` for a general metric column and `Revenue driver` for a revenue assumption explanation. Avoid invented labels such as `Planning measure`, `Movement explanation` or `Planning basis`. Retain specific labels when they add necessary meaning.
  - Bad: `Requisition blockers`. Good: `Hiring requests awaiting approval` when approval is the issue.
  - Bad: `Two-band rating movement`. Choose a descriptive, clear phrase that represents the underlying event, e.g.:
    - Promotion: `Promoted by two job levels`
    - Rating change: `Performance rating increased by two levels`
  - Good: `Monthly results`. Bad: `Decision-ready monthly impact analysis`
  - Good: `Income and household assumptions`. Bad: `Same paycheck. Different purchasing power.`
  - Use `Retained employees` only for employees who remained over a defined period. Otherwise, name the population counted, such as `Total employees` or `Employees reviewed`.

- Avoid decorative bullets, icons, emoji, arrows and pipe-delimited titles. Omit filler suffixes; keep terms such as `review`, `analysis` or `dashboard` when they identify the content.
  - Bad: `$ in USD • monthly • forecast`
  - Good: `Monthly forecast (USD)`

- Prefer direct, specific human wording. Avoid slogans, buzzwords, invented terminology, vague framing and formulaic claims.
  - Good (when supported by the data): `Most revenue growth comes from data centers.` Bad: `Data centers are doing the heavy lifting.`
  - Good: `Contributions decreased`. Bad: `Contributions waned`
  - Good: `Revenue metrics`. Bad: `Strategic Value Drivers`
  - Bad formulaic phrasing: `The tool not only saves time, but also transforms how teams collaborate.` or `Faster, smarter, and more intuitive.`
  - Bad: `While remote work offers flexibility, it also presents unique challenges.` (synthetic balance without a real tradeoff)
  - Bad: `Operating evidence improved`. Operating evidence is unclear and not a common term used.

- Avoid AI-like sentence constructions. Use direct sentences with clear meaning and avoid vague explanations and forced contrasts. Prefer periods between sentences. Do not use semicolons, pipes, bullets, or dashes to assemble several labels into a slogan.
  - Semicolons and vague explanations: Use `Travel demand and employment fell from Jan to Feb.`, not `Travel demand and employment fell from Jan to Feb; persistent behavior shifts are shaping the path back.`.
  - Passive voice when active is clearer e.g. Use `The team approved the proposal.` not `The proposal was approved by the team.`
  - Contrast slogans like `It’s not X, it’s Y`: For a title, use `Humidity exposure over time` not `Humidity is an exposure trajectory, not a setpoint.`
  - Unnecessary em-dashes: Bad: `Purpose: isolate what changed – and what deliberately stayed in place – under Osaka Prefecture’s Red Stage emergency response.`

- Keep wording factual, parseable and supported by the workbook.
  - Good: `Transit use is 79% of pre-pandemic levels.`
  - Bad: `79% Transit use back to pre-pandemic`

- Omit repeated information, obvious purpose statements and generic disclaimers. Subtitles are optional. State critical definitions and material assumptions once beside the relevant data or setting. Preserve task-required limits and warnings, such as a review supporting discussion rather than making final personnel decisions.

- Do not include motivational wording or self-assessment. Omit decorative badges and self-evaluation banners. Preserve task-required business statuses, risk flags, uncertainty labels and specific warnings as ordinary data. Do not invent scoring systems or confidence scales merely to decorate the workbook.
  - Omit: `This workbook is source-backed and ready for review`.

- For checks and logic, be specific:
  - Bad: `Signal integrity: BLOCKED`. Good: `Missing input: forecast rate` (a specific functional warning)

- For a requested workflow, provide an obvious editable field for required human input, separate from original source notes. Short calculated statuses or actions should reflect all required prerequisites. Do not imply completion while another required action is still open.


## Workflows
Required:
- `workflows/edit_workflows.md` for existing files/follow-ups.
- `workflows/create_workflows.md` for new files

## Resources
Read the following BEFORE starting the task:

Required:
- `artifact_tool_docs/API_QUICK_START.md` for `artifact_tool` JS API documentation. Read entirely.
- `style_guidelines.md` for formatting.

As applicable:
- `references/template-elicitation.md`: if user has not provided a template, reference, or visual direction.
- `references/image-references.md`: if a reference image or screenshot is provided.
- `references/read_only_qna.md`: for Q&/audits
- `features/charts.md`: for creating or editing charts.

<a id="domain-requirements"></a>

## Role and Domain Guidance
Before authoring, identify the user's **task/function**, **role**, **audience** and **industry** separately, then read the relevant guides below. Apply the professional conventions of the work being done; a role or industry label alone does not determine the workbook's structure or formatting.
- Use function guidance for the work being done. Financial forecasts, budgets, cash models and valuations use Finance guidance in any industry.
- Add industry requirements only when they affect definitions, units, source handling or the workflow. A healthcare company's financial forecast uses Finance guidance; an appointment tracker does not inherit financial-model structure or colors.
- Use the user's role and audience to choose useful detail, terminology and outputs, and to resolve ambiguity in the task. Do not apply Finance conventions to an unrelated task just because the user works in Finance. Explicit instructions and templates retain precedence; relevant domain conventions override generic defaults.

Guides:
- Finance, corporate finance and FP&A, financial modeling, valuation and investment banking: `domain_guidance/financial_models.md`. Read the relevant financial requirements below the shared structure, formula and style rules.
- Healthcare: `domain_guidance/healthcare.md`
- Marketing and advertising: `domain_guidance/marketing_advertising.md`
- Scientific research: `domain_guidance/scientific_research.md`

## Create and Edits
For any task that requires modifying or creating a workbook:

### Data Formatting Rules
- Store numbers, percentages, currency, and dates as typed spreadsheet values, not preformatted strings. Use text only for true identifiers such as ZIP codes, account IDs, SKUs, or labels.
- Use Excel-invariant number/date format codes, not locale-specific display strings. Generic numeric examples include `#,##0`, `#,##0.0`, `0.0%`, `0.00%`, `"$"#,##0`, `"$"#,##0.00`. Preserve source dates and unrelated existing formats.
- Percentages: Follow the domain or reference's precision. Otherwise, use 1 decimal for most analytical cells, 0 decimals for dashboard outputs, and 2 decimals where small rate differences matter.
- Do not swap `.` and `,` in format codes to mimic locale separators; separators are controlled by spreadsheet/render locale. Use `0.0%`, not `0,0%`, and `#,##0`, not `#.##0`.
- Choose the appropriate format for readability. Match precision to meaning: counts use `#,##0`; rates usually use `0.0%` or `0.00%`; currency uses whole units unless cents matter.

- For dates in data columns, default to a short date format appropriate to the workbook's language/location, such as `mm/dd/yy` for the US. Follow explicit user preferences and reference/template or domain conventions.

Keep underlying dates numeric and sortable. A display format does not change the period represented or authorize aggregation. Fit the final display so dates do not truncate or show `####`.

### Verification Rules
Use Artifact Tool to verify requested features and results within the authorized changes and their affected dependencies. Match coverage to the scope, complexity and risk. Report unrelated pre-existing defects without repairing them. Reuse checks for unchanged content and keep authoring-only tests out of the delivered workbook.

After completing all edits, call `workbook.recalculate()` once before the final checks below and export. If you make further edits, recalculate again before repeating affected checks and exporting.
```js
workbook.recalculate();
```

1. Inspect labels, values and formulas in key ranges:
```js
const check = await workbook.inspect({
  kind: "table",
  range: "Dashboard!A1:H20",
  include: "values,formulas",
  tableMaxRows: 20,
  tableMaxCols: 12,
});
console.log(check.ndjson);
```

Check what each source row represents, units, reporting periods, and numerators and denominators for rates. Spot-check representative metrics against source data or an independent calculation. Trace headline results through the build to inputs, including named and dynamic references. Confirm the build does useful calculations and does not depend on terminal Checks/Audit. When cases are used, trace each period to its active assumptions. Summary should link to finished results without repeating the build or routing results through Assumptions. An actuals-only historical calibration reference is allowed.

Check formula copying across and down at first, middle and later rows/periods. When the workflow promises extensions, test the next record, period or requested case. Keep notes and overrides tied to stable record IDs after supported sorts or refreshes. Reconcile key totals to independent source controls using the right period aggregation. Apply tolerances appropriate to the units and precision, but compare identifiers, counts and categories exactly. Investigate double-counting or conflicting data and fix confirmed errors within scope.

2. Scan formula errors:
```js
const errors = await workbook.inspect({
  kind: "match",
  searchTerm: "#REF!|#DIV/0!|#VALUE!|#NAME\\?|#N/A|#NUM!|#NULL!|#SPILL!|#CALC!",
  options: { useRegex: true, maxResults: 300 },
  summary: "final formula error scan",
});
console.log(errors.ndjson);
```

Check wrong or shifted references and unintended cycles as well as reported errors. Distinguish deliberate missing-data markers from unexpected failures. Trace unavailable results and zero issue counts through their prerequisites: a failed detail calculation must not disappear into a healthy zero or an understated summary.

3. Verify applicable recalculation in the intended engine. Test representative input changes and boundaries in a disposable copy or restore every temporary edit before delivery. Include blank versus zero, missing/duplicate keys, period cutoffs, overrides and rounding. For cases, change the selector and a later-period driver. Confirm the same build and linked outputs update while actuals remain unchanged. A blank unselected input must not block a valid active case; selecting that case must expose the missing input. Verify any agreed comparison refresh and stale-state behavior separately. Report any engine checks that could not be performed.

For workflows, check that required human inputs have editable fields and that completion guidance accounts for every prerequisite. Complete one prerequisite while leaving another open and confirm the remaining action stays visible. For input-driven rankings and action lists, change an input that should alter the order or included records and verify the list updates. Verify affected charts, status text, validation and conditional formatting react to edits. A saved value, static matrix or unchanged PASS cell is not recalculation proof.

4. Render sheets/ranges to verify visual output. Skip only when the rendered view and its data/formula dependencies are unchanged:
```js
const blob = await workbook.render({ sheetName: "Sheet1", range: "A1:H20", scale: 2 });
```
For creation or broad authorized restructuring, visually review every sheet. For a narrow edit, review the changed view and affected dependencies, then compare all tabs with the source for unintended value, formula, object, validation or style changes. Do not repeatedly render unchanged tabs; investigate any scope-preservation failure.

Inspect at normal zoom with cells unselected. Fix blank/broken charts, low-contrast text, unreadable fonts, clipped headers/numbers, `####`, awkward wrapping, truncated chart labels, default blank sheets and content outside the working area. Check effective cell/chart fonts, fitted row heights and widths, pane boundaries and conditional-format ranges. Logical titles and labels should appear once with a clear layout. Valid check values should stay neutral, with errors and missing inputs visibly distinct. Do not shrink content to force a fit.

Keep output compact: avoid arbitrary formula-count checks, assumptions about file storage and huge NDJSON dumps.

5. Export:
```js
await fs.mkdir(outputDir, { recursive: true });
const output = await SpreadsheetFile.exportXlsx(workbook);
await output.save(`${outputDir}/output.xlsx`);
```

6. Inspect the saved file when an affected feature or export concern requires it. Verify requested or preserved native features in the intended engine, including any explicitly required Data Table input/output behavior. Check iteration and capture behavior separately when used.

Finalize only after successful export and the applicable checks. Report what was performed and any remaining limitations. Formula text, a preview and a successful export do not establish native-application behavior.
- Do not export extra `.xlsx` variants unless asked.

### Citation Requirements
These are defaults for new workbooks: user instructions, reference/template conventions and domain guidance take precedence. For edits, follow the workbook’s existing citation practices.
- Cite real sources when they exist.
- Keep citations and sources in one place: an existing input tab (sources or data tab) or in the correct input section in a tab, alongside the input data.
- There are two ways to cite a source: 
  1. (Preferred) Inline in the input tab when the tab exists.
    - If there are multiple unique sources (different pages/lines don't count), inline them in an adjacent cell at the table's end, with one column as a buffer, when a table exists
    - If there is a single source, just have a single cell above the data, left aligned.
  2. (Fallback) Cell note, not a comment/thread, with the citation
    Only do this for hardcoded inputs not on a separate input tab, such as an input area on a build sheet. For adjacent cells in the same row or column that come from the same source, do not add duplicate cell notes. Never add citation notes to titles or headers.
- If there is no clear place for sources, return sources in chat. Do not add a tab just for citations.
- Citation format should follow best practice for domain, default to `(Source: Company 10-K, FY2026, Page 20, Revenue Note, [URL LINK])`
- Do not add citations, comments or notes to cover/presentation tabs or output regions unless requested. On a mixed-use sheet, citations may sit beside the input data, outside the output region.
- When comments are requested, keep them succinct, minimal and easy to read.
- Do not add a different annotation type to a cell that already has one. Update an existing note/comment/thread rather than layering another system over it.
- Do not add cell comments unless the user requests them. Preserve existing annotations.

## Completion Criteria
### Criteria for Question / Read only requests
- Answer from the available workbook context. Do not edit or overwrite unless the user asks for a workbook change.

### Criteria for all create and edit requests
Complete only when:
- Content is populated, addresses the user's request, and formulas compute, with no obvious formula errors in key scanned ranges (including bad-reference, off-by-one or circular errors).
- `.xlsx` saved to `outputs/<unique_thread_id>/`.
- Visual verification passes: organized, legible layout matches requested style or default/existing edit baseline; all important numbers/callouts are visible; numbers, text, charts and content are unclipped without awkward wrapping.
- Required controls, charts, panes and requested features exist.

## Error Recovery
On first tool or API error:
1. Read error text.
2. Consult the selected workflow's targeted help or schema discovery only if needed.
3. Retry with minimal patch (not full rewrite).
4. Continue from existing workbook state.

Do not loop indefinitely on similar failures.

## Final response

### Final response file references

- For a created or edited workbook, mention each final file once using its backticked workspace path, such as `/workspace/Reports/inventory.xlsx`. Beeblio renders this path as a file chip the user can open. Summarize representative changes.
- For a read-only answer, identify the source workbook with its backticked workspace path. Give the relevant sheet and cell or range in ordinary prose when useful; use only locations you inspected.
- Refer only to distinct inputs, drivers, formulas, or results needed to support the answer. Do not cite intermediates unless asked. Do not emit Codex-specific citation directives.


## Comment Author
- If the authenticated/user profile or env context provides a user display name, use it as the threaded comment display name unless the user requests another name. Default to `User`.

## Source, PDF, and Attachment Processing
- For attachment references, include only the file/section/table details needed to locate supporting data. Do not paste large PDF excerpts unless requested.
- Bundled Python libraries available in the bundled runtime environment for extraction/analysis include `pandas`, `numpy`, `pypdf`, `python-docx`, and `reportlab`. You may read/extract in separate scripts if needed.
- Bundled JS libraries available for document/PDF work include `docx`, `pdf-lib`, and `pdfjs-dist`.
