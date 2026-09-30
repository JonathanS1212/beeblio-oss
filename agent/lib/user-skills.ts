import { isValidWorkspaceComponent } from "../workspace-paths";
import {
  deleteWorkspacePath,
  listWorkspaceFiles,
  readWorkspaceFile,
  writeWorkspaceFile,
  WorkspaceFileError,
} from "../workspace-files";

/**
 * User-defined agent skills.
 *
 * A skill is stored under `gs://<GCS_BUCKET>/<userId>/skills/<slug>/SKILL.md` containing a
 * `SKILL.md` (frontmatter `name`/`description` + markdown body). The dynamic
 * instructions resolver in `agent/instructions/user-skills.ts` advertises each
 * one to that user's sessions and `agent/tools/load_skill.ts` loads it on demand;
 * the routes in `agent/channels/skills.ts` expose CRUD over the same folders.
 * The filesystem is the source of truth so skills survive redeploys without
 * a database migration.
 */

const SKILL_FILE_NAME = "SKILL.md";
const USER_SKILLS_CACHE_TTL_MS = 5 * 60_000;
const userSkillsCache = new Map<string, {
  expiresAt: number;
  value: Promise<UserSkill[]>;
}>();

// Subset of eve's safe skill-name pattern (`^[A-Za-z0-9][A-Za-z0-9._-]*$`):
// lowercase kebab-case keeps user skills readable after the "/name" mention.
export const SKILL_SLUG_PATTERN = /^[a-z0-9][a-z0-9-]{0,63}$/;

export const MAX_SKILL_MARKDOWN_BYTES = 64 * 1024;
export const MAX_SKILL_DESCRIPTION_LENGTH = 1024;

// Keep in sync with the static skills in agent/skills/*.md: a dynamic skill
// whose name matches an authored one overrides it, which would silently
// change built-in behavior.
const FALLBACK_BUILT_IN_SKILL_SLUGS = [
  "bibliometric-analysis",
  "data-cleaning-heuristics",
  "data-visualization-styling",
  "docx",
  "excalidraw-diagramming",
  "interactive-html-artifacts",
  "literature-matrix",
  "literature-search-synthesis",
  "mermaid-diagramming",
  "multimedia-processing",
  "pdf",
  "posterly",
  "pptx",
  "science-scrollytelling",
  "statistical-interpretation",
  "survey-forms",
  "svg-diagram",
  "template-presentations",
  "xlsx",
] as const;

export const RESERVED_SKILL_SLUGS: ReadonlySet<string> = new Set([
  ...FALLBACK_BUILT_IN_SKILL_SLUGS,
]);

export class UserSkillError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code: string,
  ) {
    super(message);
    this.name = "UserSkillError";
  }
}

export type UserSkill = {
  slug: string;
  name: string;
  description: string;
  markdown: string;
  sizeBytes: number;
  updatedAt: string;
  /** Present when the SKILL.md exists but failed validation; such skills are listed but never advertised to the model. */
  invalidReason?: string;
};

const FRONTMATTER_PATTERN = /^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/;

export function parseSkillMarkdown(markdown: string): {
  fields: Record<string, string>;
  name: string;
  description: string;
  body: string;
} {
  const match = markdown.match(FRONTMATTER_PATTERN);
  if (!match) {
    throw new UserSkillError(
      "SKILL.md must start with a `---` frontmatter block containing name and description",
      400,
      "invalid_skill_frontmatter",
    );
  }

  const fields: Record<string, string> = {};
  for (const line of match[1].split(/\r?\n/)) {
    if (line.trim() === "") continue;
    const separator = line.indexOf(":");
    if (separator <= 0) {
      throw new UserSkillError(
        `SKILL.md frontmatter must be simple "key: value" lines (offending line: "${line}")`,
        400,
        "invalid_skill_frontmatter",
      );
    }
    const key = line.slice(0, separator).trim();
    const value = line.slice(separator + 1).trim();
    if (!key || value.includes("\n")) {
      throw new UserSkillError(
        `SKILL.md frontmatter line "${line}" is not a valid "key: value" pair`,
        400,
        "invalid_skill_frontmatter",
      );
    }
    fields[key] = value;
  }

  const name = fields.name ?? "";
  const description = fields.description ?? "";
  if (!description) {
    throw new UserSkillError(
      "SKILL.md frontmatter requires a non-empty description (it is the routing hint the model sees)",
      400,
      "invalid_skill_description",
    );
  }

  return { fields, name, description, body: markdown.slice(match[0].length) };
}

export function serializeSkillMarkdown(
  fields: Record<string, string>,
  body: string,
): string {
  return `---\n${Object.entries(fields)
    .map(([key, value]) => `${key}: ${value.replace(/\r?\n/g, " ")}`)
    .join("\n")}\n---\n\n${body.replace(/^\s*\n/, "")}`;
}

