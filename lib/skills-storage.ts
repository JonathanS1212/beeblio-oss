import { mintAgentToken } from "@/lib/agent-token";

/**
 * Server-side client for the user-scoped agent skills API served by the eve
 * channel in agent/channels/skills.ts. Mirrors lib/workspace-gcs.ts: the
 * Next.js server mints the same short-lived agent JWT used for chat and
 * files, so the agent derives the user from the verified token.
 */

export type AgentSkillSummary = {
  slug: string;
  name: string;
  description: string;
  sizeBytes: number;
  updatedAt: string;
  invalidReason?: string;
};

export class AgentSkillsError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code: string,
  ) {
    super(message);
    this.name = "AgentSkillsError";
  }
}

function agentUrl(): URL {
  const value = process.env.AGENT_URL?.trim();
  if (!value) throw new Error("AGENT_URL is not set");
  try {
    return new URL(value);
  } catch {
    throw new Error("AGENT_URL must be a valid URL");
  }
}

function skillsAgentUrl(resource: string, slug?: string): URL {
  const base = agentUrl().toString().replace(/\/$/, "");
  const url = new URL(`${base}/skills/v1/${resource}`);
  if (slug !== undefined) url.searchParams.set("slug", slug);
  return url;
}

async function agentSkillsRequest<T>(
  userId: string,
  resource: string,
  init: RequestInit = {},
  slug?: string,
): Promise<T> {
  const headers = new Headers(init.headers);
  headers.set("authorization", `Bearer ${mintAgentToken(userId)}`);

  const response = await fetch(skillsAgentUrl(resource, slug), {
    ...init,
    headers,
    cache: "no-store",
  });
  if (response.ok) return (await response.json()) as T;

  let message = `Agent skills request failed with status ${response.status}`;
  let code = "agent_skills_error";
  try {
    const body = (await response.json()) as { error?: unknown; code?: unknown };
    if (typeof body.error === "string") message = body.error;
    if (typeof body.code === "string") code = body.code;
  } catch {}
  throw new AgentSkillsError(message, response.status, code);
}

export async function listAgentSkills(userId: string): Promise<AgentSkillSummary[]> {
  const body = await agentSkillsRequest<{ skills?: unknown }>(userId, "skills");
  if (!Array.isArray(body.skills)) {
    throw new Error("Agent skills API returned an invalid listing");
  }
  return body.skills as AgentSkillSummary[];
}

export async function readAgentSkill(
  userId: string,
  slug: string,
): Promise<AgentSkillSummary & { markdown: string }> {
  const body = await agentSkillsRequest<{ skill?: unknown }>(userId, "skill", undefined, slug);
  const skill = body.skill as (AgentSkillSummary & { markdown?: string }) | undefined;
  if (!skill || typeof skill.markdown !== "string") {
    throw new Error("Agent skills API returned an invalid skill");
  }
  return skill as AgentSkillSummary & { markdown: string };
}

export async function saveAgentSkill(
  userId: string,
  slug: string,
  markdown: string,
): Promise<AgentSkillSummary> {
  const body = await agentSkillsRequest<{ skill?: AgentSkillSummary }>(
    userId,
    "skill",
    {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ markdown }),
    },
    slug,
  );
  if (!body.skill) throw new Error("Agent skills API returned an invalid save result");
  return body.skill;
}

export async function deleteAgentSkill(userId: string, slug: string): Promise<void> {
  await agentSkillsRequest(userId, "skill", { method: "DELETE" }, slug);
}
