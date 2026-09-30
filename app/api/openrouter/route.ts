import { and, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";

import { db } from "@/db";
import { projects, userOpenRouterCredentials } from "@/db/schema";
import { getUser } from "@/lib/auth/session";
import { getUserPlan } from "@/lib/entitlements/user";
import {
  decryptOpenRouterKey,
  encryptOpenRouterKey,
  getOpenRouterCredential,
  invalidateOpenRouterKeyCache,
} from "@/lib/openrouter-credential";
import { parseProjectSettings } from "@/lib/project-settings";
import { revalidatePath } from "next/cache";

export const dynamic = "force-dynamic";

const inputSchema = z.object({
  projectId: z.string().min(1).max(200),
  apiKey: z.string().trim().min(10).max(500).optional(),
  modelId: z.string().trim().min(3).max(200).regex(/^[a-zA-Z0-9._:/~-]+$/),
  enabled: z.boolean(),
});

async function paidUser() {
  const user = await getUser();
  if (!user) return null;
  return (await getUserPlan(user.id)) === "free" ? null : user;
}

async function inspectOpenRouter(apiKey: string, modelId: string) {
  const headers = { authorization: `Bearer ${apiKey}`, accept: "application/json" };
  const [keyResponse, modelsResponse] = await Promise.all([
    fetch("https://openrouter.ai/api/v1/key", { headers, cache: "no-store", signal: AbortSignal.timeout(12_000) }),
    fetch(`https://openrouter.ai/api/v1/model/${encodeURI(modelId)}`, { headers, cache: "no-store", signal: AbortSignal.timeout(12_000) }),
  ]);
  if (!keyResponse.ok) throw new Error("OpenRouter rejected this API key.");
  if (!modelsResponse.ok) throw new Error("OpenRouter could not find this model ID.");
  const model = await modelsResponse.json() as { data?: { context_length?: number; supported_parameters?: string[] } };
  const data = model.data;
  if (!data?.supported_parameters?.includes("tools")) {
    throw new Error("This model does not support tool calling, which Beeblio conversations require.");
  }
  return { contextLength: data.context_length ?? 128_000 };
}

export async function GET(request: Request) {
  const user = await getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const [plan, credential] = await Promise.all([getUserPlan(user.id), getOpenRouterCredential(user.id)]);

  const projectId = new URL(request.url).searchParams.get("projectId");
  let openRouterSetting: { enabled: boolean; modelId: string } | null = null;
  if (projectId) {
    const project = await db.query.projects.findFirst({
      where: and(eq(projects.slug, projectId), eq(projects.userId, user.id)),
    });
    if (project) {
      const parsed = parseProjectSettings(project.settings);
      openRouterSetting = {
        enabled: parsed.openRouter.enabled,
        modelId: parsed.openRouter.modelId,
      };
    }
  }

  return NextResponse.json({
    paid: plan !== "free",
    hasCredential: Boolean(credential),
    maskedKey: credential?.maskedKey ?? null,
    verifiedAt: credential?.verifiedAt?.toISOString() ?? null,
    ...(openRouterSetting ? {
      modelId: openRouterSetting.modelId,
      enabled: openRouterSetting.enabled,
    } : {}),
  }, { headers: { "Cache-Control": "no-store" } });
}

export async function PUT(request: Request) {
  const user = await paidUser();
  if (!user) return NextResponse.json({ error: "A paid plan is required." }, { status: 403 });
  const parsed = inputSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid OpenRouter settings." }, { status: 400 });

  const project = await db.query.projects.findFirst({
    where: and(eq(projects.slug, parsed.data.projectId), eq(projects.userId, user.id)),
  });
  if (!project) return NextResponse.json({ error: "Project not found." }, { status: 404 });

  const existing = await getOpenRouterCredential(user.id);
  const apiKey = parsed.data.apiKey;
  if (parsed.data.enabled && !apiKey && !existing) {
    return NextResponse.json({ error: "Enter an OpenRouter API key." }, { status: 400 });
  }

  let contextLength = parseProjectSettings(project.settings).openRouter.contextLength;
  const effectiveKey = apiKey ?? (existing ? decryptOpenRouterKey(user.id, existing) : null);
  if (parsed.data.enabled && effectiveKey) {
    const inspected = await inspectOpenRouter(effectiveKey, parsed.data.modelId).catch((error: unknown) => ({ error: error instanceof Error ? error.message : "OpenRouter validation failed." }));
    if ("error" in inspected) return NextResponse.json({ error: inspected.error }, { status: 400 });
    contextLength = inspected.contextLength;
    if (apiKey) {
      const encrypted = encryptOpenRouterKey(user.id, apiKey);
      await db.insert(userOpenRouterCredentials).values({ userId: user.id, ...encrypted })
        .onConflictDoUpdate({ target: userOpenRouterCredentials.userId, set: { ...encrypted, verifiedAt: new Date(), updatedAt: new Date() } });
      // Best-effort for same-instance readers (suggestions, equation LaTeX);
      // the eve service relies on the cache TTL instead.
      invalidateOpenRouterKeyCache(user.id);
    }
  }

  const settings = parseProjectSettings(project.settings);
  await db.update(projects).set({
    settings: { ...settings, openRouter: { enabled: parsed.data.enabled, modelId: parsed.data.modelId, contextLength } },
    updatedAt: new Date(),
  }).where(eq(projects.id, project.id));
  revalidatePath(`/${parsed.data.projectId}`);
  return NextResponse.json({ ok: true, contextLength }, { headers: { "Cache-Control": "no-store" } });
}

export async function POST(request: Request) {
  const user = await paidUser();
  if (!user) return NextResponse.json({ error: "A paid plan is required." }, { status: 403 });
  const parsed = inputSchema.pick({ apiKey: true, modelId: true }).safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Enter a valid model ID." }, { status: 400 });
  const existing = await getOpenRouterCredential(user.id);
  const effectiveKey = parsed.data.apiKey ?? (existing ? decryptOpenRouterKey(user.id, existing) : null);
  if (!effectiveKey) return NextResponse.json({ error: "Enter an OpenRouter API key." }, { status: 400 });
  const result = await inspectOpenRouter(effectiveKey, parsed.data.modelId).catch((error: unknown) => ({ error: error instanceof Error ? error.message : "OpenRouter validation failed." }));
  if ("error" in result) return NextResponse.json({ error: result.error }, { status: 400 });
  return NextResponse.json({ ok: true, contextLength: result.contextLength }, { headers: { "Cache-Control": "no-store" } });
}

export async function DELETE(request: Request) {
  const user = await getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  await db.delete(userOpenRouterCredentials).where(eq(userOpenRouterCredentials.userId, user.id));
  invalidateOpenRouterKeyCache(user.id);
  const projectId = new URL(request.url).searchParams.get("projectId");
  if (projectId) {
    const project = await db.query.projects.findFirst({ where: and(eq(projects.slug, projectId), eq(projects.userId, user.id)) });
    if (project) {
      const settings = parseProjectSettings(project.settings);
      await db.update(projects).set({ settings: { ...settings, openRouter: { ...settings.openRouter, enabled: false } }, updatedAt: new Date() }).where(eq(projects.id, project.id));
      revalidatePath(`/${projectId}`);
    }
  }
  return NextResponse.json({ ok: true }, { headers: { "Cache-Control": "no-store" } });
}
