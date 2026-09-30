import path from "node:path";

import { getUser } from "@/lib/auth/session";
import {
  officeViewerPublicOrigin,
  signOfficeViewerAccess,
} from "@/lib/office-viewer-access";
import { readAgentWorkspaceFile, WorkspaceFileError } from "@/lib/workspace-gcs";

const officeExtensions = new Set([
  "doc", "docx", "odt",
  "xls", "xlsx",
  "ppt", "pptx", "odp",
]);

/**
 * Mints the public, short-lived URL that Microsoft's Office Online viewer
 * fetches the document from. `/api/office/file` serves the bytes; the `v`
 * query rides the GCS
 * generation ETag so a re-mount after an edit gets a fresh URL and the
 * viewer's server-side render cache misses.
 */
export async function GET(request: Request, { params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;
  const user = await getUser();
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const filePath = new URL(request.url).searchParams.get("path")?.trim();
  if (!filePath) return Response.json({ error: "File path is required" }, { status: 400 });
  const extension = path.posix.extname(filePath).slice(1).toLowerCase();
  if (!officeExtensions.has(extension)) {
    return Response.json({ error: "Unsupported Office file" }, { status: 400 });
  }

  try {
    // A one-byte range read yields the generation-based ETag without moving
    // the file; it changes on every overwrite from any writer.
    const probe = await readAgentWorkspaceFile(user.id, projectId, filePath, { range: "bytes=0-0" });
    const version = probe.headers.get("etag")?.replace(/"/g, "");
    const token = signOfficeViewerAccess({ aud: "office-viewer-file", userId: user.id, projectId, path: filePath });
    const appUrl = officeViewerPublicOrigin(request.url);
    const src = `${appUrl}/api/office/file?token=${encodeURIComponent(token)}` +
      (version ? `&v=${encodeURIComponent(version)}` : "");
    return Response.json({ src }, { headers: { "cache-control": "no-store" } });
  } catch (error) {
    if (error instanceof WorkspaceFileError) {
      return Response.json({ error: error.message }, { status: error.status });
    }
    console.error("[office-view] failed", error);
    return Response.json({ error: "Unable to open Office preview" }, { status: 502 });
  }
}
