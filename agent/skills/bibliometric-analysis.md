---
name: bibliometric-analysis
description: End-to-end bibliometric analysis (science mapping) of a research field — collect scholarly metadata from OpenAlex, screen it into a coding sheet, compute structured indicators, render an academic chart suite (trends, themes, keyword co-occurrence, co-citation, collaboration networks), and write insight-driven reports with research gaps. Use when the user wants to map a body of academic literature in any discipline, run a quantitative or systematic literature review, analyze citations, keywords, journals, authors, or countries, build co-citation / keyword / collaboration networks, or says "bibliometric analysis" or "science mapping".
---

# Bibliometric Analysis (Science Mapping)

Turn a research topic into a defensible map of its scholarly literature: a screened
corpus dataset, a structured metrics file, a chart suite, and a written report
with research-gap implications. The procedure is domain-agnostic — machine
learning, medicine, ecology, economics, education, or any other research field —
because Stage 0 pins the field-specific vocabulary (the **domain profile**) that
every later stage consumes. No stage may rely on a built-in field list.

Beeblio can use its native Python stack or compact JavaScript helpers at each
local processing stage:

| Stage | Beeblio route |
|---|---|
| Collect | `fetch_openalex_works` (host-side: writes result pages to the run directory, returns only a manifest — records never transit chat) |
| Screen / Insights | Saved Python with pandas/Polars, DuckDB, and NetworkX |
| Visualize | Saved Python with Matplotlib/Seaborn |
| Report | Markdown in `/workspace/4-Reports` (this workspace's native format) |

Never install packages at runtime or use direct network fetching in analysis
scripts; collection stays in `fetch_openalex_works`. Each stage below defines
its file contract so any stage can be re-run against an existing run directory.

## Ground rules

1. **Stages communicate only through files** — a coding-sheet CSV and an insights
   JSON. Keep the schemas byte-compatible and a stage can be rewritten without
   touching the others.
2. **One self-contained run directory per run**:
   `/workspace/3-Analysis/bibliometric/<YYYYMMDD_HHMM>_<topic-slug>/` holding the
   study design, raw pages, coding sheet, insights JSON, chart data, and charts.
   The final report goes to `/workspace/4-Reports/` (or a user-chosen path).
   Never scatter run artifacts across shared folders.
3. **Fail fast**: run stages in order; if a stage errors, stop and report rather
   than continuing with partial data.
4. **English is the default artifact language** — schema columns, category
   labels, indicator keys, chart titles, and the report. Switch the report (not
   the column names) to the user's working language only when they explicitly
   ask for it. Renaming columns requires migrating every downstream stage.

## Stage 0 — Scope the study

Before any collection, pin down and write into the run directory as
`study_design.md`:

- **Topic and angle** (e.g. "transformer language models", "microplastic
  toxicity", "flipped classrooms", "ESG perception").
- **Domain profile** — the field-specific settings Stages 1–5 consume: the
  studied-subject facet and its categories, theme/theory vocabulary for
  generic-bucket breakdown, stop-keywords, method-keyword extensions, publisher
  prefixes, and time-window depth. Full checklist at the end of this skill.
  Write the profile into `study_design.md` so the run is reproducible without
  chat history.
- **Time window** and document filter (default: articles from the last 10–15
  years, abstract required). Match field velocity — roughly 5 years for
  fast-moving fields (AI, emerging technologies), 20+ for mature or slow-cycling
  fields — and record the choice and its rationale.
- **Geographic/contextual focus**, if any.
- **Query set**: 3–5 search queries covering the field's main synonyms and
  adjacent framings (add a local-language variant if the field publishes in
  one). Volume comes from large pages, not many query series — every series
  costs request budget against OpenAlex's rate limits. Optionally
  sanity-check query coverage cheaply with `search_literature` (openalex)
  before committing.
- **Chart tier**: the core suite (13 charts, Stage 4) runs by default; offer the
  extended tier (co-citation and bibliographic-coupling networks, reference
  genealogy, theory charts, heatmaps, subject/collaboration/publisher
  diagnostics) explicitly, since it costs more. Include the theory charts only
  when the domain profile's theory facet is populated — an empty or
  "unspecified"-dominated facet produces noise, not analysis.
- **Politeness**: the collector joins OpenAlex's polite pool automatically with
  the user's Beeblio account email; nothing to configure unless the user wants
  a different contact address (then pass `mailto`).

## Stage 1 — Collect (OpenAlex via fetch_openalex_works)

**Output**: `coding_sheet.csv` — the canonical coding sheet.

### Collection call

One `fetch_openalex_works` call in search mode fetches everything:

- `queries`: the Stage 0 query set (≤6 per call — split larger sets across calls
  into the same `raw_pages/` directory).
- `destinationDir`: `<run-dir>/raw_pages`.
- `fromYear` / `toYear` from the study design; `requireAbstract: true` (default).
- `fields: "full"` — includes `abstract_inverted_index` and `referenced_works`,
  so no enrichment pass is ever needed.
- `perPage: 100–200` and `maxPagesPerQuery: 2–3` — fewer, larger requests keep
  the call under OpenAlex's rate limits (≤30 pages per call; split larger runs
  across calls into the same `raw_pages/` directory).
- `mailto` only to override the account email, which joins the polite pool
  automatically.

The tool writes one JSON array per page (`q<N>-p<NN>.json`) and returns a
manifest with file paths, per-page counts, distinct-work total, and any failed
requests. **Verify the manifest**: if requests failed, re-call the tool with
just those queries (same destination, files overwrite) rather than proceeding
with gaps. If the manifest reports `rateLimited`, wait about a minute first —
the tool holds a cooldown and will keep refusing while it is active. Never
fetch OpenAlex through `web_fetch` or relay records through chat.

### Scale caps (defaults)

With host-side collection the context budget is no longer the constraint — the
request budget is: **2–3 pages of 100–200 records per query, one to two calls,
and a final corpus of up to 500 kept works (`MAX_ROWS`)**. Corpus quality beats
size; state the final corpus size, the per-year stratification, and the
direction of the truncation bias in the report (Stage 5, rule 6).

### Record processing rules (in saved Python)

- **Deduplicate** across queries by OpenAlex work ID.
- **Select year-stratified, not citation-elite**: within each publication year,
  sort by citation count descending; then take works across years in proportion
  to each year's share of the retrieved pool until `MAX_ROWS`. Sorting the whole
  pool by citations crowds out recent work (which has not had time to
  accumulate citations) and biases every downstream trend, theme, and
  collaboration chart toward the old and established; stratification keeps the
  corpus representative of the field's actual age mix.
- **Reconstruct abstracts** from `abstract_inverted_index`: it maps each word to
  its positions — flatten to `(position, word)` pairs, sort by position, join
  with spaces.
- **Authors**: `Last, First` format, first 4 authors, then `et al.`; `;`-separated.
- **Collaboration type** from authorships' institution country codes:
  1 author → `Single-author`; >1 country → `Multi-country`; 1 country →
  `Single-country`; no country data → `Multi-author (unknown affiliation)`.
- **Citations per year** = `cited_by_count / max(current_year − publication_year, 1)`.
- **Studied subject** — the domain profile's facet: the concrete entity,
  technology, system, condition, or instrument the field studies. Infer by
  keyword match on title (first matching category wins); no match →
  `Not specific / multiple`. Choose the facet from the field, not from this
  skill:

  | Field | Facet | Example categories |
  |---|---|---|
  | Communication / media studies | platform | Twitter/X, TikTok, Instagram, YouTube |
  | Machine learning | model family | CNNs, RNNs, transformers, diffusion models, LLM agents |
  | Health sciences | condition / intervention | diabetes, CRISPR, mindfulness, vaccination |
  | Environmental science | stressor / system | microplastics, coral reefs, wetlands |
  | Education | setting / tool | MOOCs, gamification, blended learning |
  | Economics / policy | instrument / market | microfinance, carbon pricing, crypto |

  Each category is a label plus its title-keyword patterns (e.g. Twitter/X ←
  `twitter|tweet|x.com`). If nearly everything lands in `Not specific /
  multiple`, extend matching to author keywords; if two categories always
  co-occur, merge them in the profile.
- **Theme / theory inference** from the OpenAlex hierarchy. OpenAlex is
  deprecating `concepts` in favor of `topics` (field → subfield → topic) — if
  `concepts` is absent, anchor on `topics` levels instead. Any equivalent leveled
  taxonomy works:
  - `Main_Theme` = first level-2 concept; fallback first level-1.
  - `Subfield` = first level-1 concept.
  - `Theory_Framework` = first level-3 concept, else "unspecified".
  - `Research_Method` = up to 2 concepts whose names match method-ish keywords
    (analysis, method, model, algorithm, technique, approach, framework, survey,
    experiment, study, evaluation, review, mapping, mining, network, simulation)
    — extend this list with the field's own method vocabulary (e.g. randomized
    controlled trial, genome-wide association, finite element, ethnography).
  - In fields where "theory" is not a native organizing category (much of the
    experimental sciences), the same columns can carry the field's equivalent —
    paradigm, approach school, model tradition. Keep the column names stable and
    record the relabeling in the domain profile.

