import {
  DEMO_MAIN_DOCUMENT_PATH,
  isDemoProjectSlug,
} from "@/lib/demo-project-config";
import { PROJECT_BIBLIOGRAPHY_PATH } from "@/lib/project-bibliography";
import type { WorkspaceRootTree } from "@/lib/workspace-gcs";
import { CITATION_STYLES, type CitationStyle } from "@/lib/citations";
import { DEFAULT_OPENROUTER_PREFERENCE, type OpenRouterPreference } from "@/lib/openrouter-byok-types";

/**
 * Per-project user preferences, stored in projects.settings (jsonb). The
 * column is a free-form object so new keys can be added without migrations;
 * parseProjectSettings is the single place that validates its shape.
 *
 * This module stays client-safe (constants-only imports) because the settings
 * dialog imports the Markdown predicate.
 */
export type ProjectSettings = {
  /** Workspace file opened automatically when the project loads bare. */
  defaultOpenFile?: string;
  /** Defaults used when a Markdown document has no individual override. */
  documentDefaults: DocumentDefaultSettings;
  /** Editor sentence auto-completion configuration. */
  completion?: CompletionSettings;
  /** Show the agent's built-in skills in the chat slash-mention menu. */
  includeSystemSkills: boolean;
  /** Default for newly-created conversations and direct editor AI tasks. Never contains a key. */
  openRouter: OpenRouterPreference;
};

export const DOCUMENT_FONT_FAMILIES = [
  ["", "Default"],
  ["Arial", "Arial"],
  ["Aptos", "Aptos"],
  ["Calibri", "Calibri"],
  ["Georgia", "Georgia"],
  ["Garamond", "Garamond"],
  ["Times New Roman", "Times New Roman"],
  ["Verdana", "Verdana"],
  ["Courier New", "Courier New"],
] as const;

export const DOCUMENT_FONT_SIZES = [
  ["", "Default"],
  ["12px", "9 pt"],
  ["13px", "10 pt"],
  ["15px", "11 pt"],
  ["16px", "12 pt"],
  ["19px", "14 pt"],
  ["24px", "18 pt"],
  ["32px", "24 pt"],
] as const;

export type DocumentDefaultSettings = {
  citationStyle: CitationStyle;
  fontFamily: (typeof DOCUMENT_FONT_FAMILIES)[number][0];
  fontSize: (typeof DOCUMENT_FONT_SIZES)[number][0];
};

export const DEFAULT_DOCUMENT_SETTINGS: DocumentDefaultSettings = {
  citationStyle: "apa",
  fontFamily: "",
  fontSize: "",
};

/**
 * Resolve selectable document fonts to complete stacks. Aptos and Calibri
 * are proprietary system fonts, while plain `Garamond` is not portable, so
 * the root layout supplies dependable web-font substitutes for them. Geist
 * gives Aptos a distinct modern sans fallback; Carlito is metric-compatible
 * with Calibri.
 */
export function documentFontFamilyCss(fontFamily: DocumentDefaultSettings["fontFamily"]): string {
  switch (fontFamily) {
    case "Aptos":
      return 'Aptos, var(--font-geist-sans), "Segoe UI", Arial, sans-serif';
    case "Calibri":
      return 'Calibri, var(--font-office-sans), Carlito, "Segoe UI", Arial, sans-serif';
    case "Garamond":
      return 'Garamond, var(--font-garamond), "EB Garamond", Georgia, serif';
    case "Georgia":
      return 'Georgia, "Times New Roman", serif';
    case "Times New Roman":
      return '"Times New Roman", Times, serif';
    case "Verdana":
      return 'Verdana, Geneva, sans-serif';
    case "Courier New":
      return '"Courier New", Courier, monospace';
    case "Arial":
    case "":
      return 'Arial, Helvetica, sans-serif';
  }
}

export const COMPLETION_YEAR_FILTERS = ["all", "last5", "custom"] as const;
export type CompletionYearFilter = (typeof COMPLETION_YEAR_FILTERS)[number];

export const COMPLETION_CITATIONS_FILTERS = ["all", "10", "20", "50"] as const;
export type CompletionCitationsFilter = (typeof COMPLETION_CITATIONS_FILTERS)[number];

export type CompletionSettings = {
  enabled: boolean;
  sources: {
    /** External literature search (OpenAlex, Crossref, PubMed). */
    literatureDb: boolean;
    /** The user's own BibTeX library file. */
    library: boolean;
    /** Workspace-relative path of the library file. */
    libraryPath: string;
  };
  filters: {
    year: CompletionYearFilter;
    /** Inclusive publication year range, only used when year is "custom". */
    customMinYear?: number;
    customMaxYear?: number;
    citations: CompletionCitationsFilter;
  };
};

export const DEFAULT_COMPLETION_SETTINGS: CompletionSettings = {
  enabled: false,
  sources: {
    literatureDb: true,
    library: false,
    libraryPath: PROJECT_BIBLIOGRAPHY_PATH,
  },
  filters: { year: "all", citations: "all" },
};

/**
 * Broadcast whenever completion settings are saved (from the editor toolbar
 * button or the user menu), so every open editor refetches its copy.
 */
export const COMPLETION_SETTINGS_CHANGED_EVENT = "beeblio:completion-settings-changed";

