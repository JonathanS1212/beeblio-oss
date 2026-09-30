---
name: pptx
description: "Create and edit PowerPoint presentations: design polished decks from scratch with pptxgenjs, edit or fill existing .pptx files with python-pptx (text replacement, slide cloning, template inheritance), embed native charts, icons, and speaker notes, and QA-render slides with LibreOffice."
---

# Part 1 · Slide Design Best Practices

> **Local runtime:** execute commands with `bash` on the user's computer. Install missing tools locally if needed. Resolve `<skill_directory>` as `$BEEBLIO_SKILLS_DIR/pptx`. For read-only questions about a deck, `read_office` is a lighter alternative.

In one sentence: **don't make boring slides.** Bullet points on a white background are forgettable.

But "not boring" is not "flashy." The goal is a deck that looks **ready to use in real life** — the kind you could drop into a real meeting, class, or client pitch without editing.

## 1. Decide three things before you start

**① Pick a content-informed color palette**
The palette should feel designed *for this topic*. A good test: if you could drop your colors into a completely unrelated deck and it would still "work," your choices aren't specific enough. For a deck about Changsha, "chili red + warm gold + deep ink" beats a generic blue.

**② Dominance, not equality**
One color should dominate 60–70% of the visual weight, supported by 1–2 secondary tones and one sharp accent. **Never give all colors equal weight.**

**③ Dark/light contrast + a visual motif**

- "Sandwich" structure: **dark backgrounds** for the title and closing slides, **light backgrounds** for content slides. Or commit to dark throughout for a premium feel.
- Pick **one** signature motif and repeat it on every slide: rounded image frames, icons/numbers/single characters inside colored circles, etc.
- ⚠️ **Do NOT** use a "color bar / accent stripe / sidebar strip" as your motif — that's a hallmark of AI-generated slides (see the avoid list).

## 2. Color palette reference (don't default to blue)

**Prefer deriving your own topic-specific palette** (per §1 ① — content-informed colors beat generic ones). The table below is **inspiration, not a menu**: it illustrates the dominance + contrast principle. Feel free to invent other palettes that fit your topic — or, when the topic is generic or you want a safe start, pick a row directly.

| Theme              | Primary               | Secondary             | Accent              |
| ------------------ | --------------------- | --------------------- | ------------------- |
| Midnight Executive | `1E2761` navy       | `CADCFC` ice blue   | `FFFFFF` white    |
| Forest & Moss      | `2C5F2D` forest     | `97BC62` moss       | `F5F5F5` cream    |
| Coral Energy       | `F96167` coral      | `F9E795` gold       | `2F3C7E` navy     |
| Warm Terracotta    | `B85042` terracotta | `E7E8D1` sand       | `A7BEAE` sage     |
| Ocean Gradient     | `065A82` deep blue  | `1C7293` teal       | `21295C` midnight |
| Charcoal Minimal   | `36454F` charcoal   | `F2F2F2` off-white  | `212121` black    |
| Teal Trust         | `028090` teal       | `00A896` seafoam    | `02C39A` mint     |
| Berry & Cream      | `6D2E46` berry      | `A26769` dusty rose | `ECE2D0` cream    |
| Sage Calm          | `84B59F` sage       | `69A297` eucalyptus | `50808E` slate    |
| Cherry Bold        | `990011` cherry     | `FCF6F5` off-white  | `2F3C7E` navy     |

## 3. Layout for each slide

**Every slide needs a visual element** — image, chart, icon, or shape. Text-only slides are forgettable.

**Layout options (vary them across slides):**

- Two columns (text left, illustration/figure right)
- Icon + text rows (icon in a colored circle, bold header, description below)
- 2×2 or 2×3 grid (image on one side, grid of content blocks on the other)
- Half-bleed image (full left/right side) with content overlay

**Data display:**

- Large stat callouts (numbers 60–72pt with a small label below)
- Comparison columns (before/after, pros/cons, side-by-side options)
- Timeline / process flow (numbered steps, arrows)

**Visual polish:**

- Small colored circle + icon next to section headers
- Italic accent text for key stats or taglines

## 4. Typography

**Key insight:** the font names you write into the `.pptx` are rendered by the **user's PowerPoint**, not by your build environment. If you preview via LibreOffice, it substitutes fonts it doesn't have — and some substitutes have different character widths, so the preview's "overflow / fits" can disagree with the real deck.

- **Safe fonts** (render true-to-width in preview *and* ship with Office): **Arial, Calibri, Cambria, Times New Roman, Courier New, Bookman Old Style, Century Schoolbook**. Use these for body text and anything where fit matters.
- **Headers with personality at zero risk**: pair a safe serif header (Cambria / Bookman Old Style / Century Schoolbook) with a safe sans body (Calibri / Arial) — contrast without losing reliable overflow checks.
- **Preview-unreliable fonts** (substitute has different widths — overflow checks can be wrong): Georgia, Trebuchet MS, Impact, Arial Black, Garamond, Consolas, Palatino Linotype, Calibri Light. Fine for titles/accents with ~10% slack; don't trust the preview's apparent fit.
- **Never default to Aptos** (Office's post-2023 default) — no metric-compatible substitute in the preview environment, and missing from older Office installs, so it's unreliable on both ends.

| Element        | Size           |
| -------------- | -------------- |
| Slide title    | 36–44pt bold  |
| Section header | 20–24pt bold  |
| Body text      | 14–16pt       |
| Captions       | 10–12pt muted |

> **CJK note (added practice):** for Chinese/Japanese/Korean text, use a widely available font like **Microsoft YaHei** (present on all Windows, has a Mac substitute). But python-pptx / pptxgenjs set only the Latin face `<a:latin>` by default; For previews, installing **Noto Sans CJK SC** displays Chinese correctly — and since CJK glyphs are essentially full-width/monospaced, preview widths closely match YaHei, so overflow checks are fairly trustworthy.

## 5. Spacing

- Minimum margins **0.5"**
- **0.3–0.5"** between content blocks
- Leave breathing room — don't fill every inch

## 6.Fonts

CJK fonts are required for Chinese documents (without them Chinese renders as boxes □).

**CJK font principles:**

- Use **at most two Chinese families** per deck — one sans as the workhorse, plus at most one serif/handwriting face as accent.
- **Create hierarchy with weight, not by swapping fonts** — Noto Sans SC ships the full weight range; use bold for titles, regular for body.
- **Default to a sans (e.g. Noto Sans SC) for serious office / reporting decks**; reserve handwriting/楷体 faces (e.g. LXGW WenKai) for covers, pull-quotes, or educational accents — never for body paragraphs.
- Always keep a CJK fallback (e.g. WenQuanYi Zen Hei) so missing glyphs never render as boxes □.

### Fonts in the local environment

Noto Sans CJK SC and a Noto CJK fallback are preinstalled under `/usr/share/fonts` (plus DejaVu and Liberation). No font installation is ever needed; verify coverage with `fc-list :lang=zh` if a render shows boxes □.

## 7. Avoid list (sources of an "AI-generated" look)

- ❌ **Don't reuse the same layout on every slide** — vary between columns, cards, and callouts
- ❌ **Don't center body text** — left-align paragraphs and lists; center only titles
- ❌ **Make size contrast big enough** — titles need 36pt+ to stand out from 14–16pt body
- ❌ **Don't default to blue** — choose colors that reflect the topic
- ❌ **Don't mix spacing randomly** — pick 0.3" or 0.5" and use it consistently
- ❌ **Don't style one slide and leave the rest plain** — commit fully or keep it simple throughout
- ❌ **Don't create text-only slides** — add images/icons/charts/shapes
- ❌ **Mind text-box padding** — to align text with shapes/lines, set the text box `margin` to 0 (or offset the shape to compensate)
- ❌ **Don't use low contrast** — icons and text both need strong contrast against the background; avoid light-on-light or dark-on-dark
- 🚫 **Never add a decorative underline under titles** — a classic AI-slide tell; use whitespace or background color instead
- 🚫 **Never add decorative color bars / accent stripes** — including full-width header/footer bands, vertical sidebar strips, thin colored strips along a card edge, and "single-side borders" on rectangles. To set a card apart, use a **subtle background tint / shadow / icon**, not an edge stripe
- ❌ **Don't default to cream/beige backgrounds** — when unspecified, use white `FFFFFF` or your brand color; avoid warm-neutral defaults like `F5F5DC`, `FAF0E6`, `FAEBD7`, `FFF8E1`
- ❌ **Don't let text overflow its shape** — if it doesn't fit, reduce the font, split across slides, or enlarge the container; never leave content cut off or spilling out

## 8. QA (recommended)

**Content QA:** check for missing content, typos, wrong order; when using a template, grep for leftover placeholders (`xxx`, `lorem`, `TODO`, `[insert`, etc.).

VIsual QA when needed: find and fix overlaps, overflow, misalignment). Find and fix those, then stop — don't chase pixel-level "perfection."