Pass the raw-pages directory and coding-sheet destination as command-line
arguments; keep the assembly script in the run directory so the stage is
re-runnable without embedding records in source.

### Canonical coding-sheet schema

Write with `research.writeTable` (UTF-8, no BOM — if the user needs Excel, tell
them to import as UTF-8):

| Column | Content |
|---|---|
| `Document_Code` | Sequential ID `D001, D002, …` |
| `Title` | Title |
| `Authors` | `Last, First; …; et al.` |
| `Publication_Year` | Publication year |
| `Journal_or_Proceedings` | Journal / proceedings name |
| `Volume_Pages` | `vol(issue), first–last` |
| `DOI` | Bare DOI (no `https://doi.org/` prefix) |
| `Language` | Language label |
| `Source_Database` | Source database (OpenAlex) |
| `First_Author_Affiliation` | First author's institution |
| `Affiliation_Country` | First affiliation country code (ISO-2) |
| `All_Affiliation_Countries` | All distinct country codes, `;`-joined |
| `Researcher_Origin` | Researcher origin (country code, else unknown) |
| `Collaboration` | Collaboration type (taxonomy above) |
| `Total_Citations` | Citation count |
| `Citations_per_Year` | Citations per year |
| `Author_Keywords` | Author keywords, `;`-joined (top 6) |
| `Index_Keywords` | Index keywords from level-1/2 concepts |
| `Main_Theme` | Main theme (inferred) |
| `Subfield` | Subfield (inferred) |
| `Theory_Framework` | Theory/framework (inferred) |
| `Research_Method` | Method (inferred) |
| `Studied_Subject` | Studied-subject facet (inferred from the domain profile) |
| `Inclusion_Criteria` | `Included` / `Excluded` (set in Stage 2) |
| `Exclusion_Reason` | Exclusion reason (set in Stage 2) |
| `Referenced_Works` | Cited OpenAlex work IDs, `;`-joined |
| `Abstract` | Reconstructed abstract |

