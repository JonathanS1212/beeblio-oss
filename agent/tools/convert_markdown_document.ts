import path from "node:path";

import { defineTool } from "eve/tools";
import { z } from "zod";

import { parseBibtexEntries } from "../../lib/bibtex";
import { referenceFromEntry } from "../../lib/citations";
import { convertMarkdownToDocx } from "../../lib/document-export/convert-docx";
import { convertMarkdownToLatexBundle } from "../../lib/document-export/convert-latex";
import { convertMarkdownToPortableBundle } from "../../lib/document-export/convert-markdown";
import { convertHtmlToPdf } from "../../lib/document-export/convert-pdf";
import {
  preprocessMarkdown,
  extractMermaidBlocks,
  workspaceImagePath,
  workspacePathFromApiUrl,
  type ImageLoader,
} from "../../lib/document-export/markdown-preprocess";
import { rasterizeSvgToPngDataUrl } from "../../lib/document-export/rasterize-svg";
import { renderMermaidDiagrams } from "../../lib/document-export/render-mermaid";
import { renderPrintHtml } from "../../lib/document-export/render-html";
import { separateProseLines } from "../../lib/document-export/paragraph-lines";
import { renderMarkdownWithZoteroCitations } from "../../lib/document-export/zotero-fields";
import { renderMarkdownBibliography, stripYamlFrontMatter } from "../../lib/markdown-bibliography";
import { PROJECT_BIBLIOGRAPHY_PATH } from "../../lib/project-bibliography";
import { readWorkspaceFile, writeWorkspaceFile, WorkspaceFileError } from "../workspace-files";
import { officeWorkspace } from "../lib/office-files";
import { toWorkspaceRelativePath } from "../workspace-paths";

const MAX_SOURCE_BYTES = 4 * 1024 * 1024;
const MAX_IMAGE_BYTES = 20 * 1024 * 1024;
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

const inputSchema = z.object({
  sourcePath: z.string().min(1).max(1_024).describe("Existing .md or .markdown file in /workspace."),
  outputPath: z.string().min(1).max(1_024).describe(
    "New output path. Use .pdf for PDF, .docx for either Word format, .zip for LaTeX, and .md for portable Markdown.",
  ),
  format: z.enum(["pdf", "docx", "docx-zotero", "latex", "markdown"]),
}).strict();

function stemOf(filePath: string): string {
  return path.basename(filePath).replace(/\.(?:md|markdown)$/i, "") || "document";
}

function expectedExtension(format: z.infer<typeof inputSchema>["format"]): string {
  if (format === "pdf") return ".pdf";
  if (format === "docx" || format === "docx-zotero") return ".docx";
  if (format === "latex") return ".zip";
  return ".md";
}

async function readOptionalText(userId: string, projectSlug: string, workspacePath: string): Promise<string | null> {
  try {
    const { content } = await readWorkspaceFile(userId, projectSlug, workspacePath);
    const text = content.toString("utf8");
    return text.trim() ? text : null;
  } catch (error) {
    if (error instanceof WorkspaceFileError && error.status === 404) return null;
    throw error;
  }
}

function createWorkspaceImageLoader(userId: string, projectSlug: string, documentPath: string): ImageLoader {
  const cache = new Map<string, { dataUri: string } | null>();
  return async (source) => {
    if (cache.has(source)) return cache.get(source) ?? null;
    const workspacePath = workspacePathFromApiUrl(source) ?? workspaceImagePath(documentPath, source);
    if (!workspacePath) {
      cache.set(source, null);
      return null;
    }
    const relativePath = toWorkspaceRelativePath(workspacePath);
    const mime = IMAGE_MIME_BY_EXTENSION[path.extname(relativePath).toLowerCase()];
    if (!mime) {
      cache.set(source, null);
      return null;
    }
    try {
      const { content: bytes } = await readWorkspaceFile(userId, projectSlug, relativePath);
      const loaded = bytes.byteLength <= MAX_IMAGE_BYTES
        ? { dataUri: `data:${mime};base64,${bytes.toString("base64")}` }
        : null;
      cache.set(source, loaded);
      return loaded;
    } catch {
      cache.set(source, null);
      return null;
    }
  };
}

function rasterizingImageLoader(base: ImageLoader): ImageLoader {
  return async (source) => {
    const loaded = await base(source);
    if (!loaded?.dataUri.startsWith("data:image/svg+xml")) return loaded;
    const svg = Buffer.from(loaded.dataUri.slice(loaded.dataUri.indexOf(",") + 1), "base64").toString("utf8");
    const png = await rasterizeSvgToPngDataUrl(svg);
    return png ? { dataUri: png } : loaded;
  };
}

