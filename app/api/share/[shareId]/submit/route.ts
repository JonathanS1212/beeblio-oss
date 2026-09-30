import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";

import { db } from "@/db";
import { publicFiles, projects } from "@/db/schema";
import { parseFormHtml } from "@/lib/forms/parse";
import { appendFormResponse } from "@/lib/forms/responses";
import { HONEYPOT_KEY, type FormDefinition } from "@/lib/forms/schema";
import {
  AgentWorkspaceError,
  readAgentWorkspaceFile,
} from "@/lib/workspace-gcs";

/**
 * Public form submission endpoint. The generated form runtime posts here as a
 * "simple" urlencoded request (no preflight) from inside a sandboxed iframe —
 * an opaque origin — so responses carry permissive CORS headers. Submissions
 * append to <form>.responses.csv in the owner's workspace through the agent
 * workspace API, which also enforces the owner's storage quota.
 */

const MAX_BODY_BYTES = 128 * 1024;
const MAX_FIELDS = 300;
const MAX_VALUE_LENGTH = 10_000;

const RATE_WINDOW_MS = 60_000;
const RATE_MAX_PER_MINUTE = 20;

// Best-effort, in-memory per IP+share rate limiting. Good enough to blunt
// casual flooding of a single-instance deployment; a determined attacker is
// out of scope for v1 (the endpoint can only append small CSV rows).
const rateHits = new Map<string, number[]>();

function corsHeaders(): Record<string, string> {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Max-Age": "600",
  };
}

function rateLimited(key: string): boolean {
  const now = Date.now();
  const recent = (rateHits.get(key) ?? []).filter((time) => now - time < RATE_WINDOW_MS);
  if (recent.length >= RATE_MAX_PER_MINUTE) {
    rateHits.set(key, recent);
    return true;
  }
  recent.push(now);
  rateHits.set(key, recent);
  if (rateHits.size > 10_000) {
    for (const [mapKey, times] of rateHits) {
      if (times.every((time) => now - time >= RATE_WINDOW_MS)) rateHits.delete(mapKey);
    }
  }
  return false;
}

function clientKey(request: Request, shareId: string): string {
  const forwarded = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  return `${forwarded ?? "unknown"}:${shareId}`;
}

function parsePostedFields(body: string): Record<string, string[]> {
  const fields: Record<string, string[]> = {};
  const params = new URLSearchParams(body);
  for (const key of new Set(params.keys())) {
    if (key.startsWith("_")) continue; // honeypot and other runtime metadata
    const values = params
      .getAll(key)
      .map((value) => value.slice(0, MAX_VALUE_LENGTH))
      .filter((value) => value.trim() !== "");
    if (values.length > 0) fields[key] = values;
    if (Object.keys(fields).length > MAX_FIELDS) break;
  }
  return fields;
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: corsHeaders() });
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ shareId: string }> },
) {
  const { shareId } = await params;

  if (rateLimited(clientKey(request, shareId))) {
    return NextResponse.json(
      { ok: false, error: "Too many submissions from this connection. Please wait a minute and try again." },
      { status: 429, headers: corsHeaders() },
    );
  }

  const body = await request.text().catch(() => "");
  if (body.length === 0 || body.length > MAX_BODY_BYTES) {
    return NextResponse.json(
      { ok: false, error: "The submission could not be read." },
      { status: 400, headers: corsHeaders() },
    );
  }
  const postedParams = new URLSearchParams(body);
  const honeypot = postedParams.get(HONEYPOT_KEY);
  if (honeypot !== null && honeypot.trim() !== "") {
    // Silently accept bot submissions without recording them.
    return NextResponse.json({ ok: true }, { headers: corsHeaders() });
  }
  const fields = parsePostedFields(body);

  const fileRecord = await db.query.publicFiles.findFirst({
    where: eq(publicFiles.id, shareId),
  });
  if (!fileRecord) {
    return NextResponse.json(
      { ok: false, error: "This form is no longer available." },
      { status: 404, headers: corsHeaders() },
    );
  }
  const project = await db.query.projects.findFirst({
    where: eq(projects.id, fileRecord.projectId),
  });
  if (!project) {
    return NextResponse.json(
      { ok: false, error: "This form is no longer available." },
      { status: 404, headers: corsHeaders() },
    );
  }

  let definition: FormDefinition;
  try {
    const response = await readAgentWorkspaceFile(
      project.userId,
      project.slug,
      fileRecord.filePath,
    );
    definition = parseFormHtml(await response.text());
  } catch {
    return NextResponse.json(
      { ok: false, error: "This form is no longer available." },
      { status: 404, headers: corsHeaders() },
    );
  }

  try {
    const result = await appendFormResponse(
      project.userId,
      project.slug,
      fileRecord.filePath,
      definition,
      fields,
    );
    return NextResponse.json(
      { ok: true, responsesPath: result.responsesPath },
      { headers: corsHeaders() },
    );
  } catch (error) {
    if (error instanceof AgentWorkspaceError && error.code === "storage_quota_exceeded") {
      return NextResponse.json(
        { ok: false, error: "This form is not accepting responses right now." },
        { status: 413, headers: corsHeaders() },
      );
    }
    console.error("[form-submit] failed", {
      shareId,
      error,
      projectId: project.id,
    });
    return NextResponse.json(
      { ok: false, error: "The response could not be saved. Please try again." },
      { status: 500, headers: corsHeaders() },
    );
  }
}