### Batch metadata resolution (extended tier only)

To label referenced works for the co-citation network and genealogy, call
`fetch_openalex_works` in work-IDs mode: pass the top ~100 most-cited
`Referenced_Works` IDs as `workIds` with `fields: "labels"`
(id, title, authorships, publication_year), writing `raw_pages/labels-*.json`.
Label format: `LastName (Year)`.

## Stage 2 — Screen (automated inclusion/exclusion)

**Input/output**: the coding sheet — rewrite it with `Inclusion_Criteria` /
`Exclusion_Reason` updated (default every row to `Included`). In-place rewrite
is allowed here because the sheet lives in the run directory, not `/workspace/2-Data`.

Apply, in order:

1. **Duplicates**: normalize titles to lowercase alphanumerics only; second and
   later occurrences → exclude, reason `Duplicate`.
2. **Abstract adequacy**: fewer than 30 words → exclude (incomplete records,
   editorials, non-research items).
3. **Topical relevance** (only when the study has a geographic/contextual focus):
   require signals of the focus context in title/abstract. Also drop papers where
   the context is only a marginal data point — operational test: no context
   signal in the title AND the context (e.g. country) absent from author
   affiliations AND the abstract name-drops it alongside several other contexts.

Write a PRISMA-style funnel as `screening_summary.md`: records identified
(retrieved across queries) → after cross-query deduplication → screened →
excluded per rule (counts per reason) → included. Quote the same funnel
numbers in the report's methods section. Keep excluded rows in the sheet
(audit trail), never delete them.

