---
name: survey-forms
description: Build and manage survey forms, questionnaires, feedback forms, and polls (*.form.html) with the create_form tool; analyze their collected responses.
---

# Survey Form Procedure

Beeblio forms are data-collection instruments for research: surveys, course evaluations,
questionnaires, RSVPs, registration forms, polls. A form is one self-contained
`*.form.html` file in the project workspace. The user can edit it visually (it opens in
a form builder) or share it publicly with the Share button; every submission from a
public form is appended to a sibling CSV file automatically.

## Creating or editing a form

Always use the `create_form` tool — **never `write_file` on a `*.form.html` file**.
You provide a JSON definition (title, description, ordered blocks); the tool generates
the complete styled, self-contained HTML.

- Forms always live directly in `/workspace/2-Data/` (they appear in the project's Forms panel
  alongside their responses CSV). The tool defaults there; if you pass a custom `path`, keep it
  inside that folder.
- To edit an existing form: `read_file` it, find the embedded
  `id="beeblio-form-definition"` JSON block, adjust that definition, and call
  `create_form` again with the same `path`. Do not retype the HTML.
- Load this skill before building forms with many blocks or matrix/scale questions.

## Block types

Question blocks (all accept `label`, `help`, `required`):

| Type | Purpose | Extra fields |
| --- | --- | --- |
| `shortText` | one-line answer | `placeholder` |
| `longText` | paragraph answer | `placeholder` |
| `email` | email address | — |
| `number` | numeric answer | `min`, `max` |
| `date` | date picker | — |
| `multipleChoice` | one of N radio options | `options`, `otherOption` |
| `checkboxes` | any of N options | `options`, `otherOption` |
| `dropdown` | one of N in a select | `options` |
| `linearScale` | Likert scale | `scale: {from, to, fromLabel, toLabel}` (default 1–5) |
| `rating` | 1–N stars | `maxStars` (default 5) |
| `matrix` | one choice per grid row | `rows`, `columns` |

Structure blocks: `section` (page break with `title`/`description`) and
`statement` (display-only `title`/`body`).

Block ids and CSV column names are derived automatically from labels — you usually
should NOT pass ids. Keep labels distinct per form so columns stay readable
(duplicates get `_2` suffixes).

## Good instrument design (follow unless told otherwise)

- Start with a short `description` explaining purpose, anonymity, and time to complete.
- Group long forms with `section` blocks (one theme per page).
- Use `linearScale` with labeled endpoints for agreement/attitude items (e.g. 1–5,
  "Strongly disagree" → "Strongly agree"); keep scales consistent within a form.
- Use `matrix` for batteries of items sharing the same response options.
- Mark `required` only for questions you truly need; never require free-text fields
  respondents may not have (names, emails) unless the user asks.
- Add a closing `statement` or `confirmationMessage` thanking respondents.
- Offer an `otherOption` on choice questions about categories (roles, fields, tools).

## Responses

- Submissions land in `<form-name>.responses.csv` next to the form (created on first
  submission). Columns: `submitted_at` (UTC ISO timestamp), then one column per
  question; matrix rows flatten to one column each; multi-selects join with `; `.
- Only submissions through a **public share link** are recorded; the builder preview
  and in-app preview do not write data.
- Editing a form after responses exist is safe: new questions append new columns and
  old rows stay blank. Do not delete the responses file to "reset" unless asked.
- To analyze results, use a saved Python script with pandas/Polars and the relevant statistical libraries. Report response counts and missing values honestly and validate them before interpretation.

## After building a form

Tell the user the form path, question count, and that they can open it to edit
visually or use Share → Public link to start collecting responses. Use `open_file`
to show it to them.
