import path from "node:path";

import { verifyOfficeViewerAccess } from "@/lib/office-viewer-access";
import { readWorkspaceFileAsResponse, WorkspaceFileError } from "@/lib/workspace-files";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const officeContentTypes: Record<string, string> = {
  ".doc": "application/msword",
  ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  ".odt": "application/vnd.oasis.opendocument.text",
  ".xls": "application/vnd.ms-excel",
  ".xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  ".ppt": "application/vnd.ms-powerpoint",
  ".pptx": "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  ".odp": "application/vnd.oasis.opendocument.presentation",
};

async function serveOfficeFile(request: Request, head: boolean) {
  try {
    const token = new URL(request.url).searchParams.get("token");
    if (!token) return new Response("Missing token", { status: 401 });
    const claims = verifyOfficeViewerAccess(token);
    const filename = path.posix.basename(claims.path);
    const contentType = officeContentTypes[path.posix.extname(filename).toLowerCase()];
    if (!contentType) return new Response("Unsupported Office file", { status: 400 });

    const response = await readWorkspaceFileAsResponse(
      claims.userId,
      claims.projectId,
      claims.path,
      {
        ifNoneMatch: request.headers.get("if-none-match") || undefined,
        range: request.headers.get("range") || undefined,
      },
    );
    response.headers.set("Content-Type", contentType);
    response.headers.set("Content-Disposition", `inline; filename*=UTF-8''${encodeURIComponent(filename)}`);
    return head ? new Response(null, { status: response.status, headers: response.headers }) : response;
  } catch (error) {
    if (error instanceof WorkspaceFileError) {
      return new Response(error.message, { status: error.status });
    }
    console.error("[office-viewer-file] failed", error);
    return new Response("Unauthorized", { status: 401 });
  }
}

export function GET(request: Request) {
  return serveOfficeFile(request, false);
}

export function HEAD(request: Request) {
  return serveOfficeFile(request, true);
}