---

# Part 2 · pptxgenjs in Depth

pptxgenjs generates `.pptx` files in **JavaScript / Node.js**. Coordinates are in **inches**.

## Setup & basic structure

```javascript
const pptxgen = require("pptxgenjs");

let pres = new pptxgen();
pres.layout = 'LAYOUT_16x9';   // or LAYOUT_16x10 / LAYOUT_4x3 / LAYOUT_WIDE
pres.author = 'Your Name';
pres.title  = 'Presentation Title';

let slide = pres.addSlide();
slide.addText("Hello World!", { x: 0.5, y: 0.5, fontSize: 36, color: "363636" });

pres.writeFile({ fileName: "Presentation.pptx" }).then(() => console.log("done"));
```

> ⚠️ pptxgenjs writes an **uncompressed ZIP** (with empty directory stubs), which bloats the file; its `compression: true` option has no effect. Recompress (rezip) the output once after writing.

## Layout dimensions

| Layout           | Size (inches)         |
| ---------------- | --------------------- |
| `LAYOUT_16x9`  | 10 × 5.625 (default) |
| `LAYOUT_16x10` | 10 × 6.25            |
| `LAYOUT_4x3`   | 10 × 7.5             |
| `LAYOUT_WIDE`  | 13.3 × 7.5           |

## Text & formatting

```javascript
// Basic text
slide.addText("Simple Text", {
  x: 1, y: 1, w: 8, h: 2, fontSize: 24, fontFace: "Arial",
  color: "363636", bold: true, align: "center", valign: "middle"
});

// Character spacing: use charSpacing (letterSpacing is silently ignored)
slide.addText("SPACED TEXT", { x: 1, y: 1, w: 8, h: 1, charSpacing: 6 });

// Rich text array (mixed styles in one paragraph)
slide.addText([
  { text: "Bold ",   options: { bold: true } },
  { text: "Italic ", options: { italic: true } }
], { x: 1, y: 3, w: 8, h: 1 });

// Multi-line (each line needs breakLine: true; the last may omit it)
slide.addText([
  { text: "Line 1", options: { breakLine: true } },
  { text: "Line 2", options: { breakLine: true } },
  { text: "Line 3" }
], { x: 0.5, y: 0.5, w: 8, h: 2 });

// Text-box padding: set margin: 0 to align with shapes/lines
slide.addText("Title", { x: 0.5, y: 0.3, w: 9, h: 0.6, margin: 0 });
```

## Lists & bullets

```javascript
// ✅ Correct: multiple bullets
slide.addText([
  { text: "First item",  options: { bullet: true, breakLine: true } },
  { text: "Second item", options: { bullet: true, breakLine: true } },
  { text: "Third item",  options: { bullet: true } }
], { x: 0.5, y: 0.5, w: 8, h: 3 });

// ❌ Wrong: never use unicode bullets (creates double bullets)
slide.addText("• First item", { ... });

// Sub-items & numbered lists
{ text: "Sub-item", options: { bullet: true, indentLevel: 1 } }
{ text: "First",    options: { bullet: { type: "number" }, breakLine: true } }
```

### Make bullets look good (default `bullet: true` looks amateurish)

The bare `bullet: true` renders a big dot with a **huge gap** to the text (pptxgenjs defaults to a ~27pt hanging indent) — a classic AI-list tell. Always style bullets:

```javascript
// bullet is a PARAGRAPH property — put it in EACH item's options, not top-level.
// A top-level `bullet` only styles the first paragraph; the rest get <a:buNone/> (no dot).
const bu = () => ({ code: "2022", indent: 14 });  // factory: fresh object per item (pptxgenjs mutates in place)
slide.addText([
  { text: "First item",  options: { bullet: bu(), breakLine: true } },
  { text: "Second item", options: { bullet: bu(), breakLine: true } },
  { text: "Third item",  options: { bullet: bu() } }
], {
  x: 0.5, y: 0.5, w: 8, h: 3, fontSize: 15, color: "334155",
  paraSpaceAfter: 8,   // item spacing (never lineSpacing)
  margin: 0,           // align glyph to x
});
```

- **`indent` matters most** — cut the default ~27pt to 10–16pt to kill the "floating dot" (`indent` = glyph→text gap in pt; try 10–16).
- **Refined glyphs** — `2022`(•), `25AA`(▪), `2013`(–), `25B8`(▸) read more designed than a fat dot; mute the color (e.g. `94A3B8`) to keep it subtle.
- **For short card lists** (3–4 items), skip native bullets: draw a small colored dot/square shape + a text box per row for full control.

## Shapes

