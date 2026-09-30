import { and, eq } from "drizzle-orm";

import { db } from "@/db";
import { projects } from "@/db/schema";
import { getUser } from "@/lib/auth/session";
import { statWorkspaceFile, WorkspaceFileError } from "@/lib/workspace-gcs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type UploadConfirmationRequest = {
  projectId?: unknown;
  path?: unknown;
  sizeBytes?: unknown;
};

export async function POST(request: Request) {
  const user = await getUser();
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const body = await request.json() as UploadConfirmationRequest;
    if (typeof body.projectId !== "string" || !/^[A-Za-z0-9_-]+$/.test(body.projectId)) {
      return Response.json({ error: "Invalid project" }, { status: 400 });
    }
    if (typeof body.path !== "string" || !body.path.trim()) {
      return Response.json({ error: "Invalid upload path" }, { status: 400 });
    }
    if (typeof body.sizeBytes !== "number" || !Number.isSafeInteger(body.sizeBytes) || body.sizeBytes < 0) {
      return Response.json({ error: "Invalid file size" }, { status: 400 });
    }

    const project = await db.query.projects.findFirst({
      where: and(eq(projects.slug, body.projectId), eq(projects.userId, user.id)),
    });
    if (!project) return Response.json({ error: "Project not found" }, { status: 404 });

    const file = await statWorkspaceFile(user.id, project.slug, body.path);
    return Response.json({ uploaded: !file.isDir && file.size === body.sizeBytes });
  } catch (error) {
    if (error instanceof WorkspaceFileError && error.status === 404) {
      return Response.json({ uploaded: false });
    }
    const status = error instanceof WorkspaceFileError ? error.status : 500;
    console.error("[workspace-upload-confirm] failed", error);
    return Response.json(
      { error: error instanceof Error ? error.message : "Unable to confirm upload" },
      { status },
    );
  }
}
