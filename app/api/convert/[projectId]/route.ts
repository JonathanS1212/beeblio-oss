import { NextResponse } from "next/server";
import { z } from "zod";

import { getUser } from "@/lib/auth/session";
import { referenceFromEntry } from "@/lib/citations";
import { parseBibtexEntries, type BibtexEntry } from "@/lib/bibtex";
import { renderMarkdownBibliography, stripYamlFrontMatter } from "@/lib/markdown-bibliography";
import { renderMarkdownWithZoteroCitations } from "@/lib/document-export/zotero-fields";
import { renderMarkdownWithMendeleyCitations } from "@/lib/document-export/mendeley-fields";
import { PROJECT_BIBLIOGRAPHY_PATH } from "@/lib/project-bibliography";
import { readAgentWorkspaceFile } from "@/lib/workspace-gcs";
import {
  preprocessMarkdown,
  workspaceImagePath,
  workspacePathFromApiUrl,
  type ExportDiagram,
  type ImageLoader,
} from "@/lib/document-export/markdown-preprocess";
import { renderPrintHtml } from "@/lib/document-export/render-html";
import { separateProseLines } from "@/lib/document-export/paragraph-lines";
import { convertHtmlToPdf, PdfServiceError } from "@/lib/document-export/convert-pdf";
import { convertMarkdownToDocx } from "@/lib/document-export/convert-docx";
import { convertMarkdownToLatexBundle } from "@/lib/document-export/convert-latex";
import { convertMarkdownToPortableBundle } from "@/lib/document-export/convert-markdown";
import { rasterizeSvgToPngDataUrl } from "@/lib/document-export/rasterize-svg";
import { integerEnv } from "@/lib/env-config";

// Diagram PNGs are the largest payload component; these caps keep the JSON
// body bounded while leaving room for image-heavy documents.
const MAX_MARKDOWN_LENGTH = integerEnv("EXPORT_MAX_MARKDOWN_CHARS", 4_000_000, 1);
const MAX_DIAGRAMS = integerEnv("EXPORT_MAX_DIAGRAMS", 60, 0);
const MAX_SVG_LENGTH = integerEnv("EXPORT_MAX_SVG_BYTES", 4_000_000, 1);
const MAX_PNG_LENGTH = integerEnv("EXPORT_MAX_PNG_BYTES", 16_000_000, 1);
const MAX_REMOTE_IMAGE_BYTES = integerEnv("EXPORT_MAX_REMOTE_IMAGE_BYTES", 20_000_000, 1);
const REMOTE_IMAGE_TIMEOUT_MS = integerEnv("EXPORT_REMOTE_IMAGE_TIMEOUT_MS", 20_000, 1_000);

const diagramSchema = z.object({
  svg: z.string().max(MAX_SVG_LENGTH),
  png: z.string().max(MAX_PNG_LENGTH),
  width: z.number().positive(),
  height: z.number().positive(),
});

const convertRequestSchema = z.object({
  format: z.enum(["pdf", "docx", "latex", "markdown"]),
  filename: z.string().min(1).max(255),
  filePath: z.string().min(1).max(1024),
  markdown: z.string().max(MAX_MARKDOWN_LENGTH),
  diagrams: z.array(diagramSchema.nullable()).max(MAX_DIAGRAMS).optional(),
  /** Emits citations and the bibliography as Zotero Word fields instead of flattened text (DOCX only). */
  liveCitations: z.boolean().optional(),
  mendeleyCitations: z.boolean().optional(),
});

const MIME_TYPES = {
  pdf: "application/pdf",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  latex: "application/zip",
} as const;