```javascript
slide.addShape(pres.shapes.RECTANGLE, {
  x: 0.5, y: 0.8, w: 1.5, h: 3.0,
  fill: { color: "FF0000" }, line: { color: "000000", width: 2 }
});

slide.addShape(pres.shapes.OVAL, { x: 4, y: 1, w: 2, h: 2, fill: { color: "0000FF" } });

slide.addShape(pres.shapes.LINE, {
  x: 1, y: 3, w: 5, h: 0, line: { color: "FF0000", width: 3, dashType: "dash" }
});

// Transparency
slide.addShape(pres.shapes.RECTANGLE, {
  x: 1, y: 1, w: 3, h: 2, fill: { color: "0088CC", transparency: 50 }
});

// Rounded rectangle (rectRadius works only on ROUNDED_RECTANGLE, not RECTANGLE)
slide.addShape(pres.shapes.ROUNDED_RECTANGLE, {
  x: 1, y: 1, w: 3, h: 2, fill: { color: "FFFFFF" }, rectRadius: 0.1
});

// Shadow (to make a card stand out — use this, not an edge stripe)
slide.addShape(pres.shapes.RECTANGLE, {
  x: 1, y: 1, w: 3, h: 2, fill: { color: "FFFFFF" },
  shadow: { type: "outer", color: "000000", blur: 6, offset: 2, angle: 45, opacity: 0.15 }
});
```

**Shadow options:**

| Property    | Range / notes                                                                           |
| ----------- | --------------------------------------------------------------------------------------- |
| `type`    | `"outer"` / `"inner"`                                                               |
| `color`   | 6-char hex (no`#`, no 8-char hex)                                                     |
| `blur`    | 0–100 pt                                                                               |
| `offset`  | 0–200 pt,**must be non-negative** (negatives corrupt the file)                   |
| `angle`   | 0–359°, clockwise from 3 o'clock (45 = bottom-right, 135 = bottom-left, 270 = upward) |
| `opacity` | 0.0–1.0 (use this for transparency, never encode it in`color`)                       |

> To cast a shadow upward (e.g., a card near the bottom), use `angle: 270` + a positive offset — **not** a negative offset.
> Gradient fills are not natively supported — use a gradient image as the background instead.

## Images

```javascript
// Three sources
slide.addImage({ path: "images/photo.jpg", x: 1, y: 1, w: 5, h: 3 });            // local
slide.addImage({ path: "https://example.com/img.jpg", x: 1, y: 1, w: 5, h: 3 }); // URL
slide.addImage({ data: "image/png;base64,iVBORw0KGgo...", x: 1, y: 1, w: 5, h: 3 }); // base64 (faster)

// Options
slide.addImage({
  path: "image.png", x: 1, y: 1, w: 5, h: 3,
  rotate: 45, rounding: true /*circular crop*/, transparency: 50,
  flipH: true, flipV: false, altText: "Description",
  hyperlink: { url: "https://example.com" }
});

// Sizing modes
{ sizing: { type: 'contain', w: 4, h: 3 } }  // fit inside, preserve ratio
{ sizing: { type: 'cover',   w: 4, h: 3 } }  // fill area, preserve ratio (may crop)
{ sizing: { type: 'crop', x: 0.5, y: 0.5, w: 2, h: 2 } } // cut a specific portion

// Compute size from aspect ratio and center it
const origW = 1978, origH = 923, maxH = 3.0;
const calcW = maxH * (origW / origH);
const centerX = (10 - calcW) / 2;
slide.addImage({ path: "image.png", x: centerX, y: 1.2, w: calcW, h: maxH });
```

Supports PNG / JPG / GIF / SVG (SVG works in modern PowerPoint / Microsoft 365).

## Icons (react-icons → rasterized PNG)

```javascript
const React = require("react");
const ReactDOMServer = require("react-dom/server");
const sharp = require("sharp");
const { FaCheckCircle, FaChartLine } = require("react-icons/fa");

async function iconToBase64Png(IconComponent, color, size = 256) {
  const svg = ReactDOMServer.renderToStaticMarkup(
    React.createElement(IconComponent, { color, size: String(size) })
  );
  const png = await sharp(Buffer.from(svg)).png().toBuffer();
  return "image/png;base64," + png.toString("base64");
}

const iconData = await iconToBase64Png(FaCheckCircle, "#4472C4", 256);
slide.addImage({ data: iconData, x: 1, y: 1, w: 0.5, h: 0.5 });
```

Icon sets: `react-icons/fa` (Font Awesome), `/md` (Material), `/hi` (Heroicons), `/bi` (Bootstrap). Use size ≥ 256 for crisp icons (size controls rasterization resolution; display size is set by w/h).

## Backgrounds

```javascript
slide.background = { color: "F1F1F1" };                        // solid
slide.background = { color: "FF3399", transparency: 50 };      // with transparency
slide.background = { path: "https://example.com/bg.jpg" };     // image URL
slide.background = { data: "image/png;base64,iVBORw0KGgo..." };// image base64
```

## Tables

```javascript
slide.addTable([
  ["Header 1", "Header 2"],
  ["Cell 1", "Cell 2"]
], { x: 1, y: 1, w: 8, h: 2, border: { pt: 1, color: "999999" }, fill: { color: "F1F1F1" } });

// Merged cells
let tableData = [
  [{ text: "Header", options: { fill: { color: "6699CC" }, color: "FFFFFF", bold: true } }, "Cell"],
  [{ text: "Merged", options: { colspan: 2 } }]
];
slide.addTable(tableData, { x: 1, y: 3.5, w: 8, colW: [4, 4] });
```

## Charts

**Principle: keep charts native and editable.** Choose your approach by what PowerPoint can represent, not by what's quickest to code:

1. **Library-native** (bar/column/line/pie/area/scatter/bubble/radar/doughnut/combo) → use `addChart()`; **never** render to an image.
2. **PowerPoint-native but not exposed by the library** (trendlines, error bars) → stay native: compute the extra series yourself (e.g., a regression line as a second LINE/SCATTER series) or inject the OOXML. **Don't** fall back to a matplotlib PNG — you lose editability.
3. **Genuinely no native representation** (Sankey, network/graph, chord, complex statistical plots) → only here render to an image and insert via `addImage()`.

```javascript
// Bar
slide.addChart(pres.charts.BAR, [{
  name: "Sales", labels: ["Q1","Q2","Q3","Q4"], values: [4500,5500,6200,7100]
}], { x: 0.5, y: 0.6, w: 6, h: 3, barDir: 'col', showTitle: true, title: 'Quarterly Sales' });

// Line
slide.addChart(pres.charts.LINE, [{
  name: "Temp", labels: ["Jan","Feb","Mar"], values: [32,35,42]
}], { x: 0.5, y: 2.5, w: 6, h: 2.5, lineSize: 3, lineSmooth: true });

// Pie
slide.addChart(pres.charts.PIE, [{
  name: "Share", labels: ["A","B","Other"], values: [35,45,20]
}], { x: 6.5, y: 1, w: 3, h: 3, showPercent: true });
```

