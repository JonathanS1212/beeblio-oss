import path from "node:path";
import { eq } from "drizzle-orm";

import { db } from "@/db";
import { projects, publicFiles } from "@/db/schema";
import { officeViewerPublicOrigin } from "@/lib/office-viewer-access";
import { getWorkspaceFileFingerprint, WorkspaceFileError } from "@/lib/workspace-files";

const officeExtensions = new Set([
  "doc", "docx", "odt",
  "xls", "xlsx",
  "ppt", "pptx", "odp",
]);

/** Supplies Microsoft Office Online with the one file published by this share. */
export async function GET(request: Request, { params }: { params: Promise<{ shareId: string }> }) {
  const { shareId } = await params;
  const fileRecord = await db.query.publicFiles.findFirst({
    where: eq(publicFiles.id, shareId),
  });
  if (!fileRecord) return Response.json({ error: "Shared file not found" }, { status: 404 });

  const extension = path.posix.extname(fileRecord.filePath).slice(1).toLowerCase();
  if (!officeExtensions.has(extension)) {
    return Response.json({ error: "Unsupported Office file" }, { status: 400 });
  }

  const project = await db.query.projects.findFirst({
    where: eq(projects.id, fileRecord.projectId),
  });
  if (!project) return Response.json({ error: "Shared file not found" }, { status: 404 });

  try {
    const metadata = await getWorkspaceFileFingerprint(project.userId, project.slug, fileRecord.filePath);
    const version = metadata.etag.replace(/"/g, "");
    const encodedPath = fileRecord.filePath.split("/").map(encodeURIComponent).join("/");
    const origin = officeViewerPublicOrigin(request.url);
    const src = `${origin}/api/share/${encodeURIComponent(shareId)}/${encodedPath}?v=${encodeURIComponent(version)}`;
    return Response.json({ src }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    if (error instanceof WorkspaceFileError) {
      return Response.json({ error: error.message }, { status: error.status });
    }
    console.error("[shared-office-view] failed", error);
    return Response.json({ error: "Unable to open Office preview" }, { status: 502 });
  }
}
