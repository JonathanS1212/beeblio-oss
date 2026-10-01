import path from "node:path";
import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";

import { db } from "@/db";
import { publicFiles, projects } from "@/db/schema";
import {
  readAgentWorkspaceFile,
  AgentWorkspaceError,
} from "@/lib/workspace-files";
import { resolveWorkspaceAssetPath } from "@/app/[projectId]/_components/editors/markdown-image-path";

// Serves a public share link: the shared file itself plus exactly the assets
// its markdown references (resolved relative to the document). Holders of a
// share URL get no other access to the project's workspace.

const MARKDOWN_IMAGE_SOURCE = /!\[[^\]]*\]\(\s*<?([^)\s>]+)>?[^)]*\)/g;
const HTML_IMAGE_SOURCE = /<img[^>]+src=["']([^"']+)["']/gi;

// Existing form files embed their own light/dark CSS, so add this bridge when
// serving a shared form. The parent can switch its theme without reloading the
// sandboxed iframe and discarding a respondent's in-progress answers.
const FORM_THEME_BRIDGE = `<script>
window.addEventListener("message", function (event) {
  if (event.source !== window.parent || !event.data || event.data.type !== "beeblio:theme") return;
  var theme = event.data.theme;
  if (theme !== "light" && theme !== "dark") return;
  var colors = theme === "dark" ? {
    "--bf-bg": "oklch(0.17 0.014 250)", "--bf-fg": "oklch(0.94 0.01 92)",
    "--bf-card": "oklch(0.205 0.016 250)", "--bf-primary": "oklch(0.72 0.09 240)",
    "--bf-primary-fg": "oklch(0.17 0.02 250)", "--bf-muted": "oklch(0.69 0.025 240)",
    "--bf-border": "oklch(0.42 0.02 245 / 45%)", "--bf-input": "oklch(0.45 0.025 245 / 55%)",
    "--bf-ring": "oklch(0.68 0.09 240)", "--bf-accent": "oklch(0.29 0.035 240)",
    "--bf-destructive": "oklch(0.704 0.191 22.216)"
  } : {
    "--bf-bg": "oklch(0.975 0.008 88)", "--bf-fg": "oklch(0.235 0.02 250)",
    "--bf-card": "oklch(0.995 0.004 88)", "--bf-primary": "oklch(0.4 0.085 245)",
    "--bf-primary-fg": "oklch(0.985 0.006 88)", "--bf-muted": "oklch(0.52 0.026 240)",
    "--bf-border": "oklch(0.882 0.017 91)", "--bf-input": "oklch(0.875 0.018 91)",
    "--bf-ring": "oklch(0.58 0.1 245)", "--bf-accent": "oklch(0.92 0.035 235)",
    "--bf-destructive": "oklch(0.577 0.245 27.325)"
  };
  var root = document.documentElement;
  Object.keys(colors).forEach(function (name) { root.style.setProperty(name, colors[name]); });
  root.style.colorScheme = theme;
});
</script>`;

async function referencedAssetPaths(
  ownerUserId: string,
  projectSlug: string,
  filePath: string,
): Promise<Set<string>> {
  const allowed = new Set<string>();
  if (!/\.(md|markdown|mdx)$/i.test(filePath)) return allowed;

  let markdown: string;
  try {
    const response = await readAgentWorkspaceFile(ownerUserId, projectSlug, filePath);
    markdown = await response.text();
  } catch {
    return allowed;
  }

  const sources = new Set<string>();
  for (const match of markdown.matchAll(MARKDOWN_IMAGE_SOURCE)) sources.add(match[1]);
  for (const match of markdown.matchAll(HTML_IMAGE_SOURCE)) sources.add(match[1]);

  for (const source of sources) {
    const resolved = resolveWorkspaceAssetPath(filePath, source);
    if (resolved) allowed.add(resolved.path);
  }
  return allowed;
}

