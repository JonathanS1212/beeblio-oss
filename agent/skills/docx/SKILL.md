---
name: docx
description: "Complete DOCX document creation, editing, and analysis capabilities with support for revisions, comments, formatting preservation, and text extraction. Use for creating new documents, modifying content, handling revisions, adding comments, or other professional Word document tasks."
---

# DOCX Creation, Editing, and Analysis

> **Beeblio Job runtime:** execute every command in this skill with `run_analysis`. Every dependency this skill mentions (Node `docx` and `image-size`, Python `defusedxml`/`python-docx`, pandoc, LibreOffice, Poppler) is preinstalled in the disposable Job image — never run `npm install`, `pip install`, or `apt` (Jobs have no network). Resolve `<skill_directory>` as `/opt/beeblio-skills/docx`. For read-only questions about a Word file, the `read_office` tool is a lighter alternative to this skill's Read route. To export an existing Markdown workspace file to DOCX or PDF (Mermaid fences render automatically), prefer the `convert_markdown_document` tool over rebuilding the document with this skill.

## Overview

A .docx file is a ZIP archive containing XML files. This skill provides tools for creating, editing, reading, and reviewing Word documents.

## Quick Route — Read This First

**Step 1**: Determine task type → load the corresponding route file
**Step 2**: Determine business scene → load the corresponding scene file (if applicable)
**Step 3**: Load `references/design-system.md` for cover recipes, palettes, and chart colors
**Step 4**: Load `references/common-rules.md` for shared layout, font, and quality rules
**Step 5**: Execute per route instructions
**Step 6**: Run the post-generation checklist

⚠️ **MANDATORY — Cover Recipe Enforcement (Step 3):**
When creating a document that needs a cover page, you MUST use one of the 7 validated cover recipes (R1–R7) from `design-system.md`. **Free-form cover code is FORBIDDEN.** The recipe provides the wrapper table, background, layout structure, border settings, and spacing — do not reinvent any of these.

Workflow: (1) Call `selectCoverRecipe(docType, industry)` to get recipe + palette → (2) Use the corresponding `buildCoverRX()` function code from `design-system.md` → (3) Pass your `config` (title, subtitle, metaLines, etc.) into the recipe builder. If you skip this and write cover code from scratch, the cover WILL have compatibility issues (blank pages in MS Office, missing borders, overflow, etc.).

### Script Path Setup (MANDATORY before any script call)

All CLI tools live in `scripts/` relative to this skill's directory. Before calling any script, resolve the absolute path once:

```bash
DOCX_SCRIPTS="<skill_directory>/scripts"   # ← parent directory of this SKILL.md

# Then all commands use $DOCX_SCRIPTS:
python3 "$DOCX_SCRIPTS/postcheck.py" output.docx
python3 "$DOCX_SCRIPTS/add_toc_placeholders.py" output.docx --auto
```

**For Python imports** (when generation code needs to import skill modules):

```python
import sys, os
DOCX_SCRIPTS = os.path.join("<skill_directory>", "scripts")
if DOCX_SCRIPTS not in sys.path:
    sys.path.insert(0, DOCX_SCRIPTS)
```

**⚠️ NEVER use bare `python3 scripts/...`** — it only works if cwd happens to be the skill directory. Always use the absolute `$DOCX_SCRIPTS` path.

### Task Router

| User Intent | Route | Files to Load |
|-------------|-------|---------------|
| Create/write/generate (no attachment) | **Create** | `routes/create.md` + `references/docx-js-core.md` |
| Edit/modify/revise (has attachment) | **Edit** | `routes/edit.md` + `references/ooxml.md` |
| Format/layout/font/margin | **Format** | `routes/format.md` |
| Comment/annotate/review | **Comment** | `routes/comment.md` |
| Read/analyze/extract | **Read** | `routes/read.md` |

### Scene Router (Optional — load after route)

| User Keywords | Scene | File |
|---------------|-------|------|
| thesis, academic, research, paper, dissertation, abstract, journal | Academic | `scenes/academic.md` |
| report, analysis, experiment, testing, survey, review, summary, proposal, feasibility, competitor, industry, operations | Report | `scenes/report.md` |
| contract, agreement, terms, transfer, NDA, confidential, framework, cooperation, service terms, user agreement, procurement | Contract | `scenes/contract.md` |
| resume, CV, job application | Resume | `scenes/resume.md` |
| exam, test, quiz, paper (exam context), lesson plan | Exam | `scenes/exam.md` |
| official document, notice, letter, reply, minutes, red header, government, issuance | Official | `scenes/official-doc.md` |
| broadcast script, product copy, livestream, speech, presentation script, video script | Copywriting | `scenes/copywriting.md` |
| plan, proposal (if not report context) | Report | `scenes/report.md` |
| policy, regulation, standard, management rules | Official | `scenes/official-doc.md` |

