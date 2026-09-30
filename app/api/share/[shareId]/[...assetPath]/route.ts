import path from "node:path";
import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";

import { db } from "@/db";
import { publicFiles, projects } from "@/db/schema";
import {
  readAgentWorkspaceFile,
  createWorkspaceReadTicket,
  AgentWorkspaceError,
} from "@/lib/workspace-files";
import { resolveWorkspaceAssetPath } from "@/app/[projectId]/_components/editors/markdown-image-path";

// Serves a public share link: the shared file itself plus exactly the assets
// its markdown references (resolved relative to the document). Holders of a
// share URL get no other access to the project's workspace.

const MARKDOWN_IMAGE_SOURCE = /!\[[^\]]*\]\(\s*<?([^)\s>]+)>?[^)]*\)/g;
const HTML_IMAGE_SOURCE = /<img[^>]+src=["']([^"']+)["']/gi;

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

export async function GET(
  request: Request,
  { params }: { params: Promise<{ shareId: string; assetPath: string[] }> },
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
    const download = new URL(request.url).searchParams.get("download") === "file";
    const ticket = await createWorkspaceReadTicket(project.userId, project.slug, rel, {
      disposition: download ? "attachment" : "inline",
      filename: safeFilename,
    });
    return NextResponse.redirect(new URL(ticket.url, request.url), 307);
  } catch (error) {
    if (error instanceof AgentWorkspaceError) {
      return new NextResponse(error.message, { status: error.status });
    }
    console.error("[share-asset] agent workspace failed", error);
    return new NextResponse("Unable to reach workspace storage", { status: 502 });
  }
}
