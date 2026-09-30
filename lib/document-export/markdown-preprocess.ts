/**
 * Fence-aware markdown preprocessing shared by the PDF and DOCX exporters:
 *  - replaces rendered ```mermaid fenced blocks with export assets
 *  - rewrites image sources through an async loader (workspace files and
 *    remote URLs become data URIs so downstream engines need no network or
 *    auth)
 *
 * Everything inside fenced code blocks is passed through untouched.
 */

export type ExportDiagram = {
  svg: string;
  png: string;
  width: number;
  height: number;
};

export type LoadedImage = { dataUri: string } | null;

export type ImageLoader = (source: string) => Promise<LoadedImage>;

type PreprocessOptions = {
  /** Client-rendered mermaid diagrams, in document order. */
  diagrams: Array<ExportDiagram | null>;
  /** "html" embeds the diagram SVG (vector, PDF); "pandoc" embeds the PNG. */
  diagramTarget: "html" | "pandoc";
  /** Optional resolver that maps a markdown image source to a data URI. */
  loadImage?: ImageLoader;
};

const FENCE_OPEN = /^\s{0,3}(```+|~~~+)/;
const FENCE_CLOSE = /^\s{0,3}(```+|~~~+)\s*$/;
const MERMAID_FENCE_OPEN = /^\s{0,3}(```+|~~~+)\s*mermaid\s*$/i;
const IMAGE = /!\[([^\]]*)\]\(\s*<?([^)\s<>]+)>?(?:\s+"[^"]*")?\s*\)/g;

/**
 * Extracts the source of every ```mermaid fenced block in document order.
 * The client renderer uses the same walk to pre-render diagrams, keeping
 * indices aligned with preprocessMarkdown's replacement pass.
 */
export function extractMermaidBlocks(markdown: string): string[] {
  const blocks: string[] = [];
  const lines = markdown.split("\n");

  let insideFence = false;
  let insideMermaid = false;
  let current: string[] = [];

  for (const line of lines) {
    if (insideFence) {
      if (insideMermaid) current.push(line);
      if (FENCE_CLOSE.test(line)) {
        if (insideMermaid) {
          current.pop(); // drop the closing fence line
          blocks.push(current.join("\n").trim());
          current = [];
          insideMermaid = false;
        }
        insideFence = false;
      }
      continue;
    }
    if (MERMAID_FENCE_OPEN.test(line)) {
      insideFence = true;
      insideMermaid = true;
      current = [];
    } else if (FENCE_OPEN.test(line)) {
      insideFence = true;
    }
  }
  return blocks;
}

function diagramFigure(diagram: ExportDiagram): string {
  return `<figure class="diagram">${diagram.svg}</figure>`;
}

function diagramImageMarkdown(diagram: ExportDiagram, index: number): string {
  const fallbackAlt = `Diagram ${index + 1}`;
  return `![${fallbackAlt}](${diagram.png})`;
}

async function inlineImages(line: string, loadImage: ImageLoader): Promise<string> {
  if (!line.includes("](") || !line.includes("![")) return line;
  const replacements = new Map<string, string>();
  for (const match of line.matchAll(IMAGE)) {
    const source = match[2];
    if (replacements.has(source)) continue;
    const loaded = await loadImage(source);
    if (loaded) replacements.set(source, loaded.dataUri);
  }
  if (replacements.size === 0) return line;
  return line.replace(IMAGE, (match, alt, source) =>
    replacements.has(source) ? `![${alt}](${replacements.get(source)})` : match,
  );
}

export async function preprocessMarkdown(markdown: string, options: PreprocessOptions): Promise<string> {
  const { diagrams, diagramTarget, loadImage } = options;
  const lines = markdown.split("\n");
  const output: string[] = [];

  let mermaidIndex = 0;
  let fenceMarker: string | null = null;
  let pendingMermaid: { block: string[]; closed: boolean } | null = null;

  const flushMermaid = () => {
    if (!pendingMermaid) return;
    if (pendingMermaid.closed) {
      const diagram = diagrams[mermaidIndex] ?? null;
      const usable =
        diagram && (diagramTarget === "html" ? diagram.svg : diagram.png) ? diagram : null;
      if (usable && diagramTarget === "html") {
        output.push("", diagramFigure(usable), "");
      } else if (usable && diagramTarget === "pandoc") {
        output.push("", diagramImageMarkdown(usable, mermaidIndex), "");
      } else {
        output.push(...pendingMermaid.block);
      }
      mermaidIndex += 1;
    } else {
      // Unterminated fence: keep the source untouched.
      output.push(...pendingMermaid.block);
    }
    pendingMermaid = null;
  };

  for (const line of lines) {
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

    // Flush the completed mermaid block on the first line after its closing
    // fence — including when that line opens another fence or ends the file.
    flushMermaid();

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

    output.push(loadImage ? await inlineImages(line, loadImage) : line);
  }

  flushMermaid();

  return output.join("\n");
}

/**
 * Resolves a markdown image source against the document's workspace path.
 * Returns the workspace-relative path, or null for absolute sources that
 * escape the workspace (URLs, site-absolute paths, traversal).
 */
export function workspaceImagePath(documentPath: string, imageSource: string): string | null {
  const source = imageSource.trim();
  if (!source || /^(?:[a-z][a-z\d+.-]*:|\/\/|\/)/i.test(source)) return null;

  const suffixIndex = [source.indexOf("?"), source.indexOf("#")]
    .filter((position) => position >= 0)
    .sort((left, right) => left - right)[0];
  const sourcePath = suffixIndex === undefined ? source : source.slice(0, suffixIndex);

  const segments = documentPath.split("/").slice(0, -1).filter(Boolean);
  for (const encodedSegment of sourcePath.replaceAll("\\", "/").split("/")) {
    if (!encodedSegment || encodedSegment === ".") continue;
    let segment = encodedSegment;
    try {
      segment = decodeURIComponent(encodedSegment);
    } catch {}
    if (segment === "..") {
      if (segments.length === 0) return null;
      segments.pop();
      continue;
    }
    if (segment === "." || segment.includes("/")) continue;
    segments.push(segment);
  }
  if (segments.length === 0) return null;
  return segments.join("/");
}

const WORKSPACE_API_PATTERN = /^(?:https?:\/\/[^/]+)?\/api\/workspace\/([^/]+)\/(.+)$/i;

/**
 * Recognizes image sources pointing at this app's own workspace API, either
 * site-absolute (/api/workspace/{projectId}/a/b.png) or fully qualified
 * (http://host/api/workspace/{projectId}/a/b.png), and returns the workspace
 * path so the server can read the file directly.
 */
export function workspacePathFromApiUrl(source: string): string | null {
  const withoutSuffix = source.split(/[?#]/, 1)[0];
  const match = withoutSuffix.match(WORKSPACE_API_PATTERN);
  if (!match) return null;
  const segments: string[] = [];
  for (const encoded of match[2].split("/")) {
    if (!encoded) continue;
    try {
      segments.push(decodeURIComponent(encoded));
    } catch {
      segments.push(encoded);
    }
  }
  return segments.length > 0 ? segments.join("/") : null;
}
