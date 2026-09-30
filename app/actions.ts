"use server";

import { and, count, desc, eq, isNull } from "drizzle-orm";
import { revalidatePath } from "next/cache";

import { db } from "@/db";
import { agentSessions, projects } from "@/db/schema";
import { requireUser } from "@/lib/auth/session";
import { integerEnv } from "@/lib/env-config";

export async function getProjects() {
  const user = await requireUser();
  return db
    .select()
    .from(projects)
    .where(and(eq(projects.userId, user.id), isNull(projects.deletedAt)))
    .orderBy(desc(projects.updatedAt));
}

export async function getWorkspaceDashboardData() {
  const user = await requireUser();

  const [ownedProjects, sessionCounts, recentSessions] = await Promise.all([
    db
      .select()
      .from(projects)
      .where(and(eq(projects.userId, user.id), isNull(projects.deletedAt)))
      .orderBy(desc(projects.updatedAt)),
    db
      .select({
        projectId: agentSessions.projectId,
        value: count(),
      })
      .from(agentSessions)
      .innerJoin(projects, eq(agentSessions.projectId, projects.id))
      .where(
        and(
          eq(projects.userId, user.id),
          isNull(projects.deletedAt),
          isNull(agentSessions.deletedAt),
          eq(agentSessions.status, "active"),
        ),
      )
      .groupBy(agentSessions.projectId),
    db
      .select({
        id: agentSessions.id,
        title: agentSessions.title,
        lastActiveAt: agentSessions.lastActiveAt,
        projectName: projects.name,
        projectSlug: projects.slug,
      })
      .from(agentSessions)
      .innerJoin(projects, eq(agentSessions.projectId, projects.id))
      .where(
        and(
          eq(projects.userId, user.id),
          isNull(projects.deletedAt),
          isNull(agentSessions.deletedAt),
          eq(agentSessions.status, "active"),
        ),
      )
      .orderBy(desc(agentSessions.lastActiveAt))
      .limit(integerEnv("DASHBOARD_RECENT_SESSIONS", 5, 1)),
  ]);

  const countsByProject = new Map(
    sessionCounts.map(({ projectId, value }) => [projectId, value]),
  );
  return {
    projects: ownedProjects.map((project) => ({
      ...project,
      activeSessionCount: countsByProject.get(project.id) ?? 0,
    })),
    recentSessions,
  };
}

// Soft-delete (sets deleted_at) so the project disappears from lists but its
// files aren't orphaned. Matches the deployment-plan deleted_at intent.
export async function deleteProject(id: string) {
  const user = await requireUser();
  await db
    .update(projects)
    .set({ deletedAt: new Date(), updatedAt: new Date() })
    .where(and(eq(projects.id, id), eq(projects.userId, user.id)));
  revalidatePath("/workspace");
}
export async function editProject(id: string, data: { name: string; description?: string }) {
  const user = await requireUser();
  await db
    .update(projects)
    .set({ 
      name: data.name, 
      description: data.description || null,
      updatedAt: new Date() 
    })
    .where(and(eq(projects.id, id), eq(projects.userId, user.id)));
  revalidatePath("/workspace");
}