function downloadStem(filename: string): string {
  const stem = filename.replace(/\.(?:md|markdown|mmd|mermaid|pdf|docx)$/i, "") || "document";
  return stem.replace(/["\\\r\n]/g, "_");
}

function downloadFilename(filename: string, format: "pdf" | "docx" | "latex" | "markdown"): string {
  const safeStem = downloadStem(filename);
  if (format === "latex") return `${safeStem}-latex.zip`;
  return `${safeStem}.${format}`;
}

// The agent workspace API serves every file as application/octet-stream, so
// image MIME types are derived from the file extension instead.
const IMAGE_MIME_BY_EXTENSION: Record<string, string> = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".avif": "image/avif",
  ".bmp": "image/bmp",
  ".svg": "image/svg+xml",
};

function extensionOf(filePath: string): string {
  const dot = filePath.lastIndexOf(".");
  return dot > 0 ? filePath.slice(dot).toLowerCase() : "";
}

/**
 * Builds an image loader that inlines workspace files (through the
 * authenticated agent workspace API) and remote http(s) URLs as data URIs.
 * Images that cannot be resolved are left untouched so the document still
 * converts.
 */
function createImageLoader(userId: string, projectId: string, filePath: string): ImageLoader {
  const cache = new Map<string, { dataUri: string } | null>();

  const loadWorkspaceFile = async (workspacePath: string): Promise<{ dataUri: string } | null> => {
    const mime = IMAGE_MIME_BY_EXTENSION[extensionOf(workspacePath)];
    if (!mime) return null;
    try {
      const response = await readAgentWorkspaceFile(userId, projectId, workspacePath);
      const bytes = new Uint8Array(await response.arrayBuffer());
      if (bytes.byteLength > MAX_REMOTE_IMAGE_BYTES) return null;
      return { dataUri: `data:${mime};base64,${Buffer.from(bytes).toString("base64")}` };
    } catch {
      return null;
    }
  };

  const loadRemoteImage = async (source: string): Promise<{ dataUri: string } | null> => {
    try {
      const response = await fetch(source, {
        signal: AbortSignal.timeout(REMOTE_IMAGE_TIMEOUT_MS),
        redirect: "follow",
      });
      if (!response.ok) return null;
      const contentType = response.headers.get("content-type") ?? "";
      if (!contentType.startsWith("image/")) return null;
      const bytes = new Uint8Array(await response.arrayBuffer());
      if (bytes.byteLength > MAX_REMOTE_IMAGE_BYTES) return null;
      return { dataUri: `data:${contentType};base64,${Buffer.from(bytes).toString("base64")}` };
    } catch {
      return null;
    }
  };

  return async (source) => {
    if (cache.has(source)) return cache.get(source) ?? null;

    const fromApiUrl = workspacePathFromApiUrl(source);
    const workspacePath = fromApiUrl ?? workspaceImagePath(filePath, source);
    const loaded = workspacePath
      ? await loadWorkspaceFile(workspacePath)
      : /^https?:\/\//i.test(source)
        ? await loadRemoteImage(source)
        : null;
    cache.set(source, loaded);
    return loaded;
  };
}

/**
 * Word drops SVG features it cannot rasterize (filters, foreignObject
 * content), so DOCX exports embed SVGs as PNGs. Chromium keeps the vector SVG
 * for PDF, which renders them natively.
 */
function rasterizingImageLoader(base: ImageLoader): ImageLoader {
  return async (source) => {
    const loaded = await base(source);
    if (!loaded?.dataUri.startsWith("data:image/svg+xml")) return loaded;
    const base64 = loaded.dataUri.slice(loaded.dataUri.indexOf(",") + 1);
    const png = await rasterizeSvgToPngDataUrl(Buffer.from(base64, "base64").toString("utf8"));
    return png ? { dataUri: png } : loaded;
  };
}

/** Loads the project bibliography; an unreadable or empty file yields no entries. */
async function loadProjectBibtexEntries(userId: string, projectId: string): Promise<BibtexEntry[]> {
  try {
    const response = await readAgentWorkspaceFile(userId, projectId, PROJECT_BIBLIOGRAPHY_PATH);
    if (!response.ok) return [];
    return parseBibtexEntries(await response.text());
  } catch {
    return [];
  }
}

/** Raw references.bib source for the LaTeX bundle; null when unavailable. */
async function readProjectBibtexSource(userId: string, projectId: string): Promise<string | null> {
  try {
    const response = await readAgentWorkspaceFile(userId, projectId, PROJECT_BIBLIOGRAPHY_PATH);
    if (!response.ok) return null;
    const text = await response.text();
    return text.trim() ? text : null;
  } catch {
    return null;
  }
}

/**
 * Fills server-rasterized PNGs for diagrams the client could not rasterize
 * (browser canvas quirks) before pandoc or the LaTeX bundle sees them.
 */
async function fillDiagramPngs(
  diagrams: Array<ExportDiagram | null>,
): Promise<Array<ExportDiagram | null>> {
  return Promise.all(
    diagrams.map(async (diagram) => {
      if (!diagram || diagram.png || !diagram.svg) return diagram;
      const png = await rasterizeSvgToPngDataUrl(diagram.svg);
      return png ? { ...diagram, png } : diagram;
    }),
  );
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ projectId: string }> },
) {
  const { projectId } = await params;
  const user = await getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = convertRequestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid conversion request" },
      { status: 400 },
    );
  }
  const { format, filename, filePath, markdown, diagrams = [], liveCitations = false, mendeleyCitations = false } = parsed.data;
  if ((liveCitations || mendeleyCitations) && format !== "docx") {
    return NextResponse.json({ error: "Live citations are only supported for DOCX export" }, { status: 400 });
  }
  if (liveCitations && mendeleyCitations) {
    return NextResponse.json({ error: "Choose one citation manager" }, { status: 400 });
  }

  try {
    const imageLoader = createImageLoader(user.id, projectId, filePath);
    const outputName = downloadFilename(filename, format);

    if (format === "latex") {
      // With the bibliography available, pandoc keeps [@key] as native
      // natbib citations and the raw references.bib ships inside the bundle;
      // without it, citations flatten to text exactly like the PDF/DOCX
      // paths. YAML front matter stays attached either way — the .tex title
      // block is built from it.
      const bibliography = await readProjectBibtexSource(user.id, projectId);
      const source =
        bibliography !== null
          ? markdown
          : renderMarkdownBibliography(markdown, {
              references: (await loadProjectBibtexEntries(user.id, projectId)).map(referenceFromEntry),
            });
      const bundle = await convertMarkdownToLatexBundle({
        markdown: source,
        stem: outputName.replace(/-latex\.zip$/, ""),
        diagrams: await fillDiagramPngs(diagrams as Array<ExportDiagram | null>),
        loadImage: imageLoader,
        bibliography,
      });
      return new NextResponse(bundle, {
        headers: {
          "Content-Type": MIME_TYPES.latex,
          "Content-Disposition": `attachment; filename="${outputName}"`,
          "Cache-Control": "no-store",
        },
      });
    }

    if (format === "markdown") {
      // Markdown export keeps YAML front matter (standard, portable metadata)
      // and flattens [@key] citations plus the bibliography to text exactly
      // like the print paths, in the citation style stored in the document's
      // bibliography marker — the style the visual editor's selector set.
      // Presentation markup is stripped and resolvable images bundled into a
      // zip next to the .md; with no images the plain .md is the whole export.
      const references = (await loadProjectBibtexEntries(user.id, projectId)).map(referenceFromEntry);
      const flattened = renderMarkdownBibliography(markdown, { references });
      const stem = downloadStem(filename);
      const { markdown: portable, bundle } = await convertMarkdownToPortableBundle({
        markdown: flattened,
        stem,
        loadImage: imageLoader,
      });
      if (bundle) {
        return new NextResponse(bundle, {
          headers: {
            "Content-Type": "application/zip",
            "Content-Disposition": `attachment; filename="${stem}-markdown.zip"`,
            "Cache-Control": "no-store",
          },
        });
      }
      return new NextResponse(portable, {
        headers: {
          "Content-Type": "text/markdown;charset=utf-8",
          "Content-Disposition": `attachment; filename="${stem}.md"`,
          "Cache-Control": "no-store",
        },
      });
    }

    // Shared document preparation: drop YAML front matter (metadata must not
    // print) and resolve [@key] citations plus the generated bibliography
    // against the project's references.bib, mirroring the visual editor.
    const entries = await loadProjectBibtexEntries(user.id, projectId);
    const references = entries.map(referenceFromEntry);
    const stripped = separateProseLines(stripYamlFrontMatter(markdown));
    // Without bibliography entries the live renderer has nothing to embed, so
    // both paths degrade to the plain flattened rendering.
    const live = (liveCitations || mendeleyCitations) && entries.length > 0;
    const source = mendeleyCitations && entries.length > 0
      ? renderMarkdownWithMendeleyCitations(stripped, entries)
      : live
      ? renderMarkdownWithZoteroCitations(stripped, { entries })
      : renderMarkdownBibliography(stripped, {
        references,
        citationAppearance: format === "pdf" ? "html" : "docx",
      });

    if (format === "pdf") {
      const preprocessed = await preprocessMarkdown(source, {
        diagrams: diagrams as Array<ExportDiagram | null>,
        diagramTarget: "html",
        loadImage: imageLoader,
      });
      const html = await renderPrintHtml(preprocessed, outputName);
      const pdf = await convertHtmlToPdf(html);
      return new NextResponse(pdf, {
        headers: {
          "Content-Type": MIME_TYPES.pdf,
          "Content-Disposition": `attachment; filename="${outputName}"`,
          "Cache-Control": "no-store",
        },
      });
    }

    // Client rasterization can fail (browser canvas quirks); fill any gaps
    // from the server before pandoc sees the markdown.
    const preprocessed = await preprocessMarkdown(source, {
      diagrams: await fillDiagramPngs(diagrams as Array<ExportDiagram | null>),
      diagramTarget: "pandoc",
      loadImage: rasterizingImageLoader(imageLoader),
    });
    const docx = await convertMarkdownToDocx(preprocessed, { rawOpenXml: live });
    return new NextResponse(docx, {
      headers: {
        "Content-Type": MIME_TYPES.docx,
        "Content-Disposition": `attachment; filename="${outputName}"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    if (error instanceof PdfServiceError) {
      return NextResponse.json({ error: error.message }, { status: 502 });
    }
    const message = error instanceof Error ? error.message : "Conversion failed";
    console.error("[convert] document conversion failed", error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
