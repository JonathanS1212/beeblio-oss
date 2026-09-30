"use server";

import path from "node:path";
import { revalidatePath } from "next/cache";
import { z } from "zod";

import { requireUser } from "@/lib/auth/session";
import { integerEnv } from "@/lib/env-config";
import { appendLiteratureItem } from "@/lib/bibliography-store";
import { fileStem } from "@/lib/literature/citation-identity";
import {
  addMatrixPapers,
  DEFAULT_MATRIX_PATH,
  MATRIX_EXTENSION,
  parseMatrix,
  serializeMatrix,
  createSeedMatrix,
  type MatrixCitationEntry,
} from "@/lib/literature-matrix";
import {
  literatureItemSchema,
  verifySaveToken,
  type ValidLiteratureItem,
} from "@/lib/literature/save-token";
import { PROJECT_BIBLIOGRAPHY_PATH, REFERENCES_DIRECTORY } from "@/lib/project-bibliography";
import { ANALYSIS_DIRECTORY } from "@/lib/research-workspace";
import {
  createAgentWorkspaceDirectory,
  listAgentWorkspaceFiles,
  readAgentWorkspaceTextOrNull,
  writeAgentWorkspaceFile,
} from "@/lib/workspace-files";
import { getOwnedProject } from "./actions";

const projectIdSchema = z.string().regex(/^[A-Za-z0-9_-]+$/);
const matrixPathSchema = z.string().trim().min(3).max(500);

const matrixCitationEntrySchema = z.object({
  citationKey: z.string().trim().min(1).max(300),
  doi: z.string().trim().max(500).optional(),
  title: z.string().trim().max(2_000).optional(),
  authors: z.string().trim().max(2_000).optional(),
  year: z.number().int().min(1500).max(2200).optional(),
  venue: z.string().trim().max(1_000).optional(),
});

export type MatrixFileSummary = {
  path: string;
  name: string;
  isDefault: boolean;
};

type WorkspaceUser = Awaited<ReturnType<typeof requireOwnedProject>>;

async function requireOwnedProject(projectId: string) {
  const user = await requireUser();
  const project = await getOwnedProject(user, projectId);
  if (!project) throw new Error("Project not found.");
  return user;
}

function normalizeMatrixPath(value: string) {
  const segments: string[] = [];
  for (const segment of value.split("/")) {
    if (!segment || segment === ".") continue;
    if (segment === "..") throw new Error("The matrix path is invalid.");
    segments.push(segment);
  }
  const normalized = segments.join("/");
  if (!normalized.endsWith(`.${MATRIX_EXTENSION}`)) {
    throw new Error("The matrix file must be a .matrix file.");
  }
  return normalized;
}

function resolveTargetMatrixPath(matrixPath: string | undefined) {
  return matrixPath ? normalizeMatrixPath(matrixPath) : DEFAULT_MATRIX_PATH;
}

async function walkWorkspaceFiles(userId: string, projectId: string) {
  const maxEntries = integerEnv("WORKSPACE_LIST_MAX_ENTRIES", 2_000, 1);
  const result = await listAgentWorkspaceFiles(userId, projectId, "");
  const all = [...result];
  const pending = result.filter((entry) => entry.isDir).map((entry) => entry.path);
  while (pending.length > 0 && all.length < maxEntries) {
    const folders = pending.splice(0);
    const batches = await Promise.all(
      folders.map((folder) => listAgentWorkspaceFiles(userId, projectId, folder)),
    );
    for (const entries of batches) {
      for (const entry of entries) {
        all.push(entry);
        if (entry.isDir) pending.push(entry.path);
        if (all.length >= maxEntries) break;
      }
      if (all.length >= maxEntries) break;
    }
  }
  return all;
}

async function readMatrixOrNull(user: WorkspaceUser, projectId: string, matrixPath: string) {
  return readAgentWorkspaceTextOrNull(user.id, projectId, matrixPath);
}

function parseMatrixOrThrow(source: string, matrixPath: string) {
  try {
    return parseMatrix(source);
  } catch {
    throw new Error(
      `${matrixPath} is not a valid matrix file. Open it in the editor and fix the source, then try again.`,
    );
  }
}

async function loadOrCreateMatrix(user: WorkspaceUser, projectId: string, matrixPath: string) {
  const existing = await readMatrixOrNull(user, projectId, matrixPath);
  if (existing === null) {
    return { content: createSeedMatrix(), existed: false as const };
  }
  return { content: parseMatrixOrThrow(existing, matrixPath), existed: true as const };
}

