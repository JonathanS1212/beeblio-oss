---
name: interactive-html-artifacts
description: Create or modify self-contained interactive HTML reports, research exhibits, explainers, and data dashboards that render reliably in Beeblio's editor and public share view.
---

# Interactive HTML Artifacts

Use this skill for ordinary `.html` or `.htm` artifacts intended to be opened in
Beeblio's HTML editor or shared publicly. Survey instruments are different: for
surveys, questionnaires, polls, and response collection, load `survey-forms` and
use `create_form` to make a `.form.html` file.

## Runtime contract

Produce one complete HTML document with its CSS and JavaScript inline. The preview
and public share view run it in a sandboxed iframe with these capabilities:

- HTML, inline CSS, inline SVG, Canvas, and inline JavaScript work.
- Forms, modal dialogs, popups, and user-initiated downloads work.
- The document has an opaque origin. It cannot access Beeblio's parent DOM,
  cookies, authenticated session, `localStorage`, IndexedDB, or other
  same-origin state. Keep state in memory and make downloads explicit when the
  user needs persistence.
- Top-level navigation is blocked. Links may navigate inside the iframe or open
  a new tab with `target="_blank" rel="noopener noreferrer"`.
- Remote requests remain subject to browser CORS and network availability. Do
  not make the artifact depend on a CDN, remote font, API, or analytics service
  unless the user explicitly needs it and accepts that the shared result may
  fail offline.
- Workspace-relative images, scripts, stylesheets, and data files are not a
  reliable part of an HTML public share. Embed small data directly, draw visuals
  with HTML/CSS/SVG/Canvas, or use a `data:` URL when practical.

Do not add React, JSX, TypeScript, npm packages, a bundler, a server, or multiple
support files. Do not include a Beeblio form marker or a script whose id is
`beeblio-form-definition`; those route the document into the survey runtime.

## Authoring workflow

1. Inspect the relevant data or existing HTML before changing it. Preserve the
   user's facts and distinguish supplied results from illustrative values.
2. For a new artifact, write a complete document with `<!doctype html>`,
   `<html lang>`, charset, viewport, title, inline `<style>`, semantic `<main>`,
   and a final inline `<script>` only when interaction is useful.
   When the HTML is the result of data analysis, generate it from a saved Python
   or JavaScript script and write the complete artifact under `/workspace`.
   Do not print the HTML in chat.
3. For an existing artifact, preserve working structure and unrelated content.
   Use `edit_document` for a unique localized change; use `write_file` when the
   complete document must be replaced or when `unsavedContent` is authoritative.
4. Make the initial view useful before any interaction. Show units, source notes,
   definitions, sample size, uncertainty, and limitations when relevant.
5. Verify that every control has an event handler, every anchor target exists,
   filters have a visible reset path, and empty/error states are understandable.
6. Save reports and final dashboards under `/workspace/4-Reports/` unless the
   user chose another destination. State the output path and important runtime
   limitations after writing it.

## Interaction patterns

- For section navigation, use real anchors such as
  `<a href="#methods">Methods</a>` with a matching `id="methods"`. A styled
  `<button>` without JavaScript does not navigate. Add
  `html { scroll-behavior: smooth; }`, `scroll-margin-top` on targets, and keep
  the navigation compact on narrow screens.
- Use `<button type="button">` for actions, then attach listeners after the DOM
  markup or on `DOMContentLoaded`. Prefer `addEventListener` over inline
  `onclick` attributes.
- Treat URLs, labels, and dataset strings as text. Insert them with
  `textContent`, not `innerHTML`, unless the markup is authored and controlled.
- Keep filters and calculations deterministic and local. Embed data as a JSON
  script block (`type="application/json"`) or a JavaScript constant, then render
  from it. Escape any literal `</script>` inside embedded data.
- Use progressive enhancement: core reading and anchor navigation should still
  work if a script errors. Disable or explain a control that cannot operate.
