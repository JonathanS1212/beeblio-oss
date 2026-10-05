import { and, eq, isNull } from "drizzle-orm";

import { db } from "@/db";
import { projects, publicFiles } from "@/db/schema";
import { getUser } from "@/lib/auth/session";
import { publicTunnelOrigin } from "@/lib/public-tunnel-origin";

/** One owner-scoped snapshot for all share controls in the mounted workspace. */
export async function GET(_request: Request, { params }: { params: Promise<{ projectId: string }> }) {
  const user = await getUser();
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const { projectId } = await params;
  const project = await db.query.projects.findFirst({
    where: and(
      eq(projects.slug, projectId),
      eq(projects.userId, user.id),
      isNull(projects.deletedAt),
    ),
    columns: { id: true },
  });
  if (!project) return Response.json({ error: "Project not found" }, { status: 404 });

  const files = await db.select({ filePath: publicFiles.filePath, id: publicFiles.id })
    .from(publicFiles)
    .where(eq(publicFiles.projectId, project.id));
  return Response.json({ files, publicOrigin: publicTunnelOrigin() }, { headers: { "Cache-Control": "no-store" } });
}