## Stage 3 — Extract insights (JSON)

**Input**: only rows with `Inclusion_Criteria == Included`.
**Output**: `insights_data.json` — one key per indicator, each a ranked
`{label: count}` map or per-year structure. This file is the numeric backbone the
report quotes verbatim; every number in the report must be traceable to it.

Indicators:

- `publication_trend` — articles per year.
- `theme_distribution` / `theme_distribution_detail` — theme counts (raw / after
  breaking generic buckets apart with the domain profile's keyword rules over
  title/keywords/abstract).
- `researcher_origin`, `collaboration`, `top_institutions`, `top_journals`, `top_countries`.
- `subject_distribution` / `subject_evolution` — studied-subject facet counts and
  per-year counts (drives the extended-tier subject chart).
- `top_keywords` — from author + index keywords: split on `;`/`,`, lowercase,
  collapse whitespace, then **normalize before counting** — merge hyphen and
  spacing variants (`e-learning` = `e learning`), collapse singular/plural
  pairs, and merge the domain profile's synonym map (field terms that name one
  concept). Then drop tokens <3 or ≥50 chars, drop stop-keywords
  (domain-generic terms — anything that would top every chart without
  informing), dedupe per article, count. Without normalization the
  co-occurrence network splits one concept into several near-duplicate nodes.
- `country_collaboration` — for each multi-country article, count all sorted country pairs.
- `bibliographic_coupling` — for each pair of corpus articles, the number of
  `Referenced_Works` they share; keep pairs with ≥2 shared references. The
  coupling counterpart to co-citation: it clusters current work built on the
  same foundations, and needs no extra fetching.
- `citations` — per year: `{total_articles, total_citations, avg_citations}`.
- `theory_distribution`, `theory_distribution_detail`, `theory_evolution` (theory
  counts per year; keep theories with ≥5 articles, or ≥3 for a smaller corpus).
- `theory_vs_method` and `theme_vs_method` — sparse pairs; also emit each matrix
  as a row-form array `[{row, col, count}, …]` so plotting code can consume it
  directly as a heatmap.
- `citation_impact_by_theme` / `_by_collaboration` / `_by_language` / `_by_publisher` —
  avg, n, total citations per group (require n ≥ 2).
- `publisher_distribution` — publisher tier by DOI prefix. Reference prefix map:
  `10.1080` Taylor & Francis, `10.3390` MDPI, `10.1177` SAGE, `10.1007` Springer,
  `10.1017` Cambridge UP, `10.1093` Oxford UP, `10.1016` Elsevier, `10.1002`/`10.1111`
  Wiley, `10.1186` BMC, `10.3389` Frontiers, `10.1145` ACM, `10.1109` IEEE,
  `10.1038` Springer Nature, `10.1126` AAAS, `10.1073` PNAS, `10.1021` ACS,
  `10.1039` RSC, `10.1371` PLOS, `10.48550` arXiv (→ preprint), `10.2991`
  Atlantis Press (→ proceedings). Other `10.x` → other journal; no DOI →
  `No DOI`. Extend with the prefixes the field actually publishes in.

## Stage 4 — Visualize

**Input**: screened coding sheet + insights JSON (+ label batches for
extended-tier networks). **Output**: PNG charts in the run directory's `charts/`
folder from a saved Python plotting script. Follow `data-visualization-styling`;
additionally here:

- Keep simple filters and aggregations in pandas/Polars/DuckDB code rather than
  creating chart-only intermediate datasets. Write small derived chart-data
  files only when they improve auditability or are reused across figures.
