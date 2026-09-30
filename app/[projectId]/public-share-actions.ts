"use server";

import path from "node:path";
import { and, eq } from "drizzle-orm";

import { db } from "@/db";
import { publicFiles, projects } from "@/db/schema";
import { requireUser } from "@/lib/auth/session";
import { getOwnedProject } from "./actions";
import { readAgentWorkspaceFile, writeAgentWorkspaceFile, copyAgentWorkspacePath } from "@/lib/workspace-gcs";

export async function copyPublicFile(shareId: string, destinationProjectSlug: string) {
  const user = await requireUser();
  const destProj = await getOwnedProject(user, destinationProjectSlug);
  if (!destProj) throw new Error("Unauthorized destination project");

  const fileRecord = await db.query.publicFiles.findFirst({
    where: eq(publicFiles.id, shareId),
  });
  if (!fileRecord) throw new Error("Shared file not found");

  const sourceProj = await db.query.projects.findFirst({
    where: eq(projects.id, fileRecord.projectId),
  });
  if (!sourceProj) throw new Error("Source project not found");

  const sourceResponse = await readAgentWorkspaceFile(sourceProj.userId, sourceProj.slug, fileRecord.filePath);
  if (!sourceResponse.ok) throw new Error("Failed to read source file");

  const arrayBuffer = await sourceResponse.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);

  const destPath = path.posix.basename(fileRecord.filePath);
  await writeAgentWorkspaceFile(user.id, destProj.slug, destPath, buffer);

  return destPath;
}