**If no scene matches**, use default design rules from `references/design-system.md` and `references/common-rules.md`.

## Formatting Standards (Always Apply)

→ See `references/common-rules.md` for full font profiles, spacing, indent, and layout rules.

**Key rules (quick reference):**
- **Line spacing**: 1.3x (`line: 312`) — MANDATORY. Exceptions: resume 1.15x, official doc 28pt fixed, copywriting `400`, contract 1.5x
- **CJK body**: Justified + 2-char indent (`firstLine: 480` SimSun / `420` YaHei)
- **Tables**: `margins` set, `ShadingType.CLEAR`, `tableHeader: true`, `cantSplit: true`, title `keepNext: true`
- **Images**: `type` parameter required, preserve aspect ratio via `image-size`, PageBreak inside Paragraph
- **Full-page Table row**: `rule: "exact"` with 1200 twips safety margin

## Unit Quick Reference

| Unit | Value |
|------|-------|
| 1 cm | 567 twips |
| 1 inch | 1440 twips |
| 1 pt | 20 half-points |
| A4 | 11906 × 16838 twips |

For Chinese font size table and common margins, see `references/common-rules.md`.

## Post-Generation — Two-Layer Verification

### Layer 1: Manual Checklist (self-check during generation)

#### Basic Format
- [ ] Line spacing is 1.3x (`line: 312`) or scene-specific override
- [ ] CJK body has 2-char indent (`firstLine: 480` or `420`)
- [ ] Tables have margins set
- [ ] Images preserve aspect ratio via `image-size` — NEVER hardcode both width and height
- [ ] PageBreak inside Paragraph
- [ ] ShadingType uses CLEAR
- [ ] Each numbered list uses unique `reference`
- [ ] **⚠️ CRITICAL — Quotation marks in JS strings properly escaped.** Chinese curly quotes (`""` `''`) MUST use Unicode escapes (`\u201c` `\u201d` `\u2018` `\u2019`); straight quotes (`"` `'`) use `\"` `\'` or alternate delimiters. **This is the #1 most common code generation bug.** Chinese text frequently contains `""` for emphasis or proper nouns (e.g., "双11", "前低后高", "618") — every occurrence MUST be escaped. Failure to escape produces JS syntax errors that silently break document generation.
- [ ] ImageRun includes `type` parameter
- [ ] Header/footer present (unless scene says otherwise)

#### Heading Styles
- [ ] All body chapter headings use `heading: HeadingLevel.HEADING_X` (never simulate with bold + large font)
- [ ] Cover title may skip Heading style (not in TOC), but body headings MUST use Heading style

#### Page Break & Blank Page Prevention
- [ ] Cover/content in separate sections
- [ ] Three rules to prevent blank pages:
  - ① When using section(NEXT_PAGE), previous section must NOT end with PageBreak (double break = blank page)
  - ② PageBreak paragraph SHOULD contain visible text — **exception**: section-ending empty para + PageBreak is allowed (normal section separator, e.g., after cover page)
  - ③ No more than 3 consecutive empty paragraphs
- [ ] Full-page Table row height uses `rule: "exact"` (never `"atLeast"` for tall tables)
- [ ] No unwanted blank pages (check each section ending)