**Make charts look modern (defaults look dated):**

```javascript
slide.addChart(pres.charts.BAR, chartData, {
  x: 0.5, y: 1, w: 9, h: 4, barDir: "col",
  chartColors: ["0D9488", "14B8A6", "5EEAD4"],            // match your palette
  chartArea: { fill: { color: "FFFFFF" }, roundedCorners: true },
  catAxisLabelColor: "64748B", valAxisLabelColor: "64748B", // muted axis labels
  valGridLine: { color: "E2E8F0", size: 0.5 },             // subtle grid, value axis only
  catGridLine: { style: "none" },
  showValue: true, dataLabelPosition: "outEnd", dataLabelColor: "1E293B", // data labels
  showLegend: false,                                       // hide legend for single series
});
```

## Slide masters & speaker notes

```javascript
// Master
pres.defineSlideMaster({
  title: 'TITLE_SLIDE', background: { color: '283A5E' },
  objects: [{ placeholder: { options: { name: 'title', type: 'title', x: 1, y: 2, w: 8, h: 2 } } }]
});
let titleSlide = pres.addSlide({ masterName: "TITLE_SLIDE" });
titleSlide.addText("My Title", { placeholder: "title" });

// Speaker notes (visible only in Presenter View, not on the slide)
slide.addNotes("Open with the FY25 revenue headline; pause after the number. If asked about the Q3 dip: supply chain, resolved in Q4.");
```

## Common pitfalls (file corruption / visual bugs / AI look)

1. **Never use `#` with hex** — corrupts the file: `color: "FF0000"` ✅ / `"#FF0000"` ❌
2. **Never encode opacity in hex** — 8-char hex (e.g., `"00000020"`) corrupts the file; use the `opacity` property
3. **Use `bullet: true`** — never unicode `•` (double bullets)
4. **Use `breakLine: true`** between array items
5. **Avoid `lineSpacing` with bullets** (excessive gaps) — use `paraSpaceAfter` instead
6. **Fresh instance per presentation** — don't reuse the `pptxgen()` object
7. **Don't reuse option objects across calls** — pptxgenjs **mutates objects in place** (e.g., converts shadow values to EMU), so sharing corrupts the second shape. Use a factory that returns a fresh object:
   ```javascript
   const makeShadow = () => ({ type:"outer", blur:6, offset:2, color:"000000", opacity:0.15 });
   slide.addShape(pres.shapes.RECTANGLE, { shadow: makeShadow(), ... }); // ✅
   ```
8. **Don't add edge accent bars to cards** — use a `fill` tint or `shadow` to set them apart

## Quick reference

- **Shapes**: RECTANGLE / OVAL / LINE / ROUNDED_RECTANGLE
- **Charts**: BAR / COLUMN / LINE / AREA / PIE / DOUGHNUT / SCATTER / BUBBLE / RADAR / combo (array of `{type, data, options}`)
- **Alignment**: `"left"` / `"center"` / `"right"`
- **Data-label position**: `"outEnd"` / `"inEnd"` / `"center"`

---

## Creating a presentation FROM a user-provided template (.pptx)

Route here when the user supplies a .pptx and wants a NEW deck built on it. Working from a template, you can infer the deck's design system — its layouts, typography, spacing, colors, and recurring content patterns, including the rules embedded in the Slide Master — and apply those conventions consistently to new material. Two non-negotiables: study the template BEFORE writing any content, and verify AFTER building — most template failures come from skipping one of the two.

> **Template inheritance (mandatory)** — If the user provides an existing PPT, a corporate template, or a reference file, you **must** follow the "template inheritance" flow rather than recreating a look-alike from scratch:
>
> - Analyze fonts, color scheme, spacing, footers, page numbers, placeholders, and brand elements.
> - Build a mapping between source pages and new pages.
> - Inherit existing layouts as much as possible instead of recreating a new set.
> - Only modify elements that are allowed to be modified.
> - Preserve the original template's visual language unless the user asks for a redesign.
> - If no page in the original template can carry the target content, state the limitation explicitly and propose the closest alternative.

**1. Decide the mode — "use as template" hides two different jobs:**

| Mode                   | User signal                                                            | Build                                                                                                                        |
| ---------------------- | ---------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| **Clone & fill** | new outline or free structure — "做成这个风格" / "用这个模板做一份 X" | clone template pages and fill them; pick which pages to reuse by role and shape your outline around what the template offers |
| **Fill-in**      | new content maps ≈1:1 onto the template's pages (换数据 / 换客户)     | in-place replacement — Approach A of the Editing section                                                                    |

Both modes edit the .pptx natively and output an editable PowerPoint — **never** route a template job through an HTML-rendering replacement of real slides; a foreign rendered page next to the template's real pages is instantly visible and loses the theme. Clone & fill builds a new deck on the template; Fill-in is the lighter in-place path. Everything below applies to both.

**2. Study the template (before generating any content) — programmatic first, vision only to break ties:**
  • Inventory every text shape with python-pptx (recurse into GROUPs): position, size, font, current text length. The original text length is the budget ceiling — the **"Budget every shape"** rules of the Editing section apply verbatim. Collect this first; it also drives the role classification below.
  • Classify each page's role (cover / section / content / stats / quote / closing…) — this role map is your layout catalog for planning. Derive the role from the inventory, not from an image: cover = few shapes + an outsized title (≥36pt) and/or a full-page background image; section = only 1–2 short text shapes; stats = a 60pt+ numeric shape; quote = a single large centered long-text box; content = several body boxes. Derive every page's role from the inventory alone — never fall back to rendering an image.
  • Answer the one decisive structural question: does the design live in `slideLayouts` with real placeholders (→ clone & fill can `add_slide` + fill), or is it drawn on slides with free text boxes while layouts sit empty (common in downloaded templates; → clone & fill must clone slides at XML level)?
  • Read the design's source of truth: `presentation.xml` for slide size (never assume 16:9); `theme1.xml` for colors and fonts — slide XML uses `schemeClr` indirection, the real hex lives in the theme (remapped by the master's `clrMap`), and CJK text renders in the `<a:ea>` font.

**3. Plan, then build — always on a COPY of the user's file:**
  • Write a short plan first: final page order; each page's template source (slide index to clone, or layout name) chosen by ROLE; replacement text written WITHIN the budget. If the user's outline and the template's structure conflict, surface the trade-off instead of improvising. (Clone & fill: since structure is free, let the template's available page roles drive the outline rather than forcing a shape the template can't carry.)
  • Fill-in: follow the Editing section's Approach A as written.
  • Clone & fill: materialize pages first — `add_slide` + fill placeholders when layouts are real; otherwise clone the slide at XML level (copy the slide part + its `.rels`, re-register media rIds, add to `sldIdLst` and `[Content_Types].xml`; unpacking the ZIP with `unzip`, editing the XML, and re-zipping is often the clearest route). Then replace content page by page (scope mappings per slide — clones share identical source text), swap images by replacing the image part bytes (keep the shape and rId), and delete unused template pages LAST, high-index first. Never hand-build a from-scratch page next to template pages — a foreign page is instantly visible.

