import path from "node:path";
import { and, eq } from "drizzle-orm";

import { db } from "@/db";
import { projects } from "@/db/schema";
import { getUser } from "@/lib/auth/session";
import { integerEnv } from "@/lib/env-config";
import { PROTECTED_WORKSPACE_MESSAGE } from "@/lib/protected-workspace";
import { isResearchWorkspaceDirectory } from "@/lib/research-workspace";
import {
  createWorkspaceUploadTicket,
  listWorkspaceFiles,
  WorkspaceFileError,
} from "@/lib/workspace-gcs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type UploadTicketRequest = {
  projectId?: unknown;
  subpath?: unknown;
  filename?: unknown;
  contentType?: unknown;
  sizeBytes?: unknown;
  overwrite?: unknown;
};

function normalizedSubpath(value: string): string {
  const trimmed = value.trim().replace(/^\/+|\/+$/g, "");
  if (!trimmed) return "";
  if (trimmed.length > 900 || trimmed.split("/").some((part) => !part || part === "." || part === "..")) {
    throw new WorkspaceFileError("Invalid upload folder", 400, "invalid_workspace_request");
  }
  return trimmed;
}

export async function POST(request: Request) {
  const user = await getUser();
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const body = await request.json() as UploadTicketRequest;
    if (typeof body.projectId !== "string" || !/^[A-Za-z0-9_-]+$/.test(body.projectId)) {
      return Response.json({ error: "Invalid project" }, { status: 400 });
    }
    if (typeof body.filename !== "string" || !body.filename.trim()) {
      return Response.json({ error: "A filename is required" }, { status: 400 });
    }
    if (typeof body.sizeBytes !== "number" || !Number.isSafeInteger(body.sizeBytes) || body.sizeBytes < 0) {
      return Response.json({ error: "Invalid file size" }, { status: 400 });
    }
    const maxBytes = integerEnv("MAX_UPLOAD_BYTES", 50_000_000, 1);
    if (body.sizeBytes > maxBytes) {
      return Response.json(
        { error: `File exceeds the ${(maxBytes / (1024 * 1024)).toFixed(0)} MiB upload limit` },
        { status: 413 },
      );
    }

    const project = await db.query.projects.findFirst({
      where: and(eq(projects.slug, body.projectId), eq(projects.userId, user.id)),
    });
    if (!project) return Response.json({ error: "Project not found" }, { status: 404 });

    const filename = path.posix.basename(body.filename.trim());
    if (filename === "." || filename === ".." || filename.includes("\0")) {
      return Response.json({ error: "Invalid filename" }, { status: 400 });
    }
    const subpath = normalizedSubpath(typeof body.subpath === "string" ? body.subpath : "");
    const workspacePath = path.posix.join(subpath, filename);
    if (isResearchWorkspaceDirectory(workspacePath)) {
      return Response.json({ error: PROTECTED_WORKSPACE_MESSAGE }, { status: 400 });
    }
    const overwrite = body.overwrite === true;
    const siblings = await listWorkspaceFiles(user.id, project.slug, subpath);
    const existing = siblings.find((entry) => entry.name.toLocaleLowerCase() === filename.toLocaleLowerCase());
    if (existing && (!overwrite || existing.path !== workspacePath || existing.isDir)) {
      return Response.json({ error: `“${filename}” already exists. Choose a different name.` }, { status: 409 });
    }

    const contentType = typeof body.contentType === "string" && body.contentType
      ? body.contentType.slice(0, 255)
      : "application/octet-stream";
    const ticket = await createWorkspaceUploadTicket(user.id, project.slug, workspacePath, {
      contentType,
      sizeBytes: body.sizeBytes,
    });
    return Response.json({
      ...ticket,
      uploadMethod: "POST",
      contentType,
      file: { name: filename, path: workspacePath, isDir: false, size: body.sizeBytes },
    });
  } catch (error) {
    const status = error instanceof WorkspaceFileError ? error.status : 500;
    console.error("[workspace-upload-ticket] failed", error);
    return Response.json(
      { error: error instanceof Error ? error.message : "Unable to prepare upload" },
      { status },
    );
  }
}
