import { extractMermaidBlocks } from "@/lib/document-export/markdown-preprocess";

export type MarkdownDownloadFormat = "docx" | "docx-live" | "docx-mendeley" | "latex" | "markdown";

export type MarkdownDocumentDownload = {
  format: MarkdownDownloadFormat;
  filename: string;
  markdown: string;
  projectId: string;
  filePath: string;
};

type DiagramAsset = {
  svg: string;
  png: string;
  width: number;
  height: number;
};

const MAX_RASTER_WIDTH = 2000;

function filenameWithExtension(filename: string, format: MarkdownDownloadFormat) {
  const stem = filename.replace(/\.(?:md|markdown|mmd|mermaid|pdf|docx)$/i, "") || "document";
  if (format === "latex") return `${stem}-latex.zip`;
  const resolved = format === "markdown" ? "md" : format === "docx-live" || format === "docx-mendeley" ? "docx" : format;
  return `${stem}.${resolved}`;
}

function saveBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1_000);
}

/**
 * Mermaid SVGs can contain HTML-style markup (e.g. unclosed <br> inside
 * foreignObject labels) that strict XML parsers — the Image decode path and
 * librsvg — reject. Re-parsing through the forgiving HTML parser and
 * re-serializing yields well-formed XML with identical rendering.
 */
function repairSvg(svg: string): string {
  const parsed = new DOMParser().parseFromString(svg, "text/html");
  const svgElement = parsed.querySelector("svg");
  return svgElement ? new XMLSerializer().serializeToString(svgElement) : svg;
}

function parseViewBox(svg: string): { width: number; height: number } | null {
  const match = svg.match(/viewBox="([^"]+)"/);
  if (!match) return null;
  const parts = match[1].trim().split(/[\s,]+/).map(Number);
  if (parts.length !== 4 || parts.slice(2).some((value) => !Number.isFinite(value) || value <= 0)) return null;
  return { width: parts[2], height: parts[3] };
}

/**
 * Gives the SVG explicit pixel dimensions (mermaid only sets a max-width
 * style) and drops that inline style: it would override the print
 * stylesheet's max-width: 100% and let wide diagrams run past the page edge.
 */
function withDimensions(svg: string, width: number, height: number): string {
  const stripped = svg
    .replace(/\swidth="[^"]*"/, "")
    .replace(/\sheight="[^"]*"/, "");
  const withoutInlineMaxWidth = stripped.replace(/(<svg[^>]*?)\sstyle="[^"]*"/, "$1");
  return withoutInlineMaxWidth.replace(
    "<svg",
    `<svg width="${Math.round(width)}" height="${Math.round(height)}"`,
  );
}

async function rasterizeSvg(svg: string, width: number, height: number): Promise<string | null> {
  try {
    const image = new Image();
    image.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
    await image.decode();

    const displayWidth = Math.min(width, MAX_RASTER_WIDTH);
    const scale = displayWidth / width;
    const displayHeight = height * scale;

    const canvas = document.createElement("canvas");
    canvas.width = Math.round(displayWidth * 2);
    canvas.height = Math.round(displayHeight * 2);
    const context = canvas.getContext("2d");
    if (!context) return null;
    context.scale(2, 2);
    context.drawImage(image, 0, 0, displayWidth, displayHeight);
    return canvas.toDataURL("image/png");
  } catch {
    return null;
  }
}

/** Fallback: harvest an already-rendered preview SVG from the visual editor. */
async function harvestDiagramAsset(
  svg: SVGSVGElement,
  keep: "svg" | "png",
): Promise<DiagramAsset | null> {
  try {
    const bounds = svg.getBoundingClientRect();
    const width = Math.max(1, Math.ceil(bounds.width) || 640);
    const height = Math.max(1, Math.ceil(bounds.height) || 360);

    const clone = svg.cloneNode(true) as SVGSVGElement;
    clone.setAttribute("xmlns", "http://www.w3.org/2000/svg");
    const sized = withDimensions(new XMLSerializer().serializeToString(clone), width, height);
    if (keep === "svg") return { svg: sized, png: "", width, height };
    const png = await rasterizeSvg(sized, width, height);
    return png ? { svg: "", png, width, height } : null;
  } catch {
    return null;
  }
}

