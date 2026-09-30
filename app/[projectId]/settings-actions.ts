"use server";

import path from "node:path";
import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { z } from "zod";

import { db } from "@/db";
import { projects } from "@/db/schema";
import { requireUser } from "@/lib/auth/session";
import { integerEnv } from "@/lib/env-config";
import {
  COMPLETION_CITATIONS_FILTERS,
  COMPLETION_YEAR_FILTERS,
  DOCUMENT_FONT_FAMILIES,
  DOCUMENT_FONT_SIZES,
  isBibFilePath,
  isMarkdownFilePath,
  parseProjectSettings,
  type ProjectSettings,
} from "@/lib/project-settings";
import { CITATION_STYLES } from "@/lib/citations";
import { listAgentWorkspaceFilesRecursive } from "@/lib/workspace-gcs";
import { getOwnedProject } from "./actions";

const defaultOpenFileSchema = z
  .string()
  .trim()
  .min(1, "Choose a file.")
  .max(500, "File paths cannot be longer than 500 characters.")
  .refine((value) => isMarkdownFilePath(value), {
    message: "The default file must be a Markdown file (.md or .markdown).",
  })
  .refine(
    (value) => {
      const normalized = path.posix.normalize(value);
      return (
        normalized === value &&
        !path.posix.isAbsolute(value) &&
        !normalized.startsWith("../")
      );
    },
    { message: "Enter a workspace-relative path like research-draft.md." },
  );

export async function getProjectSettings(
  projectSlug: string,
): Promise<ProjectSettings> {
  const user = await requireUser();
  const project = await getOwnedProject(user, projectSlug);
  if (!project) return parseProjectSettings(undefined);
  return parseProjectSettings(project.settings);
}

/**
 * The project row's name and description columns (everything outside the
 * settings JSON) for dialogs entered without layout props.
 */
export async function getProjectDetails(
  projectSlug: string,
): Promise<{ name: string; description: string } | null> {
  const user = await requireUser();
  const project = await getOwnedProject(user, projectSlug);
  if (!project) return null;
  return { name: project.name, description: project.description ?? "" };
}

const projectDetailsSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, "Give the project a name.")
    .max(120, "Project names cannot be longer than 120 characters."),
  description: z
    .string()
    .trim()
    .max(2_000, "Descriptions cannot be longer than 2,000 characters."),
});

export async function saveProjectDetails(
  projectSlug: string,
  name: unknown,
  description: unknown,
): Promise<{ success: true } | { success: false; error: string }> {
  const user = await requireUser();
  const project = await getOwnedProject(user, projectSlug);
  if (!project) return { success: false, error: "Project not found." };

  const parsed = projectDetailsSchema.safeParse({ name, description });
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0]?.message ?? "Invalid project details." };
  }

  await db
    .update(projects)
    .set({
      name: parsed.data.name,
      description: parsed.data.description || null,
      updatedAt: new Date(),
    })
    .where(eq(projects.id, project.id));
  revalidatePath("/workspace");
  revalidatePath(`/${projectSlug}`);

  return { success: true };
}

export async function saveProjectDefaultOpenFile(
  projectSlug: string,
  filePath: string,
): Promise<
  { success: true; defaultOpenFile: string } | { success: false; error: string }
> {
  const user = await requireUser();
  const project = await getOwnedProject(user, projectSlug);
  if (!project) return { success: false, error: "Project not found." };

  const parsed = defaultOpenFileSchema.safeParse(filePath);
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0]?.message ?? "Invalid file path." };
  }

  const exists = await workspaceFileExists(user.id, projectSlug, parsed.data);
  if (!exists) {
    return {
      success: false,
      error: "File not found in this project. Pick one of the suggestions.",
    };
  }

  const settings: ProjectSettings = {
    ...parseProjectSettings(project.settings),
    defaultOpenFile: parsed.data,
  };
  await db
    .update(projects)
    .set({ settings, updatedAt: new Date() })
    .where(eq(projects.id, project.id));
  revalidatePath(`/${projectSlug}`);

  return { success: true, defaultOpenFile: parsed.data };
}

/**
 * Clears the saved default file so loads fall back to the automatic pick.
 * No-op (no write) when nothing is saved.
 */
export async function clearProjectDefaultOpenFile(
  projectSlug: string,
): Promise<{ success: true } | { success: false; error: string }> {
  const user = await requireUser();
  const project = await getOwnedProject(user, projectSlug);
  if (!project) return { success: false, error: "Project not found." };

  const { defaultOpenFile: _cleared, ...settings } = parseProjectSettings(project.settings);
  if (_cleared === undefined) return { success: true };

  await db
    .update(projects)
    .set({ settings, updatedAt: new Date() })
    .where(eq(projects.id, project.id));
  revalidatePath(`/${projectSlug}`);

  return { success: true };
}