export default defineTool({
  description:
    "Convert an existing Markdown workspace file with Beeblio's high-fidelity editor export service. " +
    "Use this tool whenever the user asks to export or convert .md/.markdown to PDF, DOCX, DOCX with live Zotero fields, " +
    "a portable Markdown copy, or a LaTeX project bundle. It preserves supported Markdown formatting, math, citations, " +
    "bibliographies, callouts, and workspace images better than recreating an Office file from scratch. " +
    "The source must already be saved and the output must be a new file; the tool never overwrites.",
  inputSchema,
  async execute({ sourcePath, outputPath, format }, ctx) {
    const { identity } = officeWorkspace(ctx);
    const sourceWorkspacePath = toWorkspaceRelativePath(sourcePath);
    let outputWorkspacePath = toWorkspaceRelativePath(outputPath);

    if (!/\.(?:md|markdown)$/i.test(sourceWorkspacePath)) throw new Error("Source path must be a Markdown file.");
    const extension = expectedExtension(format);
    if (path.extname(outputWorkspacePath).toLowerCase() !== extension) {
      throw new Error(`Output path for ${format} must end in ${extension}.`);
    }
    if (sourceWorkspacePath === outputWorkspacePath) throw new Error("Source and output paths must be different.");
    if (!outputWorkspacePath.startsWith("4-Reports/")) {
      throw new Error("Markdown exports must be placed in /workspace/4-Reports/.");
    }

    const { content: sourceBytes } = await readWorkspaceFile(identity.userId, identity.projectSlug, sourceWorkspacePath);
    if (sourceBytes.byteLength > MAX_SOURCE_BYTES) throw new Error("Markdown source exceeds the 4 MiB conversion limit.");
    const markdown = sourceBytes.toString("utf8");
    const canonicalSourcePath = `/workspace/${sourceWorkspacePath}`;
    const loadImage = createWorkspaceImageLoader(identity.userId, identity.projectSlug, canonicalSourcePath);
    const bibliography = await readOptionalText(identity.userId, identity.projectSlug, PROJECT_BIBLIOGRAPHY_PATH);
    const entries = bibliography ? parseBibtexEntries(bibliography) : [];
    const references = entries.map(referenceFromEntry);
    const stem = stemOf(sourcePath);
    let bytes: Uint8Array;
    const warnings: string[] = [];

    if (format === "latex") {
      const diagrams = await renderMermaidDiagrams(extractMermaidBlocks(markdown));
      bytes = await convertMarkdownToLatexBundle({
        markdown: bibliography ? markdown : renderMarkdownBibliography(markdown, { references }),
        stem,
        diagrams,
        loadImage,
        bibliography,
      });
      const failedDiagrams = diagrams.filter((diagram) => diagram === null).length;
      if (failedDiagrams > 0) {
        warnings.push(
          `${failedDiagrams} Mermaid diagram(s) could not be rendered and are preserved as code in the LaTeX source.`,
        );
      }
    } else if (format === "markdown") {
      const portable = await convertMarkdownToPortableBundle({
        markdown: renderMarkdownBibliography(markdown, { references }),
        stem,
        loadImage,
      });
      if (portable.bundle) {
        outputWorkspacePath = outputWorkspacePath.replace(/\.md$/i, ".zip");
        bytes = portable.bundle;
        warnings.push("The portable Markdown export includes images, so it was saved as a ZIP bundle.");
      } else {
        bytes = Buffer.from(portable.markdown, "utf8");
      }
    } else {
      const stripped = separateProseLines(stripYamlFrontMatter(markdown));
      const liveCitations = format === "docx-zotero" && entries.length > 0;
      const source = liveCitations
        ? renderMarkdownWithZoteroCitations(stripped, { entries })
        : renderMarkdownBibliography(stripped, { references });
      if (format === "docx-zotero" && !liveCitations) {
        warnings.push("No references.bib entries were available, so citations were exported as plain text.");
      }
      // ```mermaid fences have no browser-rendered snapshot on this path;
      // render them server-side (Gotenberg Chromium) so exports match the
      // editor's download button. Failed renders stay as code blocks.
      const diagrams = await renderMermaidDiagrams(extractMermaidBlocks(source));
      if (format === "pdf") {
        const prepared = await preprocessMarkdown(source, { diagrams, diagramTarget: "html", loadImage });
        bytes = await convertHtmlToPdf(await renderPrintHtml(prepared, `${stem}.pdf`));
      } else {
        const prepared = await preprocessMarkdown(source, {
          diagrams,
          diagramTarget: "pandoc",
          loadImage: rasterizingImageLoader(loadImage),
        });
        bytes = await convertMarkdownToDocx(prepared, { rawOpenXml: liveCitations });
      }
      const failedDiagrams = diagrams.filter((diagram) => diagram === null).length;
      if (failedDiagrams > 0) {
        warnings.push(
          `${failedDiagrams} Mermaid diagram(s) could not be rendered and are preserved as code. ` +
            "For a browser-rendered export, open the document in the visual editor and use its Download button.",
        );
      }
    }

    if (sourceWorkspacePath === outputWorkspacePath) throw new Error("Source and output paths must be different.");
    try {
      await readWorkspaceFile(identity.userId, identity.projectSlug, outputWorkspacePath);
      throw new Error("The output file already exists. Choose a new versioned filename; conversion never overwrites files.");
    } catch (error) {
      if (!(error instanceof WorkspaceFileError) || error.status !== 404) throw error;
    }
    await writeWorkspaceFile(identity.userId, identity.projectSlug, outputWorkspacePath, bytes);
    if (extractMermaidBlocks(markdown).length > 0 && format === "markdown") {
      warnings.push("Mermaid fences are kept as code in Markdown exports; GitHub and VS Code render them natively.");
    }
    return { path: `/workspace/${outputWorkspacePath}`, format, sourcePath: canonicalSourcePath, byteLength: bytes.byteLength, warnings };
  },
});