async function writeMatrix(
  user: WorkspaceUser,
  projectId: string,
  matrixPath: string,
  content: string,
  existed: boolean,
) {
  // The directory placeholder is only needed for a matrix that doesn't exist
  // yet; rewriting it on every append cost a storage round trip per save.
  if (!existed) {
    const parent = path.posix.dirname(matrixPath);
    if (parent && parent !== "." && parent !== "/") {
      await createAgentWorkspaceDirectory(user.id, projectId, parent);
    }
  }
  await writeAgentWorkspaceFile(user.id, projectId, matrixPath, content);
  invalidateMatrixOverview(user, projectId);
}

export async function listMatrixFiles(projectId: string): Promise<MatrixFileSummary[]> {
  const parsed = projectIdSchema.safeParse(projectId);
  if (!parsed.success) throw new Error("Project not found.");
  const user = await requireOwnedProject(parsed.data);
  return (await getMatrixOverview(user, parsed.data)).files;
}

export async function createMatrixFile(input: unknown): Promise<
  { success: true; matrixPath: string } | { success: false; error: string }
> {
  const schema = z.object({
    projectId: projectIdSchema,
    name: z.string().trim().min(1).max(120),
  });
  const parsed = schema.safeParse(input);
  if (!parsed.success) return { success: false, error: "Enter a matrix name between 1 and 120 characters." };
  const { projectId, name } = parsed.data;
  const user = await requireOwnedProject(projectId);

  const slug = name
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60)
    .replace(/-+$/g, "");
  if (!slug) return { success: false, error: "Choose a name with at least one letter or number." };

  const matrixPath = `${ANALYSIS_DIRECTORY}/${slug}.${MATRIX_EXTENSION}`;
  if (await readMatrixOrNull(user, projectId, matrixPath) !== null) {
    return { success: false, error: `A matrix named “${slug}.matrix” already exists.` };
  }
  await writeMatrix(user, projectId, matrixPath, serializeMatrix(createSeedMatrix()), false);
  revalidatePath(`/${projectId}`);
  return { success: true, matrixPath };
}

async function appendEntriesToMatrix(
  user: WorkspaceUser,
  projectId: string,
  matrixPath: string,
  entries: MatrixCitationEntry[],
): Promise<{ matrixPath: string; matrixContent: string; addedCount: number; duplicateCount: number }> {
  const { content, existed } = await loadOrCreateMatrix(user, projectId, matrixPath);
  const { matrix, added, duplicates } = addMatrixPapers(content, entries);
  const matrixContent = serializeMatrix(matrix);
  if (added.length > 0) {
    await writeMatrix(user, projectId, matrixPath, matrixContent, existed);
    revalidatePath(`/${projectId}`);
  }
  return { matrixPath, matrixContent, addedCount: added.length, duplicateCount: duplicates.length };
}

export async function addLiteratureItemsToMatrix(input: unknown): Promise<
  | { success: true; matrixPath: string; matrixContent: string; bibliographyContent?: string; addedCount: number; duplicateCount: number }
  | { success: false; error: string }
