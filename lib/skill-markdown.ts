/**
 * Client-safe helpers for authoring SKILL.md files.
 *
 * Mirrors the agent-side authority in agent/lib/user-skills.ts (bundled into
 * the agent VM, so it cannot be imported here): the same slug rules, caps,
 * and reserved built-in names. The agent API re-validates every write, so a
 * drift here degrades error messages, never correctness.
 */

export const SKILL_SLUG_PATTERN = /^[a-z0-9][a-z0-9-]{0,63}$/;

export const MAX_SKILL_MARKDOWN_BYTES = 64 * 1024;
export const MAX_SKILL_DESCRIPTION_LENGTH = 1024;

// Built-in skills shipped with the agent (agent/skills/*.md). A user skill
// with one of these slugs would override the built-in, so they are blocked.
export const RESERVED_SKILL_SLUGS: readonly string[] = [
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
];

/** Slash-menu metadata for the static Markdown skills in agent/skills/. */
export const SYSTEM_SKILL_SUMMARIES = [
  { slug: "bibliometric-analysis", name: "Bibliometric Analysis" },
  { slug: "data-cleaning-heuristics", name: "Data Cleaning Heuristics" },
  { slug: "data-visualization-styling", name: "Data Visualization Styling" },
  { slug: "docx", name: "Word Documents" },
  { slug: "excalidraw-diagramming", name: "Excalidraw Diagramming" },
  { slug: "interactive-html-artifacts", name: "Interactive HTML Artifacts" },
  { slug: "literature-matrix", name: "Literature Matrix" },
  { slug: "literature-search-synthesis", name: "Literature Search & Synthesis" },
  { slug: "mermaid-diagramming", name: "Mermaid Diagramming" },
  { slug: "multimedia-processing", name: "Multimedia Processing" },
  { slug: "pdf", name: "PDF Documents" },
  { slug: "posterly", name: "Academic Posters (Posterly)" },
  { slug: "pptx", name: "PowerPoint Presentations" },
  { slug: "science-scrollytelling", name: "Science Scrollytelling" },
  { slug: "statistical-interpretation", name: "Statistical Interpretation" },
  { slug: "survey-forms", name: "Survey Forms" },
  { slug: "svg-diagram", name: "SVG Diagrams" },
  { slug: "template-presentations", name: "Template Presentations" },
  { slug: "xlsx", name: "Excel Workbooks" },
] as const;

const FRONTMATTER_PATTERN = /^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/;

export type ParsedSkillMarkdown = {
  fields: Record<string, string>;
  name: string;
  description: string;
  body: string;
};

export function parseSkillMarkdown(markdown: string): ParsedSkillMarkdown {
  const match = markdown.match(FRONTMATTER_PATTERN);
  if (!match) {
    throw new Error(
      "SKILL.md must start with a `---` frontmatter block containing name and description",
    );
  }

  const fields: Record<string, string> = {};
  for (const line of match[1].split(/\r?\n/)) {
    if (line.trim() === "") continue;
    const separator = line.indexOf(":");
    if (separator <= 0) {
      throw new Error(
        `SKILL.md frontmatter must be simple "key: value" lines (offending line: "${line}")`,
      );
    }
    fields[line.slice(0, separator).trim()] = line
      .slice(separator + 1)
      .trim();
  }

  if (!fields.description) {
    throw new Error(
      "SKILL.md frontmatter requires a non-empty description (it tells Beeblio when to use the skill)",
    );
  }

  return {
    fields,
    name: fields.name ?? "",
    description: fields.description,
    body: markdown.slice(match[0].length),
  };
}

export function serializeSkillMarkdown(
  fields: Record<string, string>,
  body: string,
): string {
  return `---\n${Object.entries(fields)
    .map(([key, value]) => `${key}: ${value.replace(/\r?\n/g, " ")}`)
    .join("\n")}\n---\n\n${body.replace(/^\s*\n/, "")}`;
}

export function slugifySkillName(name: string): string {
  const slug = name
    .toLocaleLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 64)
    .replace(/-+$/g, "");
  return slug || "skill";
}

export function validateSkillDraft(input: {
  name: string;
  description: string;
  instructions: string;
}): string | undefined {
  if (!input.name.trim()) return "Give the skill a name.";
  if (!input.description.trim())
    return "Describe when Beeblio should use this skill.";
  if (input.description.length > MAX_SKILL_DESCRIPTION_LENGTH)
    return `Description must be at most ${MAX_SKILL_DESCRIPTION_LENGTH} characters.`;
  if (!input.instructions.trim())
    return "Write the instructions Beeblio should follow.";
  return undefined;
}

export function skillMarkdownByteLength(markdown: string): number {
  return new TextEncoder().encode(markdown).length;
}
