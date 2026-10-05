"use server";

import { and, eq, isNull } from "drizzle-orm";

import { db } from "@/db";
import { publicFiles, projects } from "@/db/schema";
import { requireUser } from "@/lib/auth/session";
import { getOwnedProject } from "./actions";

export async function setFilePublic(projectSlug: string, filePath: string, isPublic: boolean) {
  const user = await requireUser();
  const proj = await getOwnedProject(user, projectSlug);
  if (!proj) throw new Error("Unauthorized");

  if (isPublic) {
    const [inserted] = await db.insert(publicFiles).values({
      projectId: proj.id,
      filePath: filePath,
    }).onConflictDoNothing().returning({ id: publicFiles.id });
    if (inserted) return inserted.id;
    const existing = await db.query.publicFiles.findFirst({
      where: and(eq(publicFiles.projectId, proj.id), eq(publicFiles.filePath, filePath)),
      columns: { id: true },
    });
    if (!existing) throw new Error("Unable to find shared file");
    return existing.id;
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