/** The starter draft every project is provisioned with; keep in sync with RESEARCH_DRAFT_PATH. */
export const DEFAULT_OPEN_FILE_PATH = "research-draft.md";

const MARKDOWN_EXTENSIONS = [".md", ".markdown"];

export function isMarkdownFilePath(filePath: string) {
  const lower = filePath.toLowerCase();
  return MARKDOWN_EXTENSIONS.some((extension) => lower.endsWith(extension));
}

export function isBibFilePath(filePath: string) {
  return filePath.toLowerCase().endsWith(".bib");
}

function oneOf<T extends readonly string[]>(options: T, value: unknown, fallback: T[number]): T[number] {
  return typeof value === "string" && (options as readonly string[]).includes(value)
    ? value as T[number]
    : fallback;
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function clampYear(value: unknown): number | undefined {
  return typeof value === "number" && Number.isInteger(value)
    ? Math.min(2_200, Math.max(1_500, value))
    : undefined;
}

export function parseCompletionSettings(value: unknown): CompletionSettings {
  const root = record(value);
  const sources = record(root.sources);
  const filters = record(root.filters);
  const customMinYear = clampYear(filters.customMinYear);
  const customMaxYear = clampYear(filters.customMaxYear);
  const libraryPath = typeof sources.libraryPath === "string" && isBibFilePath(sources.libraryPath.trim())
    ? sources.libraryPath.trim()
    : DEFAULT_COMPLETION_SETTINGS.sources.libraryPath;
  return {
    enabled: typeof root.enabled === "boolean" ? root.enabled : DEFAULT_COMPLETION_SETTINGS.enabled,
    sources: {
      literatureDb: typeof sources.literatureDb === "boolean" ? sources.literatureDb : true,
      library: typeof sources.library === "boolean" ? sources.library : DEFAULT_COMPLETION_SETTINGS.sources.library,
      libraryPath,
    },
    filters: {
      year: oneOf(COMPLETION_YEAR_FILTERS, filters.year, "all"),
      customMinYear,
      customMaxYear,
      citations: oneOf(COMPLETION_CITATIONS_FILTERS, filters.citations, "all"),
    },
  };
}

export function parseProjectSettings(value: unknown): ProjectSettings {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {
      documentDefaults: DEFAULT_DOCUMENT_SETTINGS,
      completion: parseCompletionSettings(undefined),
      includeSystemSkills: false,
      openRouter: DEFAULT_OPENROUTER_PREFERENCE,
    };
  }
  const source = value as Record<string, unknown>;
  const documentDefaults = record(source.documentDefaults);
  const defaultOpenFile = typeof source.defaultOpenFile === "string" ? source.defaultOpenFile.trim() : "";
  const openRouter = record(source.openRouter);
  return {
    ...(defaultOpenFile ? { defaultOpenFile } : {}),
    documentDefaults: {
      citationStyle: oneOf(CITATION_STYLES.map(([value]) => value), documentDefaults.citationStyle, "apa"),
      fontFamily: oneOf(DOCUMENT_FONT_FAMILIES.map(([value]) => value), documentDefaults.fontFamily, ""),
      fontSize: oneOf(DOCUMENT_FONT_SIZES.map(([value]) => value), documentDefaults.fontSize, ""),
    },
    completion: parseCompletionSettings(source.completion),
    includeSystemSkills: typeof source.includeSystemSkills === "boolean"
      ? source.includeSystemSkills
      : false,
    openRouter: {
      enabled: typeof openRouter.enabled === "boolean" ? openRouter.enabled : false,
      modelId: typeof openRouter.modelId === "string" && openRouter.modelId.trim()
        ? openRouter.modelId.trim()
        : DEFAULT_OPENROUTER_PREFERENCE.modelId,
      contextLength: typeof openRouter.contextLength === "number" && Number.isSafeInteger(openRouter.contextLength)
        ? Math.max(8_192, openRouter.contextLength)
        : DEFAULT_OPENROUTER_PREFERENCE.contextLength,
    },
  };
}

export function fileExistsInRootTree(
  tree: WorkspaceRootTree,
  filePath: string,
) {
  const isFile = (entry: { path: string; isDir: boolean }) =>
    entry.path === filePath && !entry.isDir;
  return (
    tree.entries.some(isFile) ||
    Object.values(tree.children).some((entries) => entries.some(isFile))
  );
}

/**
 * The file a project should open with when no ?file= param is present: the
 * user's setting when it still exists, otherwise the demo main document for
 * the shared demo project, otherwise the starter research draft. Returns
 * undefined when the resolved file is missing from the workspace so callers
 * fall back to the empty "Open a File to Begin" state instead of opening a
 * dead tab.
 */
export function resolveDefaultOpenFile(input: {
  projectId: string;
  settings: ProjectSettings;
  rootTree: WorkspaceRootTree;
}): string | undefined {
  const candidate =
    input.settings.defaultOpenFile ??
    (isDemoProjectSlug(input.projectId)
      ? DEMO_MAIN_DOCUMENT_PATH
      : DEFAULT_OPEN_FILE_PATH);
  return fileExistsInRootTree(input.rootTree, candidate) ? candidate : undefined;
}
