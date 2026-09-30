"use server";

import { and, eq, isNull } from "drizzle-orm";

import { db } from "@/db";
import { publicFiles, projects } from "@/db/schema";
import { requireUser } from "@/lib/auth/session";
import { getOwnedProject } from "./actions";
import { copyAgentWorkspacePath } from "@/lib/workspace-files";

export async function getPublicFileStatus(projectSlug: string, filePath: string) {
  const user = await requireUser();
  const proj = await getOwnedProject(user, projectSlug);
  if (!proj) return null;

  const file = await db.query.publicFiles.findFirst({
    where: and(
      eq(publicFiles.projectId, proj.id),
      eq(publicFiles.filePath, filePath)
    ),
  });

  return file?.id ?? null;
}

export async function setFilePublic(projectSlug: string, filePath: string, isPublic: boolean) {
  const user = await requireUser();
  const proj = await getOwnedProject(user, projectSlug);
  if (!proj) throw new Error("Unauthorized");

  if (isPublic) {
    const existing = await getPublicFileStatus(projectSlug, filePath);
    if (existing) return existing;

    const [inserted] = await db.insert(publicFiles).values({
      projectId: proj.id,
      filePath: filePath,
    }).returning({ id: publicFiles.id });
    
    return inserted.id;
  } else {
    await db.delete(publicFiles).where(
      and(
        eq(publicFiles.projectId, proj.id),
        eq(publicFiles.filePath, filePath)
      )
    );
    return null;
  }
}

export async function listUserProjects() {
  const user = await requireUser();
  return db.query.projects.findMany({
    where: and(eq(projects.userId, user.id), isNull(projects.deletedAt)),
    columns: { slug: true, name: true }
  });
}
