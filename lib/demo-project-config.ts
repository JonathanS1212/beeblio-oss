export const DEMO_PROJECT_TEMPLATE_KEY = "everyday-habits-and-well-being";
export const DEMO_PROJECT_TEMPLATE_VERSION = "v4";
export const DEMO_PROJECT_SLUG = "demo-everyday-wellbeing";
export const DEMO_PROJECT_NAME = "Everyday Habits & Well-Being";
export const DEMO_PROJECT_DESCRIPTION =
  "Explore a complete, reproducible research workflow built from transparent synthetic data.";
export const DEMO_MAIN_DOCUMENT_PATH = "4-Reports/research-report.md";

export type SuggestedPrompt = { label: string; prompt: string };

export const DEMO_SUGGESTED_PROMPTS: readonly SuggestedPrompt[] = [
  {
    label: "Explain the strongest finding",
    prompt: "Explain the strongest finding and its main limitation in plain language.",
  },
  {
    label: "Trace Figure 1",
    prompt: "Show me which data and script produced Figure 1, and explain the steps.",
  },
  {
    label: "Summarize literature gaps",
    prompt: "Summarize the literature gaps identified in this demo project.",
  },
  {
    label: "Create a visualization",
    prompt:
      "Create another useful visualization from the cleaned data and explain why you chose it.",
  },
  {
    label: "Adapt this workflow",
    prompt: "How would I adapt this workflow to a research project in my own field?",
  },
];

export function isDemoProjectSlug(slug: string) {
  return slug === DEMO_PROJECT_SLUG;
}

export function demoProjectHref(sessionId?: string | null) {
  const session = sessionId ? `/${sessionId}` : "";
  // No ?file= param: it would override the user's default-open-file setting.
  // The project layout opens DEMO_MAIN_DOCUMENT_PATH for the demo anyway when
  // no setting exists (lib/project-settings.ts).
  return `/${DEMO_PROJECT_SLUG}${session}`;
}