> {
  const schema = z.object({
    projectId: projectIdSchema,
    // Loose so the signed saveToken and other provider fields pass through to
    // saveLiteratureCitation, which re-validates the full item.
    items: z.array(z.looseObject({
      id: z.string().min(1).max(300),
      title: z.string().min(1).max(2_000),
      authors: z.array(z.string().min(1).max(500)).max(200),
      year: z.number().int().min(1500).max(2200).optional(),
      doi: z.string().max(500).optional(),
      pmid: z.string().max(100).optional(),
      venue: z.string().max(1_000).optional(),
    })).min(1).max(50),
    matrixPath: matrixPathSchema.optional(),
  });
  const parsed = schema.safeParse(input);
  if (!parsed.success) return { success: false, error: "The literature items are invalid." };
  const { projectId, items, matrixPath } = parsed.data;
  const user = await requireOwnedProject(projectId);

  // Matrix rows always point at saved citations, so each item passes the same
  // full validation and signed-token check a direct save does — once, up
  // front, instead of once per nested save round trip.
  const verifiedItems: ValidLiteratureItem[] = [];
  for (const item of items) {
    const parsedItem = literatureItemSchema.safeParse(item);
    if (!parsedItem.success) return { success: false, error: "The literature items are invalid." };
    if (!verifySaveToken(projectId, parsedItem.data)) {
      return { success: false as const, error: "This search result expired. Run the search again before saving." };
    }
    verifiedItems.push(parsedItem.data);
  }

  try {
    const targetMatrixPath = resolveTargetMatrixPath(matrixPath);
    // The bibliography and the target matrix are independent reads; fetching
    // both up front replaces the per-item read-list-write citation cycle with
    // one parallel read and at most one write per file.
    const [existingBibliography, existingMatrix] = await Promise.all([
      readAgentWorkspaceTextOrNull(user.id, projectId, PROJECT_BIBLIOGRAPHY_PATH),
      readMatrixOrNull(user, projectId, targetMatrixPath),
    ]);

    let bibliographyContent = existingBibliography ?? "";
    const entries: MatrixCitationEntry[] = [];
    for (const item of verifiedItems) {
      const result = appendLiteratureItem(bibliographyContent, item);
      bibliographyContent = result.content;
      entries.push({
        citationKey: result.citationKey,
        doi: item.doi,
        title: item.title,
        authors: item.authors.join("; "),
        year: item.year,
        venue: item.venue,
      });
    }

    const matrixSeed = existingMatrix === null
      ? createSeedMatrix()
      : parseMatrixOrThrow(existingMatrix, targetMatrixPath);
    const { matrix, added, duplicates } = addMatrixPapers(matrixSeed, entries);
    const matrixContent = serializeMatrix(matrix);

    const bibliographyChanged = bibliographyContent !== (existingBibliography ?? "");
    if (existingBibliography === null && bibliographyChanged) {
      await createAgentWorkspaceDirectory(user.id, projectId, REFERENCES_DIRECTORY);
    }
    if (bibliographyChanged) {
      await writeAgentWorkspaceFile(user.id, projectId, PROJECT_BIBLIOGRAPHY_PATH, bibliographyContent);
    }
    if (added.length > 0) {
      await writeMatrix(user, projectId, targetMatrixPath, matrixContent, existingMatrix !== null);
    }
    if (added.length > 0 || bibliographyChanged) {
      revalidatePath(`/${projectId}`);
    }

    return {
      success: true as const,
      matrixPath: targetMatrixPath,
      matrixContent,
      bibliographyContent,
      addedCount: added.length,
      duplicateCount: duplicates.length,
    };
  } catch (error) {
    console.error("[matrix-add-literature] failed", error);
    return { success: false as const, error: error instanceof Error ? error.message : "Could not add to the matrix." };
  }
}

export async function addCitationsToMatrix(input: unknown): Promise<
  | { success: true; matrixPath: string; matrixContent: string; addedCount: number; duplicateCount: number }
  | { success: false; error: string }
> {
  const schema = z.object({
    projectId: projectIdSchema,
    entries: z.array(matrixCitationEntrySchema).min(1).max(50),
    matrixPath: matrixPathSchema.optional(),
  });
  const parsed = schema.safeParse(input);
  if (!parsed.success) return { success: false, error: "The references are invalid." };
  const { projectId, entries, matrixPath } = parsed.data;
  const user = await requireOwnedProject(projectId);

  try {
    const outcome = await appendEntriesToMatrix(user, projectId, resolveTargetMatrixPath(matrixPath), entries);
    return { success: true, ...outcome };
  } catch (error) {
    console.error("[matrix-add-citations] failed", error);
    return { success: false, error: error instanceof Error ? error.message : "Could not add to the matrix." };
  }
}

type MatrixIndex = { path: string; keys: Set<string>; dois: Set<string> };
type MatrixOverview = { files: MatrixFileSummary[]; indexes: MatrixIndex[] };

// Matrix targets and membership badges are commonly requested together when
// the literature or bibliography UI mounts. Coalesce those independent Server
// Action calls onto one in-flight workspace scan, and keep the resolved
// overview for a few seconds so the post-save badge syncs don't each re-walk
// the workspace. Matrix writes invalidate it, keeping badges fresh.
const MATRIX_OVERVIEW_CACHE_TTL_MS = integerEnv("MATRIX_OVERVIEW_CACHE_TTL_SECONDS", 5, 0) * 1_000;
const matrixOverviewCache = new Map<string, {
  promise: Promise<MatrixOverview>;
  expiresAt: number;
}>();

function matrixOverviewCacheKey(user: WorkspaceUser, projectId: string) {
  return `${user.id}\u0000${projectId}`;
}

