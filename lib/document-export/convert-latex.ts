import { execFile } from "node:child_process";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import JSZip from "jszip";
import { renderPandocCitations } from "../markdown-bibliography.ts";
import sharp from "sharp";

import type { ExportDiagram, ImageLoader, LoadedImage } from "./markdown-preprocess";
import { rasterizeSvgToPngDataUrl } from "./rasterize-svg";
import { integerEnv } from "@/lib/env-config";

const PANDOC = process.env.PANDOC_PATH ?? "pandoc";
const PANDOC_TIMEOUT_MS = integerEnv("PANDOC_TIMEOUT_MS", 120_000, 1_000);
const PANDOC_MAX_BUFFER_BYTES = integerEnv("PANDOC_MAX_BUFFER_BYTES", 256 * 1024 * 1024, 1024 * 1024);

const FENCE_OPEN = /^\s{0,3}(```+|~~~+)/;
const FENCE_CLOSE = /^\s{0,3}(```+|~~~+)\s*$/;
const MERMAID_FENCE_OPEN = /^\s{0,3}(```+|~~~+)\s*mermaid\s*$/i;
const IMAGE = /!\[([^\]]*)\]\(\s*<?([^)\s<>]+)>?(?:\s+"[^"]*")?\s*\)/g;
const DATA_URI = /^data:([^;,]+);base64,([\s\S]+)$/;
const FRONTMATTER_OPEN = /^---[\t ]*$/;
const CALLOUT_MARKER = /^ {0,3}>[\t ]*\[!(NOTE|TIP|IMPORTANT|WARNING|CAUTION)\][\t ]*$/i;
const BLOCKQUOTE_LINE = /^ {0,3}>/;

// Emoji and other pictographs: pdfLaTeX (Overleaf's default compiler) errors
// out on unicode characters its utf8 definitions do not cover, and emoji have
// no pdfLaTeX representation at all. Strip them (plus variation selectors and
// zero-width joiners that only decorate emoji runs) so bundles compile under
// pdfLaTeX and Xe/LuaLaTeX alike. Whitespace collapse is unnecessary — LaTeX
// treats consecutive spaces as one.
const EMOJI_PATTERN = new RegExp(
  "[\\u{1F000}-\\u{1FAFF}" + // pictographs, transport, supplemental, flags
    "\\u{2600}-\\u{27BF}" + // misc symbols & dingbats (☀⚠✨✅❌)
    "\\u{2B00}-\\u{2BFF}" + // stars, squares (⭐⬛)
    "\\u{2300}-\\u{23FF}" + // misc technical (⌘⌚⏰ — none are pdfLaTeX-safe)
    "\\u{2139}" + // ℹ
    "\\u{200B}-\\u{200D}" + // zero-width space/BNP/joiner
    "\\u{FE0E}\\u{FE0F}\\u{20E3}]", // variation selectors, keycap marker
  "gu",
);

// Keyboard modifiers carry meaning in app documentation, so they get readable
// text stand-ins instead of removal. Substituted before the emoji strip.
const SYMBOL_SUBSTITUTIONS: Array<[string, string]> = [
  ["\u{2318}", "Cmd"],
  ["\u{2325}", "Option"],
  ["\u{2303}", "Ctrl"],
  ["\u{21E7}", "Shift"],
];

function stripPdflatexUnsafe(markdown: string): { markdown: string; removed: number } {
  let substituted = markdown;
  for (const [symbol, replacement] of SYMBOL_SUBSTITUTIONS) {
    substituted = substituted.split(symbol).join(replacement);
  }
  let removed = 0;
  const cleaned = substituted.replace(EMOJI_PATTERN, () => {
    removed += 1;
    return "";
  });
  return { markdown: cleaned, removed };
}

// pdflatex only embeds PNG and JPEG; every other supported source format is
// converted with sharp before it lands in the bundle.
const DIRECT_EMBED_MIME: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
};

/**
 * GitHub-style alert boxes, one environment per kind (environment end code
 * cannot reference begin-code parameters, so each kind gets its own
 * definition with the colors inlined). An unbreakable minipage box — no
 * tcolorbox dependency, safe on plain pdflatex installs and Overleaf.
 */
const CALLOUT_KINDS = [
  ["note", "Note", "0969DA", "DDF4FF"],
  ["tip", "Tip", "1A7F37", "DAFBE1"],
  ["important", "Important", "8250DF", "FBEFFF"],
  ["warning", "Warning", "9A6700", "FFF8C5"],
  ["caution", "Caution", "CF222E", "FFEBE9"],
] as const;

const CALLOUT_COLORS = CALLOUT_KINDS.map(
  ([kind, , frame, background]) =>
    `\\definecolor{beeblionote-${kind}}{HTML}{${frame}}\n` +
    `\\definecolor{beeblionotebg-${kind}}{HTML}{${background}}`,
).join("\n");

const CALLOUT_ENVIRONMENTS = CALLOUT_KINDS.map(
  ([kind, label]) => String.raw`
\newenvironment{beeblionote-${kind}}{%
  \par\medskip\noindent
  \begin{lrbox}{\beeblionotebox}%
  \begin{minipage}{\dimexpr\linewidth-2\fboxsep-2\fboxrule\relax}%
  {\bfseries\color{beeblionote-${kind}}${label}.}\hspace{0.45em}\ignorespaces
}{%
  \end{minipage}%
  \end{lrbox}%
  \noindent\fcolorbox{beeblionote-${kind}}{beeblionotebg-${kind}}{\usebox{\beeblionotebox}}%
  \par\medskip
}
`,
).join("\n");

const CALLOUT_HEADER = [
  String.raw`\usepackage{xcolor}`,
  String.raw`\definecolor{beebliolink}{HTML}{1A5FB4}`,
  // Pandoc's writer quotes pdfkeywords values with \xmpquote, but not every
  // pandoc build's default template defines it — provide a no-op fallback.
  String.raw`\providecommand{\xmpquote}[1]{#1}`,
  String.raw`\newsavebox{\beeblionotebox}`,
  CALLOUT_COLORS,
  CALLOUT_ENVIRONMENTS,
].join("\n");

// Turns ::: {.callout-kind} divs into \begin/\end{beeblionote-kind} markers so
// the div's markdown content still renders while the box frames it.
const CALLOUT_LUA = String.raw`
function Div(el)
  local class = el.classes[1]
  if not class or not class:match('^callout%-') then return nil end
  local kind = class:gsub('^callout%-', '')
  local open = pandoc.RawBlock('latex', '\\begin{beeblionote-' .. kind .. '}')
  local close = pandoc.RawBlock('latex', '\\end{beeblionote-' .. kind .. '}')
  local blocks = { open }
  for _, block in ipairs(el.content) do table.insert(blocks, block) end
  table.insert(blocks, close)
  return blocks
end
`;

export type LatexBundleOptions = {
  /** Markdown with YAML front matter intact (pandoc builds the title block from it). */
  markdown: string;
  /** Document stem used for the .tex file inside the bundle. */
  stem: string;
  /** Client-rendered mermaid diagrams in document order (PNG preferred). */
  diagrams: Array<ExportDiagram | null>;
  /** Resolves markdown image sources to data URIs (workspace files, remote URLs). */
  loadImage: ImageLoader;
  /** Raw project references.bib; enables natbib citations instead of flattened text. */
  bibliography: string | null;
};

/**
 * Converts markdown to a self-contained LaTeX project zip: {stem}.tex plus
 * figures/ (workspace images and rendered mermaid diagrams as PNG) and
 * references.bib when the project bibliography is available. Pandoc does the
 * body conversion (markdown reader with tex_math_dollars, implicit figures,
 * and natbib citations for [@key] keys), so the .tex compiles with plain
 * pdflatex + BibTeX or uploads to Overleaf as-is.
 */
export async function convertMarkdownToLatexBundle(options: LatexBundleOptions): Promise<Uint8Array<ArrayBuffer>> {
  const workDir = await mkdtemp(path.join(tmpdir(), "beeblio-latex-"));
  try {
    const figures = new Map<string, Buffer>();
    const { markdown: safeMarkdown, removed: emojiRemoved } = stripPdflatexUnsafe(options.markdown);
    const citationMarkdown = options.bibliography !== null ? renderPandocCitations(safeMarkdown) : safeMarkdown;
    const prepared = await prepareMarkdown({ ...options, markdown: citationMarkdown }, figures);
    const hasFrontmatter = /^---[\t ]*\r?\n/.test(safeMarkdown);
    const args = [
      "--from=markdown+tex_math_dollars+implicit_figures",
      "--to=latex",
      "--standalone",
      "--lua-filter=callout.lua",
      "--include-in-header=beeblionote.tex",
      "--resource-path=.",
      "--output=-",
      "-V",
      "papersize=a4",
      "-V",
      "geometry:margin=25mm",
      "-V",
      "colorlinks=true",
      "-V",
      "linkcolor=beebliolink",
      "-V",
      "urlcolor=beebliolink",
      "-V",
      "citecolor=beebliolink",
    ];
    if (options.bibliography !== null) {
      args.push("--natbib", "--bibliography=references.bib");
      await writeFile(path.join(workDir, "references.bib"), options.bibliography, "utf8");
    }
    if (!hasFrontmatter) {
      const safeTitle = stripPdflatexUnsafe(options.stem).markdown.replace(/["\\]/g, "");
      args.push("--metadata", `title:${safeTitle}`);
    }
    await writeFile(path.join(workDir, "beeblionote.tex"), CALLOUT_HEADER, "utf8");
    await writeFile(path.join(workDir, "callout.lua"), CALLOUT_LUA, "utf8");
    if (figures.size > 0) {
      await mkdir(path.join(workDir, "figures"), { recursive: true });
      for (const [name, bytes] of figures) {
        await writeFile(path.join(workDir, "figures", name), bytes);
      }
    }

    const tex = (emojiRemoved > 0
      ? `% ${emojiRemoved} emoji or pictograph${emojiRemoved === 1 ? "" : "s"} removed for pdfLaTeX compatibility.\n`
      : "") + (await runPandoc(args, prepared, workDir));

    const zip = new JSZip();
    zip.file(`${options.stem}.tex`, tex);
    if (options.bibliography !== null) zip.file("references.bib", options.bibliography);
    if (figures.size > 0) {
      const folder = zip.folder("figures");
      for (const [name, bytes] of figures) folder?.file(name, bytes);
    }
    const bundle = await zip.generateAsync({ type: "uint8array", compression: "DEFLATE" });
    // Copy into a plainly-backed buffer: generated buffers may sit on a
    // shared or pooled ArrayBufferLike, which BodyInit rejects.
    const bytes = new Uint8Array(bundle.byteLength);
    bytes.set(bundle);
    return bytes;
  } finally {
    await rm(workDir, { recursive: true, force: true }).catch(() => undefined);
  }
}

function runPandoc(args: string[], markdown: string, cwd: string): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile(
      // Pandoc is resolved from the environment at runtime; the tracer must
      // not try to follow it (it would trace the whole project instead).
      /*turbopackIgnore: true*/ PANDOC,
      args,
      { cwd, encoding: "utf8", maxBuffer: PANDOC_MAX_BUFFER_BYTES, timeout: PANDOC_TIMEOUT_MS },
      (error, stdout, stderr) => {
        if (error) {
          const detail = stderr?.trim();
          if ((error as NodeJS.ErrnoException).code === "ENOENT") {
            reject(new Error("Pandoc is not installed on the server. Install it with: sudo apt-get install pandoc"));
            return;
          }
          reject(new Error(detail || "Pandoc conversion failed"));
          return;
        }
        resolve(stdout);
      },
    ).stdin?.end(markdown, "utf8");
  });
}

