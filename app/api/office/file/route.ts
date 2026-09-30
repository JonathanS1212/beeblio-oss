import path from "node:path";

import { verifyOfficeViewerAccess } from "@/lib/office-viewer-access";
import { createWorkspaceReadTicket } from "@/lib/workspace-gcs";

export async function GET(request: Request) {
  try {
    const token = new URL(request.url).searchParams.get("token");
    if (!token) return new Response("Missing token", { status: 401 });
    const claims = verifyOfficeViewerAccess(token);
    const ticket = await createWorkspaceReadTicket(
      claims.userId,
      claims.projectId,
      claims.path,
      { disposition: "inline", filename: path.posix.basename(claims.path) },
    );
    return Response.redirect(ticket.url, 307);
  } catch (error) {
    console.error("[office-viewer-file] failed", error);
    return new Response("Unauthorized", { status: 401 });
  }
}
