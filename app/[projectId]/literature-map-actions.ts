"use server";

import { createHash } from "node:crypto";
import { z } from "zod";

import { requireUser } from "@/lib/auth/session";
import { parseBibtexEntries } from "@/lib/bibtex";
import { lookupLiteratureWork } from "@/lib/literature/search";
import { readAgentWorkspaceFile, writeAgentWorkspaceFile } from "@/lib/workspace-gcs";
import { getOwnedProject } from "./actions";

const CACHE_VERSION = 1;
const CACHE_TTL_MS = 30 * 24 * 60 * 60 * 1_000;
const MAX_LOOKUPS_PER_REQUEST = 20;
const inputSchema = z.object({
  projectId: z.string().regex(/^[A-Za-z0-9_-]+$/),
  filePath: z.string().trim().min(1).max(1_024).refine((value) => value.toLowerCase().endsWith(".bib"), "Choose a BibTeX file."),
});
type CacheRecord = { openalexId: string; referencedOpenalexIds: string[]; fetchedAt: string };
type Cache = { version: 1; works: Record<string, CacheRecord> };

function doi(value = "") {
  return value.replace(/^https?:\/\/(?:dx\.)?doi\.org\//i, "").trim().toLowerCase();
}

function cachePath(filePath: string) {
  const name = createHash("sha256").update(filePath).digest("hex").slice(0, 20);
  return `.bee/literature-map/${name}.json`;
}

async function readCache(userId: string, projectId: string, filePath: string): Promise<Cache> {
  try {
    const value = await (await readAgentWorkspaceFile(userId, projectId, cachePath(filePath))).json() as Partial<Cache>;
    if (value.version === CACHE_VERSION && value.works && typeof value.works === "object") return value as Cache;
  } catch {
    // The cache is optional and disposable.
  }
  return { version: CACHE_VERSION, works: {} };
}

export async function enrichLiteratureMap(input: unknown) {
  const parsed = inputSchema.safeParse(input);
  if (!parsed.success) throw new Error(parsed.error.issues[0]?.message || "The literature map request is invalid.");
  const user = await requireUser();
  if (!await getOwnedProject(user, parsed.data.projectId)) throw new Error("Project not found.");
  const response = await readAgentWorkspaceFile(user.id, parsed.data.projectId, parsed.data.filePath);
  const entries = parseBibtexEntries(await response.text());
  const keyedDois = entries.map((entry) => ({ citationKey: entry.key, doi: doi(entry.fields.doi) })).filter((entry) => Boolean(entry.doi));
  const cache = await readCache(user.id, parsed.data.projectId, parsed.data.filePath);
  const freshAfter = Date.now() - CACHE_TTL_MS;
  const missing = keyedDois.filter(({ doi: value }) => {
    const fetched = Date.parse(cache.works[value]?.fetchedAt || "");
    return !Number.isFinite(fetched) || fetched < freshAfter;
  }).slice(0, MAX_LOOKUPS_PER_REQUEST);

  const resolved = await Promise.allSettled(missing.map(async ({ doi: value }) => {
    const result = await lookupLiteratureWork({ paperId: value, includeReferences: true, referenceLimit: 50 });
    return {
      doi: value,
      record: {
        openalexId: result.work.openalexId,
        referencedOpenalexIds: result.references.map((reference) => reference.openalexId),
        fetchedAt: new Date().toISOString(),
      } satisfies CacheRecord,
    };
  }));
  for (const result of resolved) if (result.status === "fulfilled") cache.works[result.value.doi] = result.value.record;
  if (resolved.some((result) => result.status === "fulfilled")) {
    await writeAgentWorkspaceFile(user.id, parsed.data.projectId, cachePath(parsed.data.filePath), JSON.stringify(cache));
  }

  const openalexToKey = new Map(keyedDois.flatMap(({ citationKey, doi: value }) => {
    const id = cache.works[value]?.openalexId;
    return id ? [[id, citationKey] as const] : [];
  }));
  const seen = new Set<string>();
  const citationEdges: Array<{ source: string; target: string }> = [];
  for (const { citationKey, doi: value } of keyedDois) {
    for (const targetId of cache.works[value]?.referencedOpenalexIds || []) {
      const target = openalexToKey.get(targetId);
      if (!target || target === citationKey) continue;
      const key = `${citationKey}\u0000${target}`;
      if (seen.has(key)) continue;
      seen.add(key);
      citationEdges.push({ source: citationKey, target });
    }
  }
  const resolvedCount = keyedDois.filter(({ doi: value }) => Boolean(cache.works[value]?.openalexId)).length;
  return {
    citationEdges,
    resolvedCount,
    eligibleCount: keyedDois.length,
    remainingCount: Math.max(0, keyedDois.length - resolvedCount),
    failedCount: resolved.filter((result) => result.status === "rejected").length,
  };
}
