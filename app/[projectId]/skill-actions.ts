"use server";

import { requireUser } from "@/lib/auth/session";
import {
  deleteAgentSkill,
  listAgentSkills,
  readAgentSkill,
  saveAgentSkill,
  type AgentSkillSummary,
} from "@/lib/skills-storage";
import {
  RESERVED_SKILL_SLUGS,
  SKILL_SLUG_PATTERN,
  MAX_SKILL_MARKDOWN_BYTES,
  serializeSkillMarkdown,
  skillMarkdownByteLength,
  slugifySkillName,
} from "@/lib/skill-markdown";

export type SkillSummary = AgentSkillSummary;

/**
 * User-scoped agent skills (usable in every project). All actions are
 * authorized by the Neon Auth session; the agent API re-validates every
 * write, so these checks are for fast feedback only.
 */

function assertSlug(slug: string): void {
  if (!SKILL_SLUG_PATTERN.test(slug)) {
    throw new Error(
      "Skill names may only contain lowercase letters, digits, and hyphens",
    );
  }
  if (RESERVED_SKILL_SLUGS.includes(slug)) {
    throw new Error(`"${slug}" is a built-in skill name and cannot be replaced`);
  }
}

function assertMarkdownSize(markdown: string): void {
  if (skillMarkdownByteLength(markdown) > MAX_SKILL_MARKDOWN_BYTES) {
    throw new Error(`SKILL.md exceeds the ${MAX_SKILL_MARKDOWN_BYTES} byte limit`);
  }
}

export async function listSkills(): Promise<SkillSummary[]> {
  const user = await requireUser();
  return listAgentSkills(user.id);
}

export async function getSkill(
  slug: string,
): Promise<SkillSummary & { markdown: string }> {
  const user = await requireUser();
  return readAgentSkill(user.id, slug);
}

export async function saveSkill(
  slug: string,
  markdown: string,
): Promise<SkillSummary> {
  const user = await requireUser();
  assertSlug(slug);
  assertMarkdownSize(markdown);
  return saveAgentSkill(user.id, slug, markdown);
}

/**
 * Creates a skill and returns its slug. The slug is derived from the name and
 * de-duplicated against existing skills (`apa-style`, `apa-style-2`, ...) so
 * non-technical users never have to reason about folder names. When markdown
 * is omitted it is serialized from the structured fields.
 */
export async function createSkill(input: {
  name: string;
  description: string;
  instructions: string;
  markdown?: string;
}): Promise<SkillSummary> {
  const user = await requireUser();

  const markdown =
    input.markdown ??
    serializeSkillMarkdown(
      { name: input.name.trim(), description: input.description.trim() },
      input.instructions,
    );
  assertMarkdownSize(markdown);

  const baseSlug = slugifySkillName(input.name);
  const existing = await listAgentSkills(user.id);
  const taken = new Set(existing.map((skill) => skill.slug));
  let slug = baseSlug;
  for (let suffix = 2; taken.has(slug); suffix++) {
    slug = `${baseSlug}-${suffix}`.slice(0, 64);
  }
  if (RESERVED_SKILL_SLUGS.includes(slug)) {
    throw new Error(`"${input.name}" matches a built-in skill name; pick another name`);
  }

  return saveAgentSkill(user.id, slug, markdown);
}

export async function deleteSkill(slug: string): Promise<void> {
  const user = await requireUser();
  assertSlug(slug);
  await deleteAgentSkill(user.id, slug);
}
