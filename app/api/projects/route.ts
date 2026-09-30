import { NextResponse } from "next/server";
import { promises as fs } from "node:fs";
import path from "node:path";
import { db } from "@/db";
import { projects } from "@/db/schema";
import { getUser } from "@/lib/auth/session";
import { provisionResearchWorkspace } from "@/lib/research-workspace-template";
import { nanoid } from "nanoid";

export async function POST(req: Request) {
  try {
    const user = await getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const body = await req.json() as { name?: unknown; description?: unknown; folderPath?: unknown };
    if (typeof body.folderPath !== "string" || !path.isAbsolute(body.folderPath)) return NextResponse.json({ error: "Select an existing project folder" }, { status: 400 });
    const folderPath = await fs.realpath(body.folderPath);
    if (!(await fs.stat(folderPath)).isDirectory()) return NextResponse.json({ error: "Project path must be a folder" }, { status: 400 });
    const name = typeof body.name === "string" && body.name.trim() ? body.name.trim() : path.basename(folderPath);
    await provisionResearchWorkspace(folderPath);
    const slug = nanoid(10);
    const [project] = await db.insert(projects).values({ userId: user.id, name, slug, folderPath, description: typeof body.description === "string" ? body.description.trim() : null }).returning();
    return NextResponse.json({ success: true, slug: project.slug, destinationUrl: `/${project.slug}` });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Could not link folder" }, { status: 400 });
  }
}