- Render each chart to an explicit output path and verify it is non-empty.
- Save the plotting script and a compact chart manifest containing source paths,
  filters, thresholds, and output paths for reproducibility.
- Every chart states its n and thresholds in the title or caption.

### Chart catalog (core = default; extended = on request only)

| # | Output name | Tier | Chart | Content & parameters |
|---|---|---|---|---|
| 1 | `publication_trend` | core | bar + line | Articles per year; annotate bar values (text mark layer) |
| 2 | `theme_distribution` | core | horizontal bar | Top 12 themes |
| 3 | `theme_distribution_detail` | core | horizontal bar | Themes after generic-bucket breakdown; color-code inferred sub-themes vs original |
| 4 | `collaboration_type` | core | horizontal bar | Collaboration-type counts |
| 5 | `top_institutions` | core | horizontal bar | Top 15 institutions by first-author affiliation |
| 6 | `top_journals` | core | horizontal bar | Top 15 journals |
| 7 | `top_countries` | core | vertical bar | Top 12 countries (map ISO codes to names in the chart-data rows) |
| 8 | `keyword_cooccurrence` | core | network | Keyword co-occurrence; keep keywords with freq ≥2, cap ~40 nodes, edge if co-occur ≥2, drop isolates; node size ∝ frequency, edge width ∝ weight, color by degree; label nodes with freq ≥3 |
| 9 | `country_collaboration` | core | network | Countries as nodes, pair counts as weighted edges |
| 10 | `citations_per_year` | core | 2 panels | Avg citations/year (line + fill) over total citations (bars) + article count (line, secondary axis) |
| 11 | `theme_evolution` | core | multi-line | Top 7 themes per year, full year index (zero-filled) |
| 12 | `top_authors` | core | horizontal bar | Authors ranked by corpus-wide summed citations. Caveat: the schema truncates `Authors` at 4 + `et al.`, so 5th+ authors are undercounted — state this limitation under the chart |
| 13 | `top_theories` | extended | horizontal bar | Top ~14 theories; color-code inferred vs explicit; only when the theory facet is populated |
| 14 | `theory_evolution` | extended | stacked area | Top 8 theories over time; same condition as #13 |
| 15 | `citation_impact_by_theme` | core | horizontal bar | Avg citations per theme, label `(n=…)` |
| 16 | `co_citation_network` | extended | network | Co-citation of `Referenced_Works`; top ~35 most-cited refs, edge ≥2 co-citations; labels `Author (Year)` from batch metadata |
| 17 | `reference_genealogy` | extended | timeline scatter | Top ~20 most-cited references at their publication year; bubble size ∝ corpus citations; skip entries with unresolved metadata |
| 18 | `theory_vs_method` | extended | heatmap | Theory × method counts (scale thresholds to the corpus size) |
| 19 | `theme_vs_method` | extended | heatmap | Theme × method counts (≥2 each side) |
| 20 | `citation_impact_by_collaboration` | extended | vertical bar | Avg citations per collaboration type |
| 21 | `subject_evolution` | extended | multi-line | Studied-subject articles per year (facet categories from the domain profile) |
| 22 | `publisher_distribution` | extended | pie + bar | Publisher-tier share + avg citations per tier |
| 23 | `bibliographic_coupling` | extended | network | Corpus articles as nodes (label `First author (Year)`), edges = shared `Referenced_Works` count, keep edges ≥2, cap ~40 nodes; reveals clusters of current work on shared foundations |

The extended tier is exploratory/diagnostic: exclude it from formal reports
unless it answers a stated research question.

### Networks on a deterministic layout

Use NetworkX with an explicit seed for deterministic force-directed layouts and
write `<name>_layout.json` as row-form `{nodes: [{id, x, y, size, degree, label}], edges: [{x1, y1, x2, y2, weight}]}`.
Render with Matplotlib: draw edges first, then nodes sized by frequency and
colored by degree, with labels only for the most important nodes.
Count pair co-occurrences with the sorted-pairs trick: for each article take its
deduplicated item set, generate all 2-combinations of the sorted set, increment
pair counters; then filter by thresholds, cap node count, lay out.

