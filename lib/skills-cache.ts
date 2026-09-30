import type { AgentSkillSummary } from "./skills-storage";

// Best-effort client-side cache of the user's skills, mirroring the shared
// folder listings in lib/workspace-mutations.ts: the Skills panel mounts only
// while its rail activity is active, so without a module-scoped cache every
// reopen refetches from scratch. The panel re-seeds the list on mount and
// window focus, and it is the only writer (see agent-chat.tsx), so saves and
// deletes update the cache directly rather than through invalidation events.
let cachedSummaries: AgentSkillSummary[] | undefined;
const markdownBySlug = new Map<string, string>();

export function cachedSkills(): AgentSkillSummary[] | undefined {
  return cachedSummaries;
}

export function rememberSkills(skills: AgentSkillSummary[]) {
  cachedSummaries = skills;
}

export function cachedSkillMarkdown(slug: string): string | undefined {
  return markdownBySlug.get(slug);
}

export function rememberSkillMarkdown(slug: string, markdown: string) {
  markdownBySlug.set(slug, markdown);
}

export function forgetSkill(slug: string) {
  markdownBySlug.delete(slug);
  if (cachedSummaries) {
    cachedSummaries = cachedSummaries.filter((skill) => skill.slug !== slug);
  }
}