**4. Verify (mandatory before reporting done) — programmatic checks, no rendering:**
The whole checklist is decidable without an image; run these and fix until clean:
  • **Page order & count** — count `sldIdLst` against the plan.
  • **Leftover placeholders** — grep the slide XML for `Click to add`, `xxx`, `lorem`, `TODO`, `[insert`.
  • **Broken images** — confirm every image rId on a cloned page resolves to a real media part (empty frames come from dangling rels); validate the edited XML parses (`python3 -c "import xml.etree.ElementTree as ET, glob; [ET.parse(p) for p in glob.glob('ppt/**/*.xml', recursive=True)]"` from the unpacked tree).
  • **Fonts & colors unchanged** — diff the run/theme font+color against the original rather than eyeballing it.
  • **Overflow / collision** — re-check the "Budget every shape" rule (`len ≤ orig_len × 1.1`) on the final text and compare each `left+width` against its neighbor. A passing budget is the overflow guard here — treat any shape over budget as a real defect and fix it (trim, widen, or shrink per the Editing rules).

## Editing an existing PowerPoint presentation (.pptx)

For in-place edits to an existing deck (Fill-in mode, and small fixes like typos or updating numbers), work on a COPY and pick the approach by what the edit touches:

- **Approach A — `python-pptx` script** — preferred for text replacement, deleting/reordering slides, and any edit that should preserve fonts/colors/layout. Simpler and safer than raw XML for content swaps.
- **Approach B — raw OOXML** — required for animations, transitions, comments, speaker notes XML, theme tweaks, custom layout edits — anything `python-pptx` can't reach.

### Approach A — `python-pptx` text replacement (preferred for text edits)

**Workflow**

1. **Inventory the deck** — walk every slide, recurse into GROUP shapes (`shape_type == 6`), `print(repr(para.text))`. Use the inventory as the source of truth for replacement keys; rendered text often contains hidden chars that won't survive copy-paste.
2. **Helpers** — keep the build script short:

   ```python
   from pptx import Presentation
   from pptx.enum.text import MSO_AUTO_SIZE
   from pptx.oxml.ns import qn
   from pptx.util import Emu, Pt

   def iter_text_frames(shapes):
       for s in shapes:
           if s.shape_type == 6:                 # GROUP → recurse
               yield from iter_text_frames(s.shapes)
           elif s.has_text_frame:
               yield s, s.text_frame

   def _norm(s):                                  # strip soft breaks before matching
       return s.replace("\x0b", "").replace("\r", "").strip()

   def replace_in_paragraph(p, new_text):         # first-run replace preserves formatting
       runs = p.runs
       if not runs:
           p.add_run().text = new_text; return
       runs[0].text = new_text
       for r in runs[1:]:
           r._r.getparent().remove(r._r)

   def apply_replacements(tf, mapping):           # full-frame match, then per-paragraph
       m = {_norm(k): v for k, v in mapping.items()}
       full = "\n".join(p.text for p in tf.paragraphs)
       if _norm(full) in m:
           parts = m[_norm(full)].split("\n")
           for i, p in enumerate(tf.paragraphs):
               replace_in_paragraph(p, parts[i] if i < len(parts) else "")
           return
       for p in tf.paragraphs:
           if _norm(p.text) in m:
               replace_in_paragraph(p, m[_norm(p.text)])

   def delete_slide(prs, idx):                    # call high-index first
       sld = list(prs.slides._sldIdLst)[idx]
       prs.part.drop_rel(sld.get(qn("r:id")))
       prs.slides._sldIdLst.remove(sld)
   ```

**Budget every shape BEFORE generating replacement text (do this first)**

Most overflow bugs come from generating copy without knowing the target box's capacity. Before drafting any replacement, walk the deck once and emit a capacity manifest — then feed it to the content step as a hard constraint.

For each text-bearing shape collect: `slide_idx, shape_id, w_cm, h_cm, font_pt, orig_text, orig_len`. Then:

- `budget = orig_len × 1.1`. The template designer already tuned `orig_len` for this box — treat it as the ceiling, not a starting point. This one rule is the actual overflow guard; don't over-engineer it with width/line-height estimates (glyph advance widths vary by font and by CJK-vs-Latin mix, so any `chars_per_line` formula is a rough guess that the `orig_len` cap already subsumes).
- `role = "label"` if `h_cm < 1.5` OR `orig_len ≤ 8` OR `font_pt ≥ 20`; else `"body"`.

Rules the generation step MUST obey:

- **Label boxes**: short phrase only. No full sentences, no trailing punctuation, no "term + explanation" expansion. Hard cap = `max(orig_len, 8)`. SWOT tiles, timeline tags, KPI labels all fall here.
- **Body boxes**: stay within `budget`. Font size is inherited from the template; shrinking is a last resort, not plan A.
- If the content is genuinely longer and the layout permits, **grow the box itself** (`widen_to_fit(shape, Emu(...))` — see below) rather than shrinking the font. Check first that `left + width` won't collide with the next shape.

**Handling long replacement / unwanted wrapping after replacement**

When a longer replacement wraps to a new line, apply remedies in this order (cheapest first):

```python
def widen_to_fit(shape, max_grow_emu=Emu(0)):
    """Let PowerPoint size the shape to its text. Pass max_grow_emu>0 to also
    grow the explicit width (centered on the original position) before sizing."""
    if max_grow_emu:
        shape.left -= max_grow_emu // 2
        shape.width += max_grow_emu
    shape.text_frame.word_wrap = True
    shape.text_frame.auto_size = MSO_AUTO_SIZE.SHAPE_TO_FIT_TEXT

def shrink_text_to_fit(shape):
    """Keep the box fixed; let PowerPoint shrink the font to fit."""
    shape.text_frame.word_wrap = True
    shape.text_frame.auto_size = MSO_AUTO_SIZE.TEXT_TO_FIT_SHAPE
```

> ⚠️ Both helpers only **write the autofit flag** into the XML — python-pptx does not compute the resized shape or the shrunk font-scale itself. The actual fit is applied by the viewer (PowerPoint / LibreOffice) when the file is opened, so your programmatic overflow check can't see the result. Prefer trimming to `budget` (below), which *is* verifiable without rendering.