function livePreviewSvgs(): SVGSVGElement[] {
  const surface = document.querySelector<HTMLElement>(".beeblio-tiptap-document-surface");
  if (!surface) return [];
  return Array.from(surface.querySelectorAll<SVGSVGElement>(".beeblio-mermaid-preview svg"));
}

/**
 * Renders every ```mermaid block from source with the same mermaid instance
 * the editor preview uses (independent of the preview's lazy scroll
 * rendering). If a source render fails, falls back to the live preview SVG
 * for that block; failing both, the entry is null and the server keeps the
 * source code block. Only the asset the target format needs is kept in the
 * payload (PDF embeds the SVG, DOCX the rasterized PNG).
 */
async function renderDiagramAssets(
  markdown: string,
  keep: "svg" | "png",
): Promise<Array<DiagramAsset | null>> {
  const blocks = extractMermaidBlocks(markdown);
  if (blocks.length === 0) return [];

  const { mermaid } = await import("@streamdown/mermaid");
  // htmlLabels wraps labels in <foreignObject>, which Safari and most SVG
  // rasterizers refuse to draw — plain <text> labels rasterize everywhere.
  const instance = mermaid.getMermaid({
    flowchart: { htmlLabels: false },
    class: { htmlLabels: false },
  });
  const cache = new Map<string, DiagramAsset | null>();
  const rendered: Array<DiagramAsset | null> = [];
  let fallbacks: SVGSVGElement[] | null = null;

  for (const [index, source] of blocks.entries()) {
    if (cache.has(source)) {
      rendered.push(cache.get(source) ?? null);
      continue;
    }
    let asset: DiagramAsset | null = null;
    try {
      const { svg } = await instance.render(`beeblio-export-${index}`, source);
      const repaired = svg ? repairSvg(svg) : "";
      const dimensions = parseViewBox(repaired);
      if (repaired && dimensions) {
        const sized = withDimensions(repaired, dimensions.width, dimensions.height);
        if (keep === "svg") {
          asset = {
            svg: sized,
            png: "",
            width: Math.round(dimensions.width),
            height: Math.round(dimensions.height),
          };
        } else {
          const png = await rasterizeSvg(sized, dimensions.width, dimensions.height);
          if (png) {
            asset = {
              svg: "",
              png,
              width: Math.round(dimensions.width),
              height: Math.round(dimensions.height),
            };
          }
        }
      }
    } catch (error) {
      console.warn("[export] mermaid render failed", error);
      fallbacks ??= livePreviewSvgs();
      const live = fallbacks[index];
      if (live) asset = await harvestDiagramAsset(live, keep);
    }
    cache.set(source, asset);
    rendered.push(asset);
  }
  return rendered;
}

export async function downloadMarkdownDocument({
  format,
  filename,
  markdown,
  projectId,
  filePath,
}: MarkdownDocumentDownload) {
  const outputName = filenameWithExtension(filename, format);
  // The markdown export keeps ```mermaid blocks as fenced code (GitHub and
  // VS Code render them natively), so it pre-renders no diagram assets.
  const diagrams = format === "markdown"
    ? []
    : await renderDiagramAssets(markdown, "png");
  const response = await fetch(`/api/convert/${encodeURIComponent(projectId)}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      format: format === "docx-live" || format === "docx-mendeley" ? "docx" : format,
      filename,
      markdown,
      filePath,
      diagrams,
      liveCitations: format === "docx-live",
      mendeleyCitations: format === "docx-mendeley",
    }),
  });

  if (!response.ok) {
    const label = format === "latex" ? "LaTeX bundle" : format === "markdown" ? "Markdown" : format.toUpperCase();
    let message = `Unable to download ${label}`;
    try {
      const body = (await response.json()) as { error?: unknown };
      if (typeof body.error === "string") message = body.error;
    } catch {}
    throw new Error(message);
  }

  // The server picks the real artifact name — a markdown export becomes a zip
  // when the document has images — so prefer its choice over the local guess.
  const serverName = response.headers.get("content-disposition")?.match(/filename="([^"]+)"/)?.[1];
  saveBlob(await response.blob(), serverName || outputName);
}