/**
 * Fence-aware pass over the markdown that:
 *  - replaces rendered ```mermaid blocks with figures/diagram-N.png images
 *  - rewrites image sources through the loader into figures/figure-N files
 *    (converted to PNG/JPEG for pdflatex; unresolvable images become italic
 *    placeholders so the .tex still compiles)
 *  - rewrites `> [!KIND]` callouts into fenced divs the lua filter boxes
 *
 * YAML front matter and fenced code pass through untouched; [@key] citations
 * are left for pandoc's citation reader.
 */
async function prepareMarkdown(
  { markdown, diagrams, loadImage }: LatexBundleOptions,
  figures: Map<string, Buffer>,
): Promise<string> {
  const lines = markdown.split("\n");
  const output: string[] = [];
  const imageCache = new Map<string, string | null>();
  let mermaidIndex = 0;
  let figureIndex = 0;

  const nextFigureName = (extension: string) => {
    figureIndex += 1;
    return `figure-${figureIndex}.${extension}`;
  };

  const inlineImages = async (line: string): Promise<string> => {
    if (!line.includes("![")) return line;
    for (const match of line.matchAll(IMAGE)) {
      const source = match[2];
      if (imageCache.has(source)) continue;
      imageCache.set(source, await resolveFigure(source, figures, nextFigureName, loadImage));
    }
    return line.replace(IMAGE, (_match, alt: string, source: string) => {
      const figure = imageCache.get(source) ?? null;
      return figure ? `![${alt}](${figure})` : `*(${alt || source} — figure omitted)*`;
    });
  };

  let fenceMarker: string | null = null;
  let pendingMermaid: { block: string[]; closed: boolean } | null = null;

  const flushMermaid = async () => {
    if (!pendingMermaid) return;
    if (pendingMermaid.closed) {
      const diagram = diagrams[mermaidIndex] ?? null;
      mermaidIndex += 1;
      let dataUri = diagram?.png || "";
      if (!dataUri && diagram?.svg) {
        dataUri = (await rasterizeSvgToPngDataUrl(diagram.svg)) ?? "";
      }
      const bytes = dataUri ? decodeDataUri(dataUri) : null;
      if (bytes) {
        const name = `diagram-${mermaidIndex}.png`;
        figures.set(name, bytes);
        output.push("", `![Diagram ${mermaidIndex}](figures/${name})`, "");
        pendingMermaid = null;
        return;
      }
      // No usable render: keep the diagram source as a code listing.
      output.push(...pendingMermaid.block);
    } else {
      output.push(...pendingMermaid.block);
    }
    pendingMermaid = null;
  };

  // Front matter is copied verbatim (pandoc builds the title block from it).
  let index = 0;
  if (FRONTMATTER_OPEN.test(lines[0] ?? "")) {
    output.push(lines[0]);
    for (index = 1; index < lines.length; index += 1) {
      output.push(lines[index]);
      if (FRONTMATTER_OPEN.test(lines[index]) && index > 0) break;
    }
    index += 1;
  }

  for (; index < lines.length; index += 1) {
    const line = lines[index];

    if (fenceMarker) {
      if (pendingMermaid) {
        pendingMermaid.block.push(line);
        if (FENCE_CLOSE.test(line)) {
          pendingMermaid.closed = true;
          fenceMarker = null;
        }
      } else {
        output.push(line);
        if (FENCE_CLOSE.test(line)) fenceMarker = null;
      }
      continue;
    }

    await flushMermaid();

    const mermaidOpen = line.match(MERMAID_FENCE_OPEN);
    if (mermaidOpen) {
      fenceMarker = mermaidOpen[1].slice(0, 1).repeat(3);
      pendingMermaid = { block: [line], closed: false };
      continue;
    }

    const fenceOpen = line.match(FENCE_OPEN);
    if (fenceOpen) {
      fenceMarker = fenceOpen[1].slice(0, 1).repeat(3);
      output.push(line);
      continue;
    }

    const callout = line.match(CALLOUT_MARKER);
    if (callout) {
      const kind = callout[1].toLowerCase();
      const content: string[] = [];
      index += 1;
      while (index < lines.length && BLOCKQUOTE_LINE.test(lines[index])) {
        content.push(lines[index].replace(/^ {0,3}>[\t ]?/, ""));
        index += 1;
      }
      index -= 1;
      output.push("", `::: {.callout-${kind}}`, ...content, ":::", "");
      continue;
    }

    output.push(await inlineImages(line));
  }

  await flushMermaid();

  return output.join("\n");
}