const CONTENT_TYPES: Record<string, string> = {
  ".md": "text/markdown; charset=utf-8",
  ".markdown": "text/markdown; charset=utf-8",
  ".mdx": "text/markdown; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".htm": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".txt": "text/plain; charset=utf-8",
  ".csv": "text/csv; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".bmp": "image/bmp",
  ".avif": "image/avif",
  ".pdf": "application/pdf",
  ".mp3": "audio/mpeg",
  ".m4a": "audio/mp4",
  ".aac": "audio/aac",
  ".wav": "audio/wav",
  ".flac": "audio/flac",
  ".oga": "audio/ogg",
  ".ogg": "audio/ogg",
  ".opus": "audio/ogg",
  ".mp4": "video/mp4",
  ".m4v": "video/mp4",
  ".mov": "video/quicktime",
  ".webm": "video/webm",
  ".ogv": "video/ogg",
  ".doc": "application/msword",
  ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  ".xls": "application/vnd.ms-excel",
  ".xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  ".ppt": "application/vnd.ms-powerpoint",
  ".pptx": "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  ".odt": "application/vnd.oasis.opendocument.text",
  ".ods": "application/vnd.oasis.opendocument.spreadsheet",
  ".odp": "application/vnd.oasis.opendocument.presentation",
};

async function serveAsset(
  request: Request,
  { params }: { params: Promise<{ shareId: string; assetPath: string[] }> },
  head: boolean,
) {
  const { shareId, assetPath } = await params;
  const rel = assetPath.map((segment) => path.basename(segment)).join("/");

  const fileRecord = await db.query.publicFiles.findFirst({
    where: eq(publicFiles.id, shareId),
  });
  if (!fileRecord) return new NextResponse("Not Found", { status: 404 });

  const project = await db.query.projects.findFirst({
    where: eq(projects.id, fileRecord.projectId),
  });
  if (!project) return new NextResponse("Not Found", { status: 404 });

  if (rel !== fileRecord.filePath) {
    const allowed = await referencedAssetPaths(project.userId, project.slug, fileRecord.filePath);
    if (!allowed.has(rel)) {
      return new NextResponse("Not Found", { status: 404 });
    }
  }

  const filename = assetPath[assetPath.length - 1] ?? "file";
  const safeFilename = filename.replace(/["\\\r\n]/g, "_");

  try {
    // The generated form runtime derives its submit endpoint from this URL.
    // Keep the iframe on /api/share/... instead of redirecting to a file ticket.
    if (rel === fileRecord.filePath && rel.toLowerCase().endsWith(".form.html")) {
      const response = await readAgentWorkspaceFile(project.userId, project.slug, rel);
      const html = await response.text();
      const themedHtml = /<\/head>/i.test(html)
        ? html.replace(/<\/head>/i, `${FORM_THEME_BRIDGE}</head>`)
        : `${FORM_THEME_BRIDGE}${html}`;
      return new Response(head ? null : themedHtml, {
        headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" },
      });
    }

    const download = new URL(request.url).searchParams.get("download") === "file";
    const response = await readAgentWorkspaceFile(project.userId, project.slug, rel);
    const headers = new Headers(response.headers);
    headers.set("Content-Type", CONTENT_TYPES[path.extname(rel).toLowerCase()] ?? "application/octet-stream");
    headers.set("Content-Disposition", `${download ? "attachment" : "inline"}; filename*=UTF-8''${encodeURIComponent(safeFilename)}`);
    // Serve on the share URL itself. A ticket redirect can resolve against
    // localhost behind a tunnel, which public browsers cannot reach.
    return new Response(head ? null : response.body, {
      status: response.status,
      headers,
    });
  } catch (error) {
    if (error instanceof AgentWorkspaceError) {
      return new NextResponse(error.message, { status: error.status });
    }
    console.error("[share-asset] agent workspace failed", error);
    return new NextResponse("Unable to reach workspace storage", { status: 502 });
  }
}

type AssetContext = { params: Promise<{ shareId: string; assetPath: string[] }> };

export function GET(request: Request, context: AssetContext) {
  return serveAsset(request, context, false);
}

export function HEAD(request: Request, context: AssetContext) {
  return serveAsset(request, context, true);
}
