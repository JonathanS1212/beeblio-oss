import { defineChannel, DELETE, GET, PUT } from "eve/channels";
import { routeAuth } from "eve/channels/auth";

import { proxyUserAuth } from "../proxy-auth";
import {
  deleteUserSkill,
  listUserSkills,
  readUserSkill,
  UserSkillError,
  writeUserSkill,
} from "../lib/user-skills";

/**
 * User-scoped agent skills API. Every route is bounded by the verified
 * principalId (the Neon Auth user id); the browser never supplies a user id.
 * Skills live at .beeblio/skills/<slug>/SKILL.md — see
 * agent/lib/user-skills.ts.
 */

const maxSkillJsonBytes = 128 * 1024;

type SkillSummary = {
  slug: string;
  name: string;
  description: string;
  sizeBytes: number;
  updatedAt: string;
  invalidReason?: string;
};

function toSummary(skill: {
  slug: string;
  name: string;
  description: string;
  sizeBytes: number;
  updatedAt: string;
  invalidReason?: string;
}): SkillSummary {
  const { slug, name, description, sizeBytes, updatedAt, invalidReason } = skill;
  return invalidReason === undefined
    ? { slug, name, description, sizeBytes, updatedAt }
    : { slug, name, description, sizeBytes, updatedAt, invalidReason };
}

async function withSkillsAuth(
  request: Request,
  operation: (userId: string) => Promise<Response>,
): Promise<Response> {
  const auth = await routeAuth(request, proxyUserAuth);
  if (auth instanceof Response) return auth;

  try {
    return await operation(auth.principalId);
  } catch (error) {
    if (error instanceof UserSkillError) {
      return Response.json(
        { ok: false, code: error.code, error: error.message },
        { status: error.status },
      );
    }
    console.error("[skills-api] request failed", {
      error,
      method: request.method,
      path: new URL(request.url).pathname,
      userId: auth.principalId,
    });
    return Response.json(
      { ok: false, code: "skills_internal_error", error: "Skill operation failed" },
      { status: 500 },
    );
  }
}

function querySlug(request: Request): string {
  return new URL(request.url).searchParams.get("slug") ?? "";
}

export default defineChannel({
  routes: [
    GET("/skills/v1/skills", (request) =>
      withSkillsAuth(request, async (userId) => {
        const skills = await listUserSkills(userId);
        return Response.json({ ok: true, skills: skills.map(toSummary) });
      }),
    ),
    GET("/skills/v1/skill", (request) =>
      withSkillsAuth(request, async (userId) => {
        const skill = await readUserSkill(userId, querySlug(request));
        return Response.json({ ok: true, skill: { ...toSummary(skill), markdown: skill.markdown } });
      }),
    ),
    PUT("/skills/v1/skill", (request) =>
      withSkillsAuth(request, async (userId) => {
        const contentLength = Number(request.headers.get("content-length") ?? 0);
        if (
          Number.isFinite(contentLength) &&
          contentLength > maxSkillJsonBytes
        ) {
          return Response.json(
            {
              ok: false,
              code: "skill_body_too_large",
              error: "Skill request body is too large",
            },
            { status: 413 },
          );
        }

        let body: unknown;
        try {
          body = await request.json();
        } catch {
          return Response.json(
            {
              ok: false,
              code: "invalid_skills_request",
              error: "Skill request body must be valid JSON",
            },
            { status: 400 },
          );
        }
        const markdown =
          body && typeof body === "object" && !Array.isArray(body)
            ? (body as Record<string, unknown>).markdown
            : undefined;
        if (typeof markdown !== "string" || markdown.length === 0) {
          return Response.json(
            {
              ok: false,
              code: "invalid_skills_request",
              error: "Skill request requires a non-empty markdown field",
            },
            { status: 400 },
          );
        }

        const skill = await writeUserSkill(userId, querySlug(request), markdown);
        return Response.json({ ok: true, skill: toSummary(skill) });
      }),
    ),
    DELETE("/skills/v1/skill", (request) =>
      withSkillsAuth(request, async (userId) => {
        await deleteUserSkill(userId, querySlug(request));
        return Response.json({ ok: true });
      }),
    ),
  ],
});