async function collectMatrixOverview(user: WorkspaceUser, projectId: string): Promise<MatrixOverview> {
  const entries = await walkWorkspaceFiles(user.id, projectId);
  const matrixEntries = entries.filter(
    (entry) => !entry.isDir && entry.name.toLocaleLowerCase().endsWith(`.${MATRIX_EXTENSION}`),
  );
  const files = matrixEntries.map((entry) => ({
    path: entry.path,
    name: entry.name,
    isDefault: entry.path === DEFAULT_MATRIX_PATH,
  })).sort((left, right) =>
    Number(right.isDefault) - Number(left.isDefault) || left.name.localeCompare(right.name),
  );
  const indexes = await Promise.all(matrixEntries.map(async (entry): Promise<MatrixIndex | undefined> => {
    const source = await readMatrixOrNull(user, projectId, entry.path);
    if (source === null) return undefined;
    try {
      const keys = new Set<string>();
      const dois = new Set<string>();
      for (const row of parseMatrix(source).rows) {
        keys.add(row.citationKey);
        if (row.doi) dois.add(row.doi.toLocaleLowerCase());
      }
      return { path: entry.path, keys, dois };
    } catch {
      // A hand-corrupted matrix file should not break saved-state badges.
      return undefined;
    }
  }));
  return { files, indexes: indexes.filter((index): index is MatrixIndex => index !== undefined) };
}

function getMatrixOverview(user: WorkspaceUser, projectId: string) {
  const key = matrixOverviewCacheKey(user, projectId);
  const cached = matrixOverviewCache.get(key);
  // A fresh or still-in-flight scan serves everyone; failures evict
  // immediately so errors don't stick around for the TTL.
  if (cached && cached.expiresAt > Date.now()) return cached.promise;

  const entry = {
    promise: collectMatrixOverview(user, projectId),
    expiresAt: Date.now() + MATRIX_OVERVIEW_CACHE_TTL_MS,
  };
  matrixOverviewCache.set(key, entry);
  void entry.promise.catch(() => {
    if (matrixOverviewCache.get(key) === entry) matrixOverviewCache.delete(key);
  });
  return entry.promise;
}

function invalidateMatrixOverview(user: WorkspaceUser, projectId: string) {
  matrixOverviewCache.delete(matrixOverviewCacheKey(user, projectId));
}

function matrixPathsContaining(indexes: MatrixIndex[], citationKey: string, doi?: string) {
  const normalizedDoi = doi?.trim().toLocaleLowerCase();
  return indexes
    .filter((index) => index.keys.has(citationKey) || (normalizedDoi && index.dois.has(normalizedDoi)))
    .map((index) => index.path);
}

export async function getMatrixSavedState(input: unknown): Promise<{
  itemIds: string[];
  /** Matrix paths containing each item, keyed by item id. */
  itemMatrixPaths: Record<string, string[]>;
}> {
  const identitySchema = z.object({
    id: z.string().min(1).max(300),
    title: z.string().min(1).max(2_000),
    authors: z.array(z.string().min(1).max(500)).max(200),
    year: z.number().int().min(1500).max(2200).optional(),
    doi: z.string().max(500).optional(),
    pmid: z.string().max(100).optional(),
  });
  const schema = z.object({
    projectId: projectIdSchema,
    items: z.array(identitySchema).max(1_500),
  });
  const parsed = schema.safeParse(input);
  if (!parsed.success) return { itemIds: [], itemMatrixPaths: {} };
  const { projectId, items } = parsed.data;
  const user = await requireOwnedProject(projectId);

  const { indexes } = await getMatrixOverview(user, projectId);
  const itemIds: string[] = [];
  const itemMatrixPaths: Record<string, string[]> = {};
  for (const item of items) {
    const paths = matrixPathsContaining(indexes, fileStem(item), item.doi);
    if (paths.length > 0) {
      itemIds.push(item.id);
      itemMatrixPaths[item.id] = paths;
    }
  }
  return { itemIds, itemMatrixPaths };
}

export async function getCitationMatrixLocations(input: unknown): Promise<{
  /** Matrix paths containing each citation, keyed by citation key. */
  paths: Record<string, string[]>;
}> {
  const schema = z.object({
    projectId: projectIdSchema,
    entries: z.array(z.object({
      citationKey: z.string().trim().min(1).max(300),
      doi: z.string().trim().max(500).optional(),
    })).min(1).max(50),
  });
  const parsed = schema.safeParse(input);
  if (!parsed.success) return { paths: {} };
  const { projectId, entries } = parsed.data;
  const user = await requireOwnedProject(projectId);

  const { indexes } = await getMatrixOverview(user, projectId);
  const paths: Record<string, string[]> = {};
  for (const entry of entries) {
    paths[entry.citationKey] = matrixPathsContaining(indexes, entry.citationKey, entry.doi);
  }
  return { paths };
}