### Visual style (academic, print-safe)

Configure once in the plotting script (Matplotlib rcParams or a Seaborn theme):
serif font family, base size 11, bold titles; no top/right spines; dashed
light-gray grid behind data; white background. Muted palette — navy `#2B4C7E`,
sage `#5B8C5A`, brick `#A45A52`, steel `#6B7AA1`, tan `#C49A6C`, warm gray
`#7A6C5D` (warm tones for *inferred* categories, cool for *original* — legend
explains the distinction). Always label values on bars; wrap long category
labels onto 2–3 lines.

## Stage 5 — Report

**Inputs**: insights JSON + charts + (if provided) the user's research proposal.
**Outputs**: an analytic-memos document (`visualizations_insights.md`) in the run
directory and/or a findings report in `/workspace/4-Reports/`. English by
default; the user's working language when they explicitly ask. Embed charts
with document-relative image links (e.g.
`../3-Analysis/bibliometric/<run>/charts/publication_trend.png` from a report
in `4-Reports/`) and verify each target exists before finishing. When the
report singles out specific works
(top-cited papers, reference genealogy), cite them with `[@citation-key]`
tokens: add the matching entries with `update_bibliography` `add_papers`
first, copying the returned keys exactly.
Corpus-level statistics need no citation tokens — they trace to `insights_data.json`.

Rules learned the hard way — follow them:

1. **Never let a generic category dominate.** If one bucket like
   "Machine learning (general)" or "unspecified theory" tops a distribution,
   break it down with the domain profile's keyword rules over
   title/keywords/abstract and recompute before charting and reporting. Same
   for "researcher origin" — resolve to institutions.
2. **One analytic memo per chart**: *Key insight* → interpretation → historical /
   contextual explanation. Numbers must come from the insights JSON, not
   eyeballed from charts.
3. **Separate diagnostic charts from report charts.** The extended tier is
   exploratory; keep it out of formal reports unless it answers a stated
   research question.
4. **Align with the research paradigm** stated in the proposal, when it states
   one (epistemology, methodological framing) — findings must speak its
   language, at the qualification level the user is working at.
5. **End with research gaps**: sparse themes, understudied subjects, missing
   contexts or regions, absent collaboration patterns are the deliverable —
   they justify the next study.
6. **Disclose corpus construction.** State the sampling frame, query recall
   caveats, per-year stratification, corpus size, and what the caps exclude.
   A truncated, stratified sample is defensible only when its biases are
   visible to the reader; report the PRISMA funnel from Stage 2 in the methods
   section.

## Orchestration

Run order: **collect → screen → insights → visualize → report**, each stage
reading the previous stage's files from the shared run directory. The run directory is the
orchestrator, so re-running a single stage against an existing run directory
must work — every stage takes the run directory as its target. Verify each
stage's outputs exist before starting the next.

A full default run (500-work corpus, core chart suite) fits comfortably in one
session because collection writes files host-side. Splitting into a data session
(Stages 0–3) and a reporting session (Stages 4–5) remains useful for the full
23-chart extended suite, which spends most of its budget on chart
specifications and report text.

## Domain profile checklist

There is no default field — complete this profile in Stage 0 for **every** run,
whatever the discipline, and record it in `study_design.md`:

- [ ] **Studied-subject facet**: what concrete entity the field studies
  (platform, model family, condition, stressor, instrument…), with category
  labels + title-keyword patterns (Stage 1 inference; drives
  `Studied_Subject`, `subject_distribution`, `subject_evolution`)
- [ ] **Query set**: synonyms + adjacent framings, plus a local-language
  variant if the field publishes in one
- [ ] **Relevance signals** for the geographic/contextual focus, if any
  (Stage 2, rule 3)
- [ ] **Theme/theory keyword rules** for generic-bucket breakdown
  (Stage 3 indicators; Stage 5, rule 1)
- [ ] **Stop-keyword list** — terms that are generic *within this field*
- [ ] **Method-keyword extensions** — the field's own method vocabulary
- [ ] **Publisher prefixes** the field's journals actually use
- [ ] **Time-window depth** matched to field velocity