1. **Budget first (preferred).** Check `shape.width` × `font_size` from inventory and trim the replacement so it fits the original visual budget. Numeric badges / small label boxes (`width ≤ 0.7"`, `font_size ≥ 16pt`) hold ~3–4 chars max.
2. **Widen the shape** with `widen_to_fit(shape, Emu(...))` when the content is genuinely longer and there's free space next to it. Always check the shape isn't going to collide with a neighbor first (compare `left+width` against the next shape's `left`).
3. **Shrink the font** with `shrink_text_to_fit(shape)` only for tight-layout boxes (table cells, numeric badges) where widening would break the grid. Last resort — it visibly breaks the typographic rhythm.

Skip `word_wrap = False`: it makes text overflow the box invisibly in PowerPoint and looks broken when exported.

**Critical gotchas**

- **Soft line breaks (`\x0b`)** silently break exact-match. Always `_norm()` both keys and lookups.
- **GROUP shapes** (`shape_type == 6`) hide text frames — recurse.
- **First-run replace** preserves formatting; `paragraph.text = ...` destroys it.
- **Short tokens collide.** `"01"`, `"%"`, `"18"` recur across slides — keep identity mappings or scope per slide index, never global cross-mappings like `"18": "12"`.
- **Delete slides high-index first** — deleting index 5 first shifts every later index down by one.

## Code Style Guidelines

**IMPORTANT**: When generating code for PPTX operations:

- Write concise code
- Avoid verbose variable names and redundant operations
- Avoid unnecessary print statements

## Dependencies

Available when installed in the local environment (global `require(...)` resolves via `NODE_PATH`):

- **markitdown** (pip): text extraction
- **pptxgenjs** (npm): creating presentations
- **react-icons**, **react**, **react-dom**, **sharp** (npm): icons and SVG rasterization
- **python-pptx** (pip): editing and template workflows
- **LibreOffice** (`soffice`): PDF conversion for QA renders (`scripts/general_judge.py`)
- **Poppler** (`pdftoppm`): PDF to page images
- **defusedxml** (pip): secure XML parsing

Playwright/Chromium is intentionally NOT installed — build decks with pptxgenjs and python-pptx, not an HTML-rendering pipeline.


## Writing Quality Instructions

Oftentimes, when an AI model makes slides, the writing is poor-quality and/or AI slop. You must instead write  in a clear, direct, and professional way for all content you write on the slide, following the instructions below.

The examples below show wording to avoid, why it is slop/bad writing, and how you would want to write that instead. They are non-exhaustive; apply the same judgment to writing quality more generally.

### Taxonomy

#### 1. Awkward/unnatural wording

Wording that seems unfit for the text and should be rephrased to seem more human.

| Don't write | Why it is slop/bad writing | You should instead write like this |
| --- | --- | --- |
| Word: “Shopping has become more deliberate and **value-led**.” | “Value-led” is an awkward and vague phrase that does not carry much substance. It comes off as an empty abstraction. | “Shopping has become more deliberate and focused on **value**” |
| Word: “Contributions **waned** over the period.” | “Waned” is unnecessary. It is more direct and intuitive to simply say “decreased”. | “Contributions **decreased** over the period” |
| Word: “A **closer** 2021 **step-up** from a small **base**” | The word “closer” followed by “step-up” makes it unclear what the increase is ‘closer’ to. The comparison sounds unnatural and can be made more explicit by replacing it with “increased”. Baseline is a more natural phrasing of “base”. | “A **larger increase** in 2021 from a **low baseline**” |
| Phrase: “A **five-question pulse** uses simple 0-10 scores and one **verbatim follow-up** to reveal what matters most.” | The “five-question pulse” and “verbatim follow-up” are unnatural phrasings that are difficult to parse. | “The **five-question survey** uses a 0-10 scale and one **open-ended question**.” |
| Phrase: “Sony calculates Adjusted OIBDA as operating income plus depreciation and amortization expense, **less profit and loss amounts** that Sony **deems non-recurring**.” | This phrasing is clunky and hard to read because it stacks multiple awkward phrases together. The phrase “deems non-recurring” is also awkward given that you could simply use non-recurring as an adjective (Sony’s involvement implied earlier in the sentence).<br><br>The phrase “less profit and loss amounts” is also an awkward way to communicate the financial impact. | “Sony calculates Adjusted OIBDA as operating income plus depreciation and amortization expenses,  **less non-recurring profits and losses**” |
| Phrase: “Evidence from the early COVID-19 through the inflationary aftermath shows consumers are **thinking harder before they buy.**” | “Thinking harder before they buy” is a very strange phrasing that should be rephrased to be more aligned with the text. | “Since COVID-19, consumers have become more **deliberate about purchases**” |
| Label: “Immediate demand shock” | The word “immediate” unnecessarily repeats the suddenness of “shock,” which makes the statement feel awkward and redundant. | “Sharp decline in demand” |
| Label: “VERBATIM FOLLOW-UP” | What is “verbatim follow-up”? That is an awkward/unnatural phrase that makes the underlying meaning unclear. | “OPEN-ENDED QUESTION” |
| Label: “POST-COVID CONSUMER” | This is supposed to mean consumers after COVID-19, but it's expressed awkwardly as an adjective. | “Consumers after COVID-19” |

#### 2. Excessive/flowery wording

Wording that is excessively elaborate, sophisticated-sounding, or slogan-like.

| Don't write | Why it is slop/bad writing | You should instead write like this |
| --- | --- | --- |
| Word: “Introduced Snapdragon 8 Elite, pairing the custom Oryon CPU with stronger AI performance for **next-generation** flagship smartphones.” | “Next-generation” is excessive and flowery because ‘flagship’ already conveys that smartphones are advanced. | Omit the word entirely. |
| Phrase: “A **five-question pulse** uses simple 0-10 scores and one **verbatim follow-up** to reveal what matters most.” | The ‘five-question pulse’ and ‘verbatim follow-up’ are also unnecessarily wordy, and can be simplified to a less sophisticated-sounding phrase. | “The **five-question survey** uses a 0-10 scale and one **open-ended follow-up.**” |
| Phrase: “Translate priorities into **coordinated execution**.” | This phrase is flowery because it sounds action-oriented and polished but conveys little meaning. The words “coordinated execution” are overly abstract and excessive. | “Translate priorities into **a clear execution plan**” |
| Phrase: “A **structurally lower** commute base.” | “Structurally lower”  is inflated and overly elaborate, which obscures the intended meaning of the sentence. | “A **permanent** drop in commuting” |
| Phrase: “The organization seeks to **holistically cultivate a multifaceted ecosystem of synergistic capabilities** that meaningfully facilitates the **realization of enhanced outcomes**.” | “Holistically cultivate a multifaceted ecosystem of synergistic capabilities” and “realization of enhanced outcomes” are excessively verbose and elaborate. It can be streamlined to convey the phrase’s underlying message in a less sophisticated-sounding way. | “The organization seeks to build a **cohesive set of capabilities** that will **improve its outcomes**” |
| Phrase: “Reduced overhead through **scalable spans and layers**” | “Scalable spans and layers” is jargon-filled and adds little meaning. From the phrase, it is also unclear what “scalable” is referring to. | “Reduced overhead through **streamlined** **management structures**” |
| Label: “Catalyzing Transformative Excellence” | “Catalyzing transformative excellence” inflates a simple concept and makes the label sound overly sophisticated. | “Performance Improvement” |

#### 3. Vague/empty wording

Wording that is unclear, abstract, or general in a way that does not convey any real substance.

| Don't write | Why it is slop/bad writing | You should instead write like this |
| --- | --- | --- |
| Word: “FY24 revenue $2.68B (+26%), with **broad-based** usage across products.” | “Broad-based” is vague because it does not identify which products saw the increase in usage. It should be replaced with a more specific metric of growth to reflect the increase in usage. | “FY24 revenue $2.68B (+26%), with usage **increasing** across products.” |
| Phrase: “Execution depends on teams that deliver reliably, **sustain the core** and continuously improve operations” | “Sustain the core” is vague phrasing that makes little sense. The jargon-heavy language needs to be replaced with a more specific representation of what the intended message is, clarifying that it is the core business. | “Execution depends on teams that deliver reliably, **sustain the core business**, and continuously improve operations.” |
| Phrase: “**Progressive promotion** improves trust and usability” | “Progressive promotion” is vague and ambiguous, with no discernible meaning.  To make the phrase less abstract and slogan-like, it needs to mention exactly what is improving “trust and usability”. | “**Customer rewards** programs improve trust and usability” |
| Phrase: “**More consistent coverage** and **stronger transparency**” | “More consistent” and “stronger transparency” are vague and abstract phrases.<br><br>Given the slide’s focus on operational improvements, the phrase should specify the concrete outcome, like more consistent staffing coverage and clearer scheduling visibility. | “**Improved staffing coverage and scheduling visibility**” |
| Phrase: “**Price and availability** lead **transportation adoption**” | Both “price and availability” and “transportation adoption” are clear, but taken together convey no meaning. A specific causal relationship should be added to relay the two. | “Price and availability are **the main drivers of** transport adoption” |
| Label: “Strategic Value Drivers” | “Strategic Value Drivers” is too abstract to identify what the section actually conveys. Given the slide’s focus on revenue metrics, it should be more tailored to that. | “Revenue Metrics” |

#### 4. Unnecessary wording

Wording that is wholly unnecessary and would be best to remove.

| Don't write | Why it is slop/bad writing | You should instead write like this |
| --- | --- | --- |
| Word: “**Practical** consumer needs consistently outweigh broader supporting factors across Germany, the US, and China.” | “Practical” is unnecessary because “consumer needs” already suggests that they are concrete needs. Removing the word helps clarify the sentence’s intended meaning. | “Consumer needs consistently outweigh broader supporting factors across Germany, the US, and China” |
| Word: “Operating earnings after **defined** non-GAAP adjustments” | “Defined” does not clarify anything. It makes the sentence more formal and obscures its initial meaning. | “Operating earnings after the non-GAAP adjustments” |
| Phrase: “A five-question pulse uses simple 0-10 scores and one verbatim follow-up to **reveal what matters most.**” | The “reveal what matters most” is empty phrasing that does not affect the phrase’s meaning when removed. | “The five-question survey uses a 0-10 scale and one open-ended follow-up.” |
| Label: “A NEW ERA” | Has no clear connection to the slide’s discussion of employee survey results and does not communicate a specific point. | Omit the phrase entirely. |
| Label: “MOMENTUM AHEAD” | Arbitrary positive-sounding phrase that is not supported by or relevant to the refinancing information on the slide. | Omit the phrase entirely. |
| Label: “UNLOCKING POTENTIAL” | Generic promotional language that adds nothing to a slide showing transit recovery trends. | Omit the phrase entirely. |

#### 5. Illogical wording

Wording that is not coherent or logical and does not make sense.

| Don't write | Why it is slop/bad writing | You should instead write like this |
| --- | --- | --- |
| Word: “Test, **learn**, and scale the most promising ideas with disciplined investment” | While “testing” and “scaling” promising ideas is coherent, “learning” promising ideas makes no sense. The context implies that this may instead be “development” of these ideas. | “**Develop**, test, and scale the most promising ideas with disciplined investment” |
| Phrase: “Transit & **ground passenger** jobs” | “Transit & ground passenger jobs” is incomprehensible, especially because “ground passenger jobs” makes no logical sense. Fixing the linkage makes this coherent again. | “Transit and passenger transportation jobs” |
| Phrase: “**Incubate adjacent offerings** and business models that can **expand the core.**” | The dense phrasing of “incubate adjacent offerings” carries no meaning. The phrase “expand the core” also not coherent because it doesn’t specify what the ‘core’ is referring to. | “Develop **related products and business models** that expand the core business.” |
| Phrase: “**New mobility concepts** and changing behavior in cities.” | “New mobility concepts” is incoherent and does not make sense in the context of this sentence. The underlying message revolves around new transportation options, not novel “mobility concepts”. | “New transportation options and changing travel behavior in cities.” |
| Phrase: “79% Transit use **back to pre-pandemic**” | The phrasing is not parseable. It could mean that transit use has returned to 79% of its pre-pandemic level, or that 79% represents the pre-pandemic transit-use rate. To make the relationship logical, it should state what the current level is and how it compares with the previous pre-pandemic levels. | “Transit use is at 79%, matching pre-pandemic levels”<br><br>or<br><br>“Transit use has recovered to 79% of its pre-pandemic level.” |
| Label: “Revenue Growth Decline Expansion” | “Revenue growth decline expansion” is illogical because it combines contradictory ideas without explaining how they relate. “Growth” and “decline” point in different directions. | “Revenue Decline” |

|  | Words | Phrases | Labels |
| --- | --- | --- | --- |
| Awkward/unnatural wording | ✅ | ✅ | ✅ |
| Excessive/flowery wording | ✅ | ✅ | ✅ |
| Vague/empty wording | ✅ | ✅ | ✅ |
| Unnecessary wording | ✅ | ✅ | ✅ |
| Illogical wording | ✅ | ✅ | ✅ |

### AI-isms

Avoid the following patterns of AI-generated wording in slide copy.

#### 1. Punctuation

| Don't write | Why it is slop/bad writing |
| --- | --- |
| Em dash: “Jobs fell 38% from February to April 2020, then climbed back gradually—ending 2024 still just below the pre-shock level.” | Em dashes are always slop. |
| Semicolon: “Travel demand and employment fell within weeks; persistent behavior shifts are shaping the path back.” | Semicolons are always slop. |
| Dot notation: “Faster growth • Better efficiency • Stronger outcomes” | ASCII dots are always slop. |
| Vertical bar: “Strategy \| Execution \| Impact” | Vertical bars are always slop. |
| Arrows: “Crisis-led and repetitive → one trusted plan → flexible, coordinated support → confident step-down with a route back” | Arrows are always slop. |

#### 2. “It’s not X, it’s Y” / “Do Y, not X”

| Don't write | Why it is slop/bad writing |
| --- | --- |
| “Humidity **is an** exposure trajectory, **not** a setpoint” | “Is / is not” sentence structures are always slop. |
| “This **isn’t just** a calendar - **it’s** a gateway to a more intentional life.” | “Is / is not” sentence structures are always slop. |
| “Data access **is not** a background detail. **It’s** the heart of the user experience.” | “Is / is not” sentence structures are always slop. |

#### 3. Passive Voice

| Don't write | Why it is slop/bad writing |
| --- | --- |
| “The proposal was approved by the team” | Passive voice is always slop. Write instead: “The team approved the proposal.” |
| “The launch was delayed” | Passive voice is always slop. Write instead: “The team delayed the launch.” |

#### 4. Imperative Title

| Don't write | Why it is slop/bad writing |
| --- | --- |
| Slide title: “Define the integration perimeter before designing the workplan” | Imperative slide titles are always slop. |
| Slide title: “Screen the energy credit, not the headline retail tariff” | Imperative slide titles are always slop. |

#### 5. Slogan-like Phrasing

| Don't write | Why it is slop/bad writing |
| --- | --- |
| Phrase: “Usage-based models turn customer activity into a direct revenue expansion path” | Slogan-like wording, particularly the use of “direct revenue expansion path” |
| Phrase: “Provided scale, speed and certainty by anchoring the club refinancing.” | Formulaic statement with the “scale, speed and certainty”.  The statement is also unclear about how anchoring the club refinancing leads to scale, speed, and certainty. This is slogan-like with the buzzwords used in the formulaic statement. |

#### 6. Formulaic three-part lists

Avoid using three-part lists of actions, situations, or examples as a default sentence pattern. Repeated "X, Y, and Z" constructions make slide copy sound formulaic. State the main point directly. If each item matters, explain how the ideas relate or present them separately. Do not add filler to complete a trio or lose useful detail merely to avoid one.

| Don't write | Why it is slop/bad writing |
| --- | --- |
| “Partners can act **before a crisis, during daily strain and when care becomes difficult**.” | Packages overlapping situations into a three-part rhythm without clearly explaining when or how partners can help. |
| “Residents help **choose priorities, design services and judge whether access improves**.” | Bundles distinct responsibilities into a predictable three-action sequence instead of explaining how residents influence the services they receive. |
| “Example proposal: connect a housing area with **food, care and the library**.” | Compresses different services and destinations into a tidy trio, leaving the proposed connection unclear. |
| “Outreach staff **listen, map existing services and document gaps**.” | Lists three actions without explaining how listening and service mapping help staff identify gaps. |

#### 7. Unnecessary hyphenated compounds

Avoid hyphenated compounds that make ordinary ideas sound awkward or unnecessarily technical. Prefer a plain phrase when it expresses the same meaning more naturally. Use natural wording instead of simply deleting hyphens. Preserve exact official names and necessary distinctions.

| Don't write | Why it is slop/bad writing |
| --- | --- |
| “Use overnight shelters or **violence-against-women** shelters.” | Packs a description of the people served into a long modifier. Write instead: “Use overnight shelters or shelters for women experiencing violence.” |
| “People in the **Point-in-Time** Count” | Repeats a technical name where a simple reference may suffice. After identifying the count, write instead: “People in the count”. Preserve the official name where needed. |
| “**Time-limited** accommodation” | A plain phrase can explain the duration more naturally. Write instead: “Accommodation for a limited period”. |
| “**Owner-occupied** housing” | For a general audience, a plain phrase can explain who lives in the home. Write instead: “Homes where the owners live”. |
| “A **one-night** snapshot misses hidden homelessness.” | The duration reads naturally as a separate phrase. Write instead: “A count on a single night misses hidden homelessness.” |

## Titles

**Name the subject directly.** For process, overview, definition, and setup slides, prefer a concise noun phrase that identifies the actual subject. Make plain topic titles the default for these slides. A clear topic label can be more useful than a full sentence, question, or takeaway. Choose the form that best describes what the slide actually shows. Avoid turning setup or background slides into claims, slogans, or announcements about the presentation.

For each title, consider whether a short noun phrase, an explanatory title, or a supported factual takeaway would serve the reader best. A noun phrase is an option to use - we don't always need to use noun phrases over sentences. Keep a good existing title when it already does the job.

Name the actual subject or distinction in plain language. Remove presenter narration such as "Start simple" and replace vague announcements such as "Two different questions" with the subjects being discussed. Do not force a title to sound like an insight. A setup slide can simply identify the information or assumptions it establishes.

Reconsider the title's framing before polishing its wording. Avoid generic narrative frames such as "From X to Y," "Two questions about...," or "Start with..." when a direct subject label is clearer. Replacing words within the same frame may leave the underlying problem intact.

| Don't write | You should instead write like this | Why it fits the slide |
| --- | --- | --- |
| "Start simple: a withdrawal reflex" | "The withdrawal reflex" | Names the mechanism explained by the diagram and removes the presenter's instruction. |
| "Two different questions about one behavior" | "Mechanism and evolution of behavior" | Names the two explanations that the slide compares. |
| "Same paycheck. Different purchasing power." or "The same take-home pay buys different amounts" | "Income and household assumptions" | Names the income and household setup used for the comparison. This slide establishes the baseline; it does not yet show a purchasing-power comparison. |
| "From first signal to verified recovery" or "From detection to post-incident review" | "Major incident response process" | Names the process being explained. The numbered steps already communicate the progression. |

Use a takeaway title when the slide establishes a specific finding. Use a range or progression when that progression itself is the subject. Do not force either form onto a slide that simply explains a topic.

Apply the writing quality instructions above and the punctuation rules below to whichever form you choose.

**Periods in titles and headings:** Remove trailing periods from short slide titles and section headings. Keep a terminal period only when the title or heading is a longer, complete sentence. A short complete sentence does not need a trailing period. Do not lengthen or otherwise rewrite a good title just to retain a period. Use normal punctuation in body text and preserve periods within abbreviations and numbers.

## Final response

Return the deck and any explanation the user requested. Do not add a recap of your edits or successful validation checks unless asked. Mention problems or limitations that affect use of the deck. Do not rate your own work or list every instruction you followed. Do not deliver temporary files unless requested. For read-only questions, answer directly and cite the source you inspected.

### Final response file references

Mention the final deck once using its backticked workspace path, such as `/workspace/Presentations/deck.pptx`. Beeblio renders this path as a file chip the user can open. For read-only answers, identify the source deck the same way and give slide numbers in ordinary prose when useful. Do not emit Codex-specific citation directives. Say you checked the deck in PowerPoint only if you opened and inspected it there.
