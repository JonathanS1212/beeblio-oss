import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { projects } from "@/db/schema";
import { getUser } from "@/lib/auth/session";
import {
  provisionResearchWorkspace,
  RESEARCH_DRAFT_PATH,
} from "@/lib/research-workspace-template";
import { nanoid } from "nanoid";

export async function POST(req: Request) {
  try {
    const user = await getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const body = await req.json();
    const name = body.name as string;
    const description = typeof body.description === "string" ? body.description : undefined;
    if (typeof name !== "string" || !name.trim()) {
      return NextResponse.json({ error: "Name is required" }, { status: 400 });
    }

    const slug = nanoid(10);

    const [newProject] = await db
      .insert(projects)
      .values({ userId: user.id, name: name.trim(), slug, description: description?.trim() || null })
      .returning();

    try {
      await provisionResearchWorkspace({
        userId: user.id,
        projectSlug: newProject.slug,
      });
    } catch (error) {
      await db.delete(projects).where(eq(projects.id, newProject.id));
      throw error;
    }

    return NextResponse.json({
      success: true,
      slug: newProject.slug,
      destinationUrl: `/${newProject.slug}?file=${encodeURIComponent(RESEARCH_DRAFT_PATH)}`,
    });
  } catch (err: unknown) {
    console.error("API Route Error:", err);
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