function assertUserId(userId: string): void {
  if (!isValidWorkspaceComponent(userId)) {
    throw new UserSkillError("Invalid user id", 400, "invalid_skill_identity");
  }
}

function skillPath(slug: string): string {
  if (!SKILL_SLUG_PATTERN.test(slug)) {
    throw new UserSkillError(
      "Skill names may only contain lowercase letters, digits, and hyphens, and must start with a letter or digit",
      400,
      "invalid_skill_slug",
    );
  }
  return `${slug}/${SKILL_FILE_NAME}`;
}

function validateSkillMarkdown(markdown: string): {
  fields: Record<string, string>;
  name: string;
  description: string;
} {
  const byteLength = Buffer.byteLength(markdown, "utf8");
  if (byteLength === 0) {
    throw new UserSkillError("SKILL.md cannot be empty", 400, "invalid_skill_markdown");
  }
  if (byteLength > MAX_SKILL_MARKDOWN_BYTES) {
    throw new UserSkillError(
      `SKILL.md exceeds the ${MAX_SKILL_MARKDOWN_BYTES} byte limit`,
      400,
      "skill_markdown_too_large",
    );
  }
  const parsed = parseSkillMarkdown(markdown);
  if (parsed.description.length > MAX_SKILL_DESCRIPTION_LENGTH) {
    throw new UserSkillError(
      `Skill description exceeds ${MAX_SKILL_DESCRIPTION_LENGTH} characters`,
      400,
      "invalid_skill_description",
    );
  }
  if (!parsed.body.trim()) {
    throw new UserSkillError(
      "SKILL.md needs instructions below the frontmatter",
      400,
      "invalid_skill_markdown",
    );
  }
  return parsed;
}

async function readSkillEntry(
  userId: string,
  slug: string,
): Promise<UserSkill | null> {
  try {
    const { content, updatedAt } = await readWorkspaceFile(userId, "skills", skillPath(slug));
    const markdown = content.toString("utf8");

    let name = slug;
    let description = "";
    let invalidReason: string | undefined;
    try {
      const parsed = validateSkillMarkdown(markdown);
      name = parsed.name || slug;
      description = parsed.description;
    } catch (error) {
      invalidReason =
        error instanceof Error ? error.message : "SKILL.md is invalid";
      description = "";
    }

    return {
      slug,
      name,
      description,
      markdown,
      sizeBytes: content.byteLength,
      updatedAt,
      ...(invalidReason ? { invalidReason } : {}),
    };
  } catch (error) {
    if (error instanceof WorkspaceFileError && error.status === 404) return null;
    throw error;
  }
}

export async function listUserSkills(userId: string): Promise<UserSkill[]> {
  assertUserId(userId);
  const cached = userSkillsCache.get(userId);
  if (cached && cached.expiresAt > Date.now()) return cached.value;

  const value = (async () => {
    const entries = await listWorkspaceFiles(userId, "skills");
    const skills = await Promise.all(
      entries
        .filter(
          (entry) =>
            entry.isDir && SKILL_SLUG_PATTERN.test(entry.name),
        )
        .map((entry) => readSkillEntry(userId, entry.name)),
    );
    return skills
      .filter((skill): skill is UserSkill => skill !== null)
      .sort((left, right) => left.name.localeCompare(right.name));
  })();
  userSkillsCache.set(userId, {
    expiresAt: Date.now() + USER_SKILLS_CACHE_TTL_MS,
    value,
  });
  void value.catch(() => {
    if (userSkillsCache.get(userId)?.value === value) userSkillsCache.delete(userId);
  });
  return value;
}

export async function readUserSkill(
  userId: string,
  slug: string,
): Promise<UserSkill> {
  assertUserId(userId);
  skillPath(slug);
  const skill = await readSkillEntry(userId, slug);
  if (!skill) {
    throw new UserSkillError("Skill was not found", 404, "skill_not_found");
  }
  return skill;
}

export async function writeUserSkill(
  userId: string,
  slug: string,
  markdown: string,
): Promise<UserSkill> {
  if (RESERVED_SKILL_SLUGS.has(slug)) {
    throw new UserSkillError(
      `"${slug}" is a built-in skill name and cannot be replaced`,
      400,
      "skill_slug_reserved",
    );
  }
  validateSkillMarkdown(markdown);
  assertUserId(userId);
  await writeWorkspaceFile(userId, "skills", skillPath(slug), Buffer.from(markdown, "utf8"));
  userSkillsCache.delete(userId);
  return (await readSkillEntry(userId, slug))!;
}

export async function deleteUserSkill(
  userId: string,
  slug: string,
): Promise<void> {
  assertUserId(userId);
  try {
    await deleteWorkspacePath(userId, "skills", slug);
    userSkillsCache.delete(userId);
  } catch (error) {
    if (error instanceof WorkspaceFileError && error.status === 404) {
      throw new UserSkillError("Skill was not found", 404, "skill_not_found");
    }
    throw error;
  }
}
