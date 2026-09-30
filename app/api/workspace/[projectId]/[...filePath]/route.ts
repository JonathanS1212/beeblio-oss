import path from "node:path";
import { NextResponse } from "next/server";
import { eq, and } from "drizzle-orm";

import { db } from "@/db";
import { projects, publicFiles } from "@/db/schema";
import { getUser } from "@/lib/auth/session";
import {
  createWorkspaceReadTicket,
  getWorkspaceFileFingerprint,
  AgentWorkspaceError,
} from "@/lib/workspace-gcs";

async function resolveFileRequest(
  request: Request,
  { params }: { params: Promise<{ projectId: string; filePath: string[] }> },
  metadataOnly: boolean,
) {
  const { projectId, filePath } = await params;
  const rel = filePath.map((seg) => path.basename(seg)).join("/");

  const user = await getUser();

  // slug is unique per user, not globally: every user's demo project shares
  // one slug. Owners resolve their own row; everyone else resolves through a
  // public record so the exact shared project is used, not an arbitrary
  // same-slug row.
  const owned = user
    ? await db.query.projects.findFirst({
        where: and(eq(projects.slug, projectId), eq(projects.userId, user.id)),
      })
    : null;

  let ownerUserId: string;
  if (owned) {
    ownerUserId = owned.userId;
  } else {
    const [shared] = await db
      .select({ userId: projects.userId })
      .from(publicFiles)
      .innerJoin(projects, eq(publicFiles.projectId, projects.id))
      .where(and(eq(projects.slug, projectId), eq(publicFiles.filePath, rel)))
      .limit(1);
    if (!shared) {
      return new NextResponse("Unauthorized", { status: 401 });
    }
    ownerUserId = shared.userId;
  }

  const filename = filePath[filePath.length - 1] ?? "file";
  const safeFilename = filename.replace(/["\\\r\n]/g, "_");
  const download = new URL(request.url).searchParams.get("download");

  try {
    if (download === "folder") {
      return new NextResponse("Folder archives must be requested through the archive endpoint", { status: 400 });
    }
    if (metadataOnly) {
      const metadata = await getWorkspaceFileFingerprint(ownerUserId, projectId, rel);
      return new NextResponse(null, {
        headers: {
          ETag: metadata.etag,
          "Content-Length": metadata.size,
          ...(metadata.updated ? { "Last-Modified": new Date(metadata.updated).toUTCString() } : {}),
          "Cache-Control": "no-store",
        },
      });
    }
    const ticket = await createWorkspaceReadTicket(ownerUserId, projectId, rel, {
      disposition: download === "file" ? "attachment" : "inline",
      filename: safeFilename,
    });
    return NextResponse.redirect(ticket.url, 307);
  } catch (error) {
    if (error instanceof AgentWorkspaceError) {
      return new NextResponse(error.message, { status: error.status });
    }
    console.error("[workspace-download] agent workspace failed", error);
    return new NextResponse("Unable to reach workspace storage", { status: 502 });
  }
}

type FileRouteContext = { params: Promise<{ projectId: string; filePath: string[] }> };

export function GET(request: Request, context: FileRouteContext) {
  return resolveFileRequest(request, context, false);
}

export function HEAD(request: Request, context: FileRouteContext) {
  return resolveFileRequest(request, context, true);
}