const completionSettingsSchema = z.object({
  enabled: z.boolean(),
  sources: z.object({
    literatureDb: z.boolean(),
    library: z.boolean(),
    libraryPath: z
      .string()
      .trim()
      .min(1, "Choose a library file.")
      .max(500, "File paths cannot be longer than 500 characters.")
      .refine((value) => isBibFilePath(value), {
        message: "The library must be a BibTeX file (.bib).",
      })
      .refine(
        (value) => {
          const normalized = path.posix.normalize(value);
          return (
            normalized === value &&
            !path.posix.isAbsolute(value) &&
            !normalized.startsWith("../")
          );
        },
        { message: "Enter a workspace-relative path like references/my-library.bib." },
      ),
  }),
  filters: z.object({
    year: z.enum(COMPLETION_YEAR_FILTERS),
    customMinYear: z.number().int().min(1500).max(2200).optional(),
    customMaxYear: z.number().int().min(1500).max(2200).optional(),
    citations: z.enum(COMPLETION_CITATIONS_FILTERS),
  }).refine(
    (filters) =>
      filters.customMinYear === undefined ||
      filters.customMaxYear === undefined ||
      filters.customMinYear <= filters.customMaxYear,
    { message: "The starting year must not be after the ending year." },
  ),
});

export async function saveProjectCompletionSettings(
  projectSlug: string,
  completion: unknown,
): Promise<
  { success: true } | { success: false; error: string }
> {
  const user = await requireUser();
  const project = await getOwnedProject(user, projectSlug);
  if (!project) return { success: false, error: "Project not found." };

  const parsed = completionSettingsSchema.safeParse(completion);
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0]?.message ?? "Invalid completion settings." };
  }
  // The library feeds every suggestion, so a stale path must not be savable.
  if (parsed.data.sources.library) {
    const exists = await workspaceFileExists(user.id, projectSlug, parsed.data.sources.libraryPath);
    if (!exists) {
      return { success: false, error: `Library file not found in this project: ${parsed.data.sources.libraryPath}` };
    }
  }

  const settings: ProjectSettings = {
    ...parseProjectSettings(project.settings),
    completion: parsed.data,
  };
  await db
    .update(projects)
    .set({ settings, updatedAt: new Date() })
    .where(eq(projects.id, project.id));
  revalidatePath(`/${projectSlug}`);

  return { success: true };
}

export async function saveProjectIncludeSystemSkills(
  projectSlug: string,
  includeSystemSkills: unknown,
): Promise<{ success: true } | { success: false; error: string }> {
  const user = await requireUser();
  const project = await getOwnedProject(user, projectSlug);
  if (!project) return { success: false, error: "Project not found." };
  if (typeof includeSystemSkills !== "boolean") {
    return { success: false, error: "Invalid system skills setting." };
  }

  const settings: ProjectSettings = {
    ...parseProjectSettings(project.settings),
    includeSystemSkills,
  };
  await db
    .update(projects)
    .set({ settings, updatedAt: new Date() })
    .where(eq(projects.id, project.id));
  revalidatePath(`/${projectSlug}`);

  return { success: true };
}

const documentDefaultSettingsSchema = z.object({
  citationStyle: z.enum(CITATION_STYLES.map(([value]) => value)),
  fontFamily: z.enum(DOCUMENT_FONT_FAMILIES.map(([value]) => value)),
  fontSize: z.enum(DOCUMENT_FONT_SIZES.map(([value]) => value)),
});

export async function saveProjectDocumentDefaults(
  projectSlug: string,
  documentDefaults: unknown,
): Promise<{ success: true } | { success: false; error: string }> {
  const user = await requireUser();
  const project = await getOwnedProject(user, projectSlug);
  if (!project) return { success: false, error: "Project not found." };

  const parsed = documentDefaultSettingsSchema.safeParse(documentDefaults);
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0]?.message ?? "Invalid document defaults." };
  }

  const settings: ProjectSettings = {
    ...parseProjectSettings(project.settings),
    documentDefaults: parsed.data,
  };
  await db
    .update(projects)
    .set({ settings, updatedAt: new Date() })
    .where(eq(projects.id, project.id));
  revalidatePath(`/${projectSlug}`);

  return { success: true };
}

async function workspaceFileExists(userId: string, projectSlug: string, filePath: string) {
  // Same cap as listAllFiles so what the dialog suggests is always valid.
  const maxEntries = integerEnv("WORKSPACE_LIST_MAX_ENTRIES", 2_000, 1);
  const files = await listAgentWorkspaceFilesRecursive(userId, projectSlug, maxEntries);
  return files.some((file) => file.path === filePath && !file.isDir);
}