#### TOC
→ See `references/toc.md` for the complete TOC reference and checklist.
- [ ] If TOC title exists → `TableOfContents` element must be present
- [ ] **⚠️ MANDATORY PageBreak after TableOfContents** — a Paragraph containing PageBreak MUST immediately follow the `TableOfContents` element; without it, TOC and body content will render on the same page. This is the #1 TOC formatting failure — never omit it
- [ ] `add_toc_placeholders.py --auto` runs after generation; exit code = 0
- [ ] **TOC MUST be in its own section** — body section sets `page: { pageNumbers: { start: 1, formatType: NumberFormat.DECIMAL } }` so page numbers start from the first body page, not from the TOC pages
- [ ] **Page number API nesting** — `pageNumbers` MUST be inside `page: {}`, NOT at properties top level (see toc.md § Page Number API)
- [ ] **3-section page numbering** — Cover (no page#) → Front matter (Roman i,ii,iii, start=1) → Body (Arabic 1,2,3, start=1)
- [ ] **Post-process footers** — Roman section footer instrText must contain `PAGE \* ROMAN \* MERGEFORMAT`; Arabic section `PAGE \* arabic \* MERGEFORMAT` (WPS ignores pgNumType fmt). **⚠️ NEVER use `\* decimal` in instrText** — `decimal` is a docx-js API enum value (`NumberFormat.DECIMAL`), NOT a valid Word field format switch; using it causes page numbers to render as "1decimal", "2decimal". The correct Word field switch for Arabic numerals is `\* arabic`.
- [ ] **Remove empty pgNumType** — Post-process to strip `<w:pgNumType/>` from cover section (docx-js emits empty element that confuses WPS)
- [ ] **⚠️ TOC Refresh Hint MANDATORY** — between `TableOfContents` element and the PageBreak, MUST add an italic gray note paragraph telling users to right-click TOC → "Update Field" to refresh page numbers (see toc.md § TOC Refresh Hint)

#### Table Cross-Page
- [ ] Header rows: `tableHeader: true`
- [ ] All rows: `cantSplit: true`
- [ ] Title paragraph: `keepNext: true`

#### Cover
- [ ] **Cover MUST use a validated recipe (R1–R7)** from `design-system.md` — free-form cover code is forbidden
- [ ] Cover recipe matches document type (per `selectCoverRecipe()` in `design-system.md`)
- [ ] Cover uses the 16838 outer wrapper table with `allNoBorders` (all recipes provide this)
- [ ] Cover title uses `calcTitleLayout()` — never hardcoded font size above 40pt
- [ ] Cover spacing uses `calcCoverSpacing()` — never hardcoded large spacing values
- [ ] Cover content does not overflow (total height ≤ 15638 twips, Table uses `rule: "exact"`)
- [ ] Every TextRun on dark/colored background has explicit `color` set (Rule 9 — never rely on default black)
- [ ] Cover section has no trailing PageBreak or empty paragraphs
- [ ] Title lines split at semantic boundaries (no mid-word breaks, no single-char orphan lines)
- [ ] No text-character decorative lines (`───`, `━━━`) — use paragraph borders only

### Layer 2: Automated Post-Check Script

```bash
python3 "$DOCX_SCRIPTS/postcheck.py" output.docx
```

Automatically checks 14 business rules: blank pages, **cover overflow (font size/spacing/trailing content)**, line spacing consistency, table margins, table cross-page control (cantSplit/tblHeader), image overflow, image aspect ratio distortion, font fallback, CJK indent, heading hierarchy, ShadingType misuse, TOC quality, document cleanliness (placeholder text/Markdown/HTML residuals), report content quality (abstract presence/heading specificity/vague conclusion detection).

⚠️ **After generating any document, MUST run postcheck.py and fix all ❌ errors.**

## Math Formulas

Formula input uses **LaTeX syntax**, internally converted to docx-js Math objects.

- **Basic formulas** (fractions, sub/superscript, roots, summation) → docx-js Math components
- **Complex formulas** (3+ nesting, matrices, piecewise functions) → matplotlib PNG fallback

See `references/math-formulas.md`.

## Charts

Default: **matplotlib template library** generates PNG for embedding.

6 ready-to-use templates: bar, line, pie, box, radar, heatmap.
Colors auto-derived from document palette.accent for style consistency.
Default palette: Morandi low-saturation (see design-system.md).

See `references/chart-templates.md`.

## Dependencies

All preinstalled in the Beeblio agent image (global `require('docx')` resolves via `NODE_PATH`):

- **pandoc**: Text extraction
- **docx** (npm): Document creation
- **LibreOffice**: PDF conversion, .doc support
- **Poppler**: PDF to image (`pdftoppm`)
- **defusedxml**, **python-docx** (pip): Secure XML parsing and comment operations


## Titles + Intro to doc

**Title clarity is an absolute requirement.** State the specific subject and purpose so the reader understands what the document is for before reading the body. Use plain descriptive language with no slogans and no punctuation. Apply this to document titles, subtitles, and section titles, using only words, numbers, and spaces. Use Word’s `Title` paragraph style for document titles. Keep it black with no underlining, paragraph borders, or decorative lines beneath it. Remove any direct formatting or separately added lines that conflict.

**The opening content is essential to the reader's understanding of the whole document.** Establish what the document covers, why it matters to this reader, and the main conclusion, decision, or task. Give enough context and scope to make the sections that follow easy to understand and show what the reader should learn or do.

## Writing quality

- Write for the intended reader. Identify the author, recipient, and what the reader needs to understand or do. Follow user instructions first, choose the requested document format, and preserve the style of an existing document or supplied reference.
- Write directly in the author's voice, using “I” or “we” when appropriate. Present the update, recommendation, or request to the recipient. Match the author's tone and relationship to that audience; do not invent experience, authority, commitments, or facts from style examples.
- Lead with the conclusion, decision, or request. Use concrete subjects, strong verbs, and natural sentences. State what changed, why it matters, and what evidence or constraint supports the claim. Keep necessary qualifications and distinguish facts, interpretation, recommendations, and uncertainty.
- Remove stock formulas, slogans, inflated significance, vague abstractions, unsupported authorities, canned empathy, and ornamental transitions. Avoid conspicuous rhetorical triads, forced contrasts, repetitive cadence, and punctuation used only for emphasis. Judge these patterns in context; an isolated phrase, accurate technical term, or useful contrast is not automatically a defect.
- Review both the writing and the rendered document. Check that claims are supported, the author's voice is consistent, and every page is readable and free of layout defects. Do not mention this editorial framework in the delivered document unless asked.

Before formatting, read the title and section headings as an outline. Write connected paragraphs that explain relationships, and replace compressed labels or unnecessary compounds with natural wording. Preserve the source's meaning, including uncertainty, conditions, time periods, and comparisons. Use punctuation and passive voice in body text when they improve precision.

For the review steps, examples, and more context, read the writing quality guidelines.


Use this skill when you need to create or modify `.docx`, Word, or Google Docs-targeted document artifacts **in this container environment** and verify them visually.

## Design standards for document generation

For generating new documents or major rewrite/repackages, follow the design standards below unless the user explicitly requests otherwise. The user's instructions always take precedence; otherwise, adhere to these standards.

When creating the document design, do not compromise on the content and make factual/technical errors. Do not produce something that looks polished but not actually what the user requested.

It is very important that the document is professional and aesthetically pleasing. As such, you should follow this general workflow to make your final delivered document:

1. Before you make the DOCX, please first think about the high-level design of the DOCX:
   - Before creating the document, decide what kind of document it is (for example, a memo, report, SOP, workflow, form, proposal, or manual) and design accordingly. In general, you shall create documents which are professional, visually polished, and aesthetically pleasing. However, you should also calibrate the level of styling to the document's purpose: for formal, serious, or highly utilitarian documents, visual appeal should come mainly from strong typography, spacing, hierarchy, and overall polish rather than expressive styling. The goal is for the document's visual character to feel appropriate to its real-world use case, with readability and usability always taking priority.
   - You should make documents that feel visually natural. If a human looks at your document, they should find the design natural and smooth. This is very important; please think carefully about how to achieve this.
   - Think about how you would like the first page to be organized. How about subsequent pages? What about the placement of the title? What does the heading ladder look like? Should there be a clear hierarchy? etc
   - Would you like to include visual components, such as tables, checklists, images, etc? If yes, then plan out the design for each component.
   - Think about the general spacing and layout. What will be the default body spacing? What page budget is allocated between packaging and substance? How will page breaks behave around tables and figures, since we must make sure to avoid large blank gaps, keep captions and their visuals together when possible, and keep content from becoming too wide by maintaining generous side margins so the page feels balanced and natural.
   - Think about font, type scale, consistent accent treatment, etc. Try to avoid forcing large chunks of small text into narrow areas. When space is tight, adjust font size, line breaks, alignment, or layout instead of cramming in more text.
2. Once you have a working DOCX, continue iterating until the entire document is polished and correct. After every change or edit, render the DOCX and review it carefully to evaluate the result. The plan from (1) should guide you, but it is only a flexible draft; you should update your decisions as needed throughout the revision process. Important: each time you render and reflect, you should check for both:
   1. Design aesthetics: the document should be aesthetically pleasing and easy to skim. Ask yourself: if a human were to look at my document, would they find it aesthetically nice? It should feel natural, smooth, and visually cohesive.
   2. Formatting issues that need to be fixed: e.g. text overlap, overflow, cramped spacing between adjacent elements, awkward spacing in tables/charts, awkward page breaks, etc. This is super important. Do not stop revising until all formatting issues are fixed.

While making and revising the DOCX, please adhere to and check against these quality reminders, to ensure the deliverable is visually high quality:

- Document density: Try to avoid having verbose dense walls of text, unless it's necessary. Avoid long runs of consecutive plain paragraphs or too many words before visual anchors. For some tasks this may be necessary (i.e. verbose legal documents); in those cases ignore this suggestion.
- Font: Use professional, easy-to-read font choices with appropriate size that is not too small. Usage of bold, underlines, and italics should be professional.
- Color: Set all document titles, subtitles, headings, subheadings, and page headers to black (`#000000`). Apply black to their styles and remove theme colors or direct formatting that would override it. For table header rows, use the fill and text colors specified in the table guidance below.
- Visuals: Consider using tables, diagrams, and other visual components when they improve comprehension, navigation, or usability.
- Tables:
  - Use tables intentionally and only for these purposes:
    - Comparing multiple items across the same set of attributes.
    - Presenting numeric data, metrics, specifications, pricing, dates, or other values readers need to scan across.
    - Showing a compact matrix, such as options × criteria, roles × responsibilities, or risks × mitigations.
    - Presenting repeated records with a consistent schema.
  - Keep long explanations, research findings, and proposed policy language in prose under descriptive headings. Use a compact matrix to summarize fields readers need to compare. Review consecutive table pages and replace tables that merely arrange narrative paragraphs into cells. Keep long tables only when readers need the full set of comparable records together.
  - Suggestions:
    - Set deliberate table/cell widths and heights instead of defaulting to full page width.
    - Choose column widths intentionally rather than giving every column equal width by default. Very short fields (for example: item number, checkbox, score, result, year, date, or status) should usually be kept compact, while wider columns should be reserved for longer content.
    - Avoid overly wide tables, and leave generous side margins so the layout feels natural.
    - Keep all text vertically centered and make deliberate horizontal alignment choices.
    - Ensure cell height avoids a crowded look. Leave clear vertical spacing between a table and its caption or following text.
  - Hard constraints:
    - Borders: Explicitly set outer and internal cell borders to light gray (`#D9D9D9`) so every table has visible borders.
    - Header colors: Choose light gray, dark gray, dark blue, or light blue header fills to suit the document; do not default every table to light gray. Keep related tables consistent. Use white header text on dark fills and black text on light fills.
    - Row shading: With a dark gray or dark blue header, alternate body-row backgrounds between white and a pale gray or pale blue tint. Keep the light gray borders visible.
    - To prevent clipping/overflow:
      - Never use fixed row heights that can truncate text; allow rows to expand with wrapped content.
      - Ensure cell padding and line spacing are sufficient so descenders/ascenders don't get clipped.
      - If content is tight, prefer (in order): wrap text -> adjust column widths -> reduce font slightly -> abbreviate headers/use two-line headers.
    - Padding / breathing room: Ensure text doesn't sit against cell borders or look "pinned" to the upper-left. Favor generous internal padding on all sides, and keep it consistent across the table.
    - Vertical alignment: In general, you should center your text vertically. Make sure that the content uses the available cell space naturally rather than clustering at the top.
    - Horizontal alignment: Do not default all body cells to top-left alignment. Choose horizontal alignment intentionally by column type: centered alignment often works best for short values, status fields, dates, numbers, and check indicators; left alignment is usually better for narrative or multi-line text.
    - Line height inside cells: Use line spacing that avoids a cramped feel and prevents ascenders/descenders from looking clipped. If a cell feels tight, adjust wrapping/width/padding before shrinking type.
    - Width + wrapping sanity check: Avoid default equal-width columns when the content in each column clearly has different sizes. Avoid lines that run so close to the right edge that the cell feels overfull. If this happens, prefer wrapping or column-width adjustments before reducing font size.
    - Spacing around tables: Keep clear separation between tables and surrounding text (especially the paragraph immediately above/below) so the layout doesn't feel stuck together. Captions and tables should stay visually paired, with deliberate spacing.
    - Quick visual QA pass: Look for text that appears "boundary-hugging", specifically content pressed against the top or left edge of a cell or sitting too close beneath a table. Also watch for overly narrow descriptive columns and short-value columns whose contents feel awkwardly pinned. Correct these issues through padding, alignment, wrapping, or small column-width adjustments.
- Forms / questionnaires: Design these as a usable form, not a spreadsheet.
  - Prioritize clear response options, obvious and well-sized check targets, readable scale labels, generous row height, clear section hierarchy, light visual structure. Please size fields and columns based on the content they hold rather than by equal-width table cells.
  - Use spacing, alignment, and subtle header/section styling to organize the page. Avoid dense full-grid borders, cramped layouts, and ambiguous numeric-only response areas.
- Coherence vs. fragmentation: In general, try to keep things to be one coherent representation rather than fragmented, if possible.
  - For example, don't split one logical dataset across multiple independent tables unless there's a clear, labeled reason.
  - For example, if a table must span across pages, continue to the next page with a repeated header and consistent column order
- Callouts: Do not use callout boxes, shaded note cards, accent-bar blocks, or boxed summaries and decision panels. Present this content as ordinary paragraphs, optionally with a bold lead-in. This applies whether the callout is built with a table, text box, shape, or paragraph shading/borders.
- Spacing: Please check rigorously for spacing issues. Please always use a natural amount of spacing between adjacent components. Use clear, generous vertical spacing between sections and paragraphs, and leave a bit of extra space between subheadings and the content that follows when it improves readability. Use indentation and alignment intentionally so the document's hierarchy is immediately clear. At the same time, avoid large "layout gaps" caused by a table or chart not fitting at the bottom of a page and getting pushed to the next one. If this happens, please try these suggestions:
  - moving the preceding paragraph(s) with it to the next page to keep the narrative cohesive
  - scaling the visual modestly or simplify labels without hurting readability, formatting, or aesthetics of the visual
  - Splitting the table/figure cleanly across multiple pages, but use repeated headers to make the page continuation clear.
- Text boxes: For text boxes, please follow the same breathing-room rules as the tables: make sure to use generous internal padding, intentional alignment, and sufficient line spacing so text never feels cramped, clipped, or pinned to the edges. Keep spacing around the text box clear so it remains visually distinct from surrounding content, and if the content feels tight, prefer adjusting box size, padding, or text wrapping before reducing font size.
- Layout/archetype: Remember to choose the right document archetype/template (proposal, SOP, workflow, form, handbook, etc.). Use a coherent style system. Once a style system is chosen, apply it consistently across headings, spacing, table treatments, and accent usage. If appropriate to the document type, include a cover page or front-matter elements such as title, subtitle, metadata, or branding.

### Note on page sizing

When creating a new DOCX, **always** default to the Letter size 8.5 x 11 inches, in Portrait orientation, unless the user specifies otherwise.

### Note on font sizing

Use a readable size appropriate to the text's role and typeface; ~11-12 pt is a good default for sustained prose. Use text 10 pt and below only if ideal for secondary roles or constrained tables/forms, and only when it remains comfortable at normal print or fit-width viewing. Do not shrink type merely to meet a page-count or compactness target. Follow explicit user typography instructions, but never at the expense of practical readability.

### Editing tasks (DOCX edits) — apply instead of major rewrite behavior

When the user asks to edit an existing document, preserve the original and make minimal, local changes:

- Prefer inline edits (small replacements) over rewriting whole paragraphs.
- Use clear inline annotations/comments at the point of change (margin comments or comment markers). Don’t move all feedback to the end.
- Keep the original structure unless there’s a strong reason; if a restructure is needed, do it surgically and explain via comments.
- Don’t “cross out everything and rewrite”; avoid heavy, blanket deletions. The goal is trackable improvements, not a fresh draft unless explicitly requested.

## Final response

- Final user-facing responses should focus on the requested document result and may include useful next steps. Do not link QA intermediates unless the user explicitly asks for them.

### Final response file references

- For a created or edited DOCX, mention each final file once using its backticked workspace path, such as `/workspace/Reports/launch-plan.docx`. Beeblio renders this path as a file chip the user can open. Summarize the result briefly.
- For a read-only answer, inspect the relevant pages and identify the source DOCX with its backticked workspace path. Include verified page numbers in ordinary prose when they help locate evidence.
- Do not guess page numbers or reference QA intermediates unless asked. Do not emit Codex-specific citation directives.