/**
 * Loads an image source and stages it in figures/. Returns the zip-relative
 * markdown source (figures/name.ext), or null when the source cannot be
 * resolved or converted — callers replace those with placeholders.
 */
async function resolveFigure(
  source: string,
  figures: Map<string, Buffer>,
  nextFigureName: (extension: string) => string,
  loadImage: ImageLoader,
): Promise<string | null> {
  let loaded: LoadedImage | null = null;
  try {
    loaded = await loadImage(source);
  } catch {
    loaded = null;
  }
  const match = loaded ? DATA_URI.exec(loaded.dataUri) : null;
  if (!match) return null;

  const [, mime, base64] = match;
  const direct = DIRECT_EMBED_MIME[mime];
  if (direct) {
    const name = nextFigureName(direct);
    figures.set(name, Buffer.from(base64, "base64"));
    return `figures/${name}`;
  }

  try {
    // SVG needs rasterization; GIF/WebP/AVIF/BMP just re-encode — pdflatex
    // embeds PNG and JPEG only.
    const png =
      mime === "image/svg+xml"
        ? await rasterizeSvgToPngDataUrl(Buffer.from(base64, "base64").toString("utf8"))
        : `data:image/png;base64,${(
            await sharp(Buffer.from(base64, "base64")).png().toBuffer()
          ).toString("base64")}`;
    const decoded = png ? decodeDataUri(png) : null;
    if (!decoded) return null;
    const name = nextFigureName("png");
    figures.set(name, decoded);
    return `figures/${name}`;
  } catch {
    return null;
  }
}

function decodeDataUri(dataUri: string): Buffer | null {
  const match = DATA_URI.exec(dataUri);
  return match ? Buffer.from(match[2], "base64") : null;
}