- Respect `prefers-reduced-motion`. Avoid autoplay, scroll hijacking, and
  continuous animation. Do not use `alert()` for ordinary feedback; use a live
  status element instead.
- If offering an export, create a `Blob`, generate an object URL on the click,
  click an `<a download>`, and revoke the URL afterward.

## Beeblio visual language

The iframe does not inherit `app/globals.css` or the app's loaded fonts. Define
the visual system inside every artifact. Start from these tokens, derived from
Beeblio's light theme, and adjust only when the user asks for a different style:

```css
:root {
  color-scheme: light;
  --background: oklch(97.5% 0.008 88);
  --foreground: oklch(23.5% 0.02 250);
  --card: oklch(99.5% 0.004 88);
  --card-foreground: var(--foreground);
  --primary: oklch(40% 0.085 245);
  --primary-foreground: oklch(98.5% 0.006 88);
  --secondary: oklch(93.5% 0.018 91);
  --muted: oklch(94.4% 0.011 88);
  --muted-foreground: oklch(52% 0.026 240);
  --accent: oklch(92% 0.035 235);
  --accent-foreground: oklch(28% 0.055 245);
  --brand-warm: oklch(72% 0.14 65);
  --border: oklch(88.2% 0.017 91);
  --ring: oklch(58% 0.1 245);
  --radius: 0.75rem;
  --shadow: 0 1px 2px rgb(20 31 48 / 0.06), 0 10px 30px rgb(20 31 48 / 0.06);
  font-family: Geist, Inter, ui-sans-serif, system-ui, -apple-system,
    BlinkMacSystemFont, "Segoe UI", sans-serif;
}
* { box-sizing: border-box; }
html { scroll-behavior: smooth; }
body {
  margin: 0;
  min-width: 0;
  background: var(--background);
  color: var(--foreground);
  line-height: 1.55;
  text-rendering: optimizeLegibility;
}
button, input, select, textarea { font: inherit; }
:focus-visible { outline: 3px solid color-mix(in oklab, var(--ring) 55%, transparent); outline-offset: 2px; }
::selection { background: oklch(83% 0.065 240 / 55%); }
```

Use a warm, quiet page; white elevated cards; restrained blue primary actions;
subtle borders; and the warm accent sparingly. Prefer a readable content width
around `72rem`, generous whitespace, tabular numerals for data, and a serif
display stack (`Newsreader, Iowan Old Style, Georgia, serif`) only for prominent
editorial headings. Do not imitate the surrounding editor toolbar inside the
artifact.

For charts, use a colorblind-safe palette and never encode a distinction by
color alone. Useful series colors are `#0072B2`, `#E69F00`, `#009E73`,
`#CC79A7`, `#D55E00`, `#56B4E9`, and `#F0E442`. Include direct labels, patterns,
or shapes where needed. Prefer semantic HTML tables for exact values and inline
SVG for charts; give SVGs an accessible name and a text/table alternative for
important results.

## Responsive and accessible baseline

- Design mobile-first and verify the document remains usable around 390 px,
  768 px, and desktop widths—the editor exposes those preview sizes.
- Avoid fixed page widths and viewport-height layouts that hide content. Use
  `min()`, `max()`, `clamp()`, flexible grids, and `overflow-x: auto` around
  genuinely wide tables.
- Sticky or fixed controls must not cover headings or content. Use a compact
  sticky navigation bar in normal flow when possible; at narrow widths allow it
  to wrap or scroll horizontally. Set `scroll-margin-top` on linked sections.
- Use landmarks, a logical heading hierarchy, labels for every input, native
  controls, keyboard-operable interactions, visible focus states, adequate
  contrast, and a polite `aria-live` region for dynamic status.
- Use concise prose, meaningful button text, formatted values with units, and
  `Intl.NumberFormat`/`Intl.DateTimeFormat` where appropriate.

Favor a polished, focused research artifact over a generic admin dashboard:
lead with the research question or finding, make evidence traceable, and keep
controls secondary to interpretation.
