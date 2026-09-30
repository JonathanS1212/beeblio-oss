/**
 * Server-side Mermaid rendering for agent-run exports.
 *
 * The editor's download button pre-renders every ```mermaid fence in the
 * browser and ships the snapshots to /api/convert. The agent-side
 * convert_markdown_document tool has no browser, so it uses this module
 * instead: each diagram is rendered by the mermaid bundle (vendored in
 * assets/mermaid-js.ts — the sandbox has no network) inside Gotenberg's
 * Chromium via the /forms/chromium/screenshot/html route, captured as a
 * selector screenshot of the diagram element at deviceScaleFactor 2. The
 * result is returned as an ExportDiagram that the shared export pipeline
 * embeds in place of the fence (the PDF figure embeds the PNG; DOCX/LaTeX
 * embed it as an image reference).
 *
 * Any failure renders as null, and preprocessMarkdown keeps the fence as a
 * code block — the export never fails because of one bad diagram.
 */
import sharp from "sharp";

import { MERMAID_JS } from "@/lib/document-export/assets/mermaid-js";
import { gotenbergRequest } from "@/lib/document-export/gotenberg-sandbox";
import type { ExportDiagram } from "@/lib/document-export/markdown-preprocess";

// Layout viewport; the selector screenshot captures the full diagram element
// even when it is wider, so this only affects line-wrapping during layout.
const VIEWPORT_WIDTH = 1600;
const VIEWPORT_HEIGHT = 1200;
const DEVICE_SCALE_FACTOR = 2;
// A document with more diagrams than this is better served by fewer, larger
// figures; extra fences stay as reviewable code blocks.
const MAX_DIAGRAMS = 24;
const MIN_PNG_BYTES = 800;

function renderPage(source: string): string {
  return `<!doctype html><html><head><meta charset="utf-8" />
<style>html,body{margin:0;padding:0;background:#ffffff}#d{display:inline-block;background:#ffffff}</style>
</head><body><div id="d"></div>
<script>${MERMAID_JS}</script>
<script>
window.__done = false; window.__failed = false;
mermaid.initialize({
  startOnLoad: false,
  securityLevel: "strict",
  theme: "default",
  // htmlLabels wraps labels in <foreignObject>, which rasterizers and strict
  // SVG consumers refuse — plain <text> labels match the editor's export.
  flowchart: { htmlLabels: false, useMaxWidth: false },
  class: { htmlLabels: false },
});
mermaid.render("beeblio-diagram", ${JSON.stringify(source)})
  .then(({ svg }) => { document.getElementById("d").innerHTML = svg; window.__done = true; })
  .catch(() => { window.__failed = true; });
</script>
</body></html>`;
}

async function screenshotDiagramPng(source: string): Promise<ExportDiagram | null> {
  const form = new FormData();
  form.append("files", new Blob([renderPage(source)], { type: "text/html" }), "index.html");
  form.set("width", String(VIEWPORT_WIDTH));
  form.set("height", String(VIEWPORT_HEIGHT));
  form.set("selector", "#d");
  form.set("format", "png");
  form.set("deviceScaleFactor", String(DEVICE_SCALE_FACTOR));
  // Bounded wait: a broken diagram resolves __failed instead of hanging the
  // request until the API timeout.
  form.set("waitForExpression", "window.__done === true || window.__failed === true");

  const response = await gotenbergRequest("/forms/chromium/screenshot/html", { method: "POST", body: form });
  if (!response.ok) return null;
  const png = Buffer.from(await response.arrayBuffer());
  if (png.byteLength < MIN_PNG_BYTES) return null;

  const meta = await sharp(png).metadata();
  if (!meta.width || !meta.height || meta.width < 8 || meta.height < 8) return null;
  const dataUri = `data:image/png;base64,${png.toString("base64")}`;
  return {
    // The PDF pipeline embeds diagram.svg inside <figure class="diagram">,
    // where print styles constrain SVGs; the raster fallback carries its own.
    svg: `<img src="${dataUri}" alt="Diagram" style="max-width:100%;height:auto" />`,
    png: dataUri,
    width: Math.round(meta.width / DEVICE_SCALE_FACTOR),
    height: Math.round(meta.height / DEVICE_SCALE_FACTOR),
  };
}

async function renderDiagram(source: string): Promise<ExportDiagram | null> {
  try {
    return await screenshotDiagramPng(source);
  } catch (error) {
    console.warn("[render-mermaid] diagram render failed", error);
    return null;
  }
}

/**
 * Renders mermaid sources (as returned by extractMermaidBlocks, in document
 * order) into export diagrams. Identical sources render once. Sources beyond
 * MAX_DIAGRAMS and every failed render come back null, which keeps the
 * original fence in the exported document.
 */
export async function renderMermaidDiagrams(blocks: string[]): Promise<Array<ExportDiagram | null>> {
  const cache = new Map<string, ExportDiagram | null>();
  const rendered: Array<ExportDiagram | null> = [];
  for (const [index, source] of blocks.entries()) {
    if (index >= MAX_DIAGRAMS) {
      rendered.push(null);
      continue;
    }
    if (!cache.has(source)) cache.set(source, await renderDiagram(source));
    rendered.push(cache.get(source) ?? null);
  }
  return rendered;
}
