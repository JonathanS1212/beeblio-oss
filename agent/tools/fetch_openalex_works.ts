import { defineTool } from "eve/tools";
import type { ToolContext } from "eve/tools";
import { z } from "zod";

import {
  buildWorksIdsUrl,
  buildWorksSearchUrl,
  chunkWorkIds,
} from "../lib/openalex";
import { fetchWithTimeout } from "../lib/tool-runtime";
import { getUserContactEmail } from "../lib/user-contact";
import { resolveWorkspaceOutputFile } from "../workspace-paths";
import { writeWorkspaceFile } from "../workspace-files";

const emailPattern = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

const inputSchema = z
  .object({
    destinationDir: z
      .string()
      .trim()
      .min(1)
      .describe(
        "Workspace directory for the raw result pages, e.g. /workspace/3-Analysis/bibliometric/<run>/raw_pages. " +
          "One JSON array file is written per fetched page; existing files with the same names are overwritten.",
      ),
    queries: z
      .array(z.string().trim().min(2).max(300))
      .min(1)
      .max(6)
      .optional()
      .describe("Search queries; runs one paginated request series per query (mode 1: search)."),
    workIds: z
      .array(z.string().trim().min(2).max(300))
      .min(1)
      .max(300)
      .optional()
      .describe(
        "OpenAlex work IDs to fetch by filter — W…, openalex:W…, or openalex.org URLs " +
          "(mode 2: enrichment / co-citation label resolution).",
      ),
    fields: z
      .enum(["full", "labels"])
      .default("full")
      .describe(
        "full = all bibliometric fields incl. abstract_inverted_index and referenced_works; " +
          "labels = id, title, authorships, publication_year.",
      ),
    fromYear: z.number().int().min(1900).max(2200).default(2010),
    toYear: z.number().int().min(1900).max(2200).optional(),
    requireAbstract: z.boolean().default(true),
    perPage: z
      .number()
      .int()
      .min(1)
      .max(200)
      .default(100)
      .describe("Records per page. Larger pages mean fewer requests; 100–200 recommended to stay under rate limits."),
    maxPagesPerQuery: z
      .number()
      .int()
      .min(1)
      .max(10)
      .default(2)
      .describe("Page cap per query. Keep the call's total page count low; split larger runs across calls."),
    mailto: z
      .string()
      .trim()
      .max(200)
      .regex(emailPattern, "mailto must be an email address")
      .optional()
      .describe(
        "Contact address for OpenAlex's polite pool. Defaults to the Beeblio account email automatically; pass only to override it.",
      ),
  })
  .refine((value) => (value.queries ? value.workIds === undefined : value.workIds !== undefined), {
    message: "Provide either queries or workIds, not both",
  })
  .refine((value) => value.toYear === undefined || value.toYear >= value.fromYear, {
    message: "toYear must be greater than or equal to fromYear",
  })
  .refine((value) => !value.queries || value.queries.length * value.maxPagesPerQuery <= 30, {
    message: "Too many pages in one call (queries × maxPagesPerQuery must be ≤ 30); split across calls into the same destination",
  });

const MAX_ATTEMPTS = 4;
const MIN_REQUEST_INTERVAL_MS = 600;
const MAX_BACKOFF_MS = 30_000;
const RATE_LIMIT_COOLDOWN_MS = 60_000;
const RATE_LIMIT_STREAK_LIMIT = 2;

// Module-level pacing and cooldown shared by every call in this agent
// process, so back-to-back tool calls cannot hammer the API either.
let lastRequestAt = 0;
let cooldownUntil = 0;

function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(new Error("Request aborted"));
      return;
    }
    const onAbort = () => {
      clearTimeout(timer);
      reject(new Error("Request aborted"));
    };
    const timer = setTimeout(() => {
      signal?.removeEventListener("abort", onAbort);
      resolve();
    }, ms);
    signal?.addEventListener("abort", onAbort, { once: true });
  });
}

type PageFetch =
  | { ok: true; results: unknown[] }
  | { ok: false; rateLimited: boolean; error: string };

/**
 * One OpenAlex request: polite User-Agent, ≥600 ms between requests across
 * the whole process, retry with the server's Retry-After hint on 429 (else
 * exponential backoff) and on 5xx/transient network errors, and no retry on
 * other 4xx. Returns a discriminated result so callers can react to rate
 * limiting instead of inferring it from thrown errors.
 */
async function fetchOpenAlexPage(
  url: string,
  options: { mailto?: string; signal?: AbortSignal },
): Promise<PageFetch> {
  const now = Date.now();
  if (now < cooldownUntil) {
    return {
      ok: false,
      rateLimited: true,
      error: `OpenAlex is cooling down after a rate limit (retry in ${Math.ceil((cooldownUntil - now) / 1000)}s)`,
    };
  }
  const userAgent = options.mailto ? `Beeblio (mailto:${options.mailto})` : "Beeblio";
  let lastError = "OpenAlex request failed";
  let sawRateLimit = false;
  let retryAfterMs: number | null = null;
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    if (attempt > 0) {
      await sleep(Math.min(retryAfterMs ?? (2 ** attempt + 2) * 1000, MAX_BACKOFF_MS), options.signal);
    } else {
      const pacingMs = Math.max(0, lastRequestAt + MIN_REQUEST_INTERVAL_MS - Date.now());
      if (pacingMs > 0) await sleep(pacingMs, options.signal);
    }
    lastRequestAt = Date.now();
    try {
      const response = await fetchWithTimeout(url, {
        signal: options.signal,
        headers: { "User-Agent": userAgent },
      });
      if (response.ok) {
        const payload = (await response.json()) as { results?: unknown };
        return { ok: true, results: Array.isArray(payload?.results) ? payload.results : [] };
      }
      lastError = `OpenAlex responded with status ${response.status}`;
      if (response.status === 429) {
        sawRateLimit = true;
        const header = Number(response.headers.get("retry-after"));
        retryAfterMs = Number.isFinite(header) && header > 0 ? header * 1000 : null;
        continue;
      }
      if (response.status >= 500) continue;
      return { ok: false, rateLimited: false, error: lastError };
    } catch (error) {
      if (
        error instanceof Error &&
        (error.name === "AbortError" || error.message === "Request aborted")
      ) {
        throw error;
      }
      lastError = String(error);
    }
  }
  return { ok: false, rateLimited: sawRateLimit, error: lastError };
}

export default defineTool({
  description:
    "Collect scholarly works metadata from the OpenAlex API into workspace files without loading records into chat. " +
    "Given search queries (paginated per query) or explicit work IDs, writes one JSON array of results per page under destinationDir " +
    "and returns only a manifest with file paths and counts. Read and analyze the files afterwards with a saved Python script instead of relaying records through conversation. " +
    "Keep request counts low (large perPage, few pages); the user's account email joins OpenAlex's polite pool automatically. " +
    "When the manifest reports rateLimited, wait about a minute before re-calling the failed queries.",
  inputSchema,
  async execute(input: z.infer<typeof inputSchema>, ctx: ToolContext) {
    const auth = ctx.session.auth.current;
    // Polite pool by default: the account email, unless the caller overrides it.
    const mailto = input.mailto ?? (await getUserContactEmail(auth?.principalId)) ?? undefined;
    const destination = resolveWorkspaceOutputFile(
      {
        principalId: auth?.principalId,
        projectSlug: auth?.attributes?.projectSlug,
        sessionId: ctx.session.id,
      },
      input.destinationDir,
    );

    const files: Array<{ path: string; recordCount: number; query?: string; page?: number; batch?: number }> = [];
    const failedRequests: Array<{ target: string; error: string }> = [];
    const workIds = new Set<string>();
    let totalRecords = 0;
    let rateLimitedStreak = 0;
    let rateLimited = false;

    // Persistent rate limiting trips a process-wide cooldown and stops the
    // run instead of hammering; two consecutive failures after per-request
    // retries means waiting, not more requests.
    const noteFailure = (target: string, result: Extract<PageFetch, { ok: false }>) => {
      failedRequests.push({ target, error: result.error });
      if (result.rateLimited) {
        rateLimited = true;
        rateLimitedStreak += 1;
        if (rateLimitedStreak >= RATE_LIMIT_STREAK_LIMIT) {
          cooldownUntil = Date.now() + RATE_LIMIT_COOLDOWN_MS;
          return true;
        }
      } else {
        rateLimitedStreak = 0;
      }
      return false;
    };

    const saveBatch = async (
      fileName: string,
      results: unknown[],
      meta: { query?: string; page?: number; batch?: number },
    ) => {
      const filePath = `${destination.workspacePath}/${fileName}`;
      await writeWorkspaceFile(
        destination.userId,
        destination.projectSlug,
        filePath,
        Buffer.from(JSON.stringify(results), "utf8"),
        { contentType: "application/json" },
      );
      files.push({
        path: `/workspace/${filePath}`,
        recordCount: results.length,
        ...meta,
      });
      totalRecords += results.length;
      for (const record of results) {
        const id = (record as { id?: unknown } | null)?.id;
        if (typeof id === "string") workIds.add(id);
      }
      rateLimitedStreak = 0;
    };

    let aborted = false;
    if (input.queries) {
      for (const [queryIndex, query] of input.queries.entries()) {
        if (aborted) break;
        for (let page = 1; page <= input.maxPagesPerQuery; page++) {
          const url = buildWorksSearchUrl({
            query,
            fromYear: input.fromYear,
            toYear: input.toYear,
            requireAbstract: input.requireAbstract,
            perPage: input.perPage,
            page,
            fields: input.fields,
            mailto,
          });
          const result = await fetchOpenAlexPage(url, { mailto, signal: ctx.abortSignal });
          if (!result.ok) {
            // Abandon this query's remaining pages and move to the next query.
            if (noteFailure(`query ${queryIndex + 1}, page ${page}`, result)) {
              aborted = true;
              break;
            }
            break;
          }
          await saveBatch(`q${queryIndex + 1}-p${String(page).padStart(2, "0")}.json`, result.results, { query, page });
          if (result.results.length < input.perPage) break;
        }
      }
    } else {
      const batches = chunkWorkIds(input.workIds ?? []);
      if (batches.length === 0) {
        throw new Error("No valid OpenAlex work IDs were supplied (expected W…, openalex:W…, or openalex.org URLs)");
      }
      for (const [batchIndex, batch] of batches.entries()) {
        if (aborted) break;
        const url = buildWorksIdsUrl(batch, { fields: input.fields, mailto });
        const result = await fetchOpenAlexPage(url, { mailto, signal: ctx.abortSignal });
        if (!result.ok) {
          if (noteFailure(`work-id batch ${batchIndex + 1}`, result)) {
            aborted = true;
            break;
          }
          continue;
        }
        await saveBatch(`ids-${String(batchIndex + 1).padStart(2, "0")}.json`, result.results, { batch: batchIndex + 1 });
      }
    }

    if (files.length === 0) {
      throw new Error(
        `No OpenAlex result pages could be fetched: ${failedRequests.map((f) => `${f.target} (${f.error})`).join("; ")}. ` +
          (rateLimited
            ? "OpenAlex is rate-limiting this deployment. Wait about a minute and retry with fewer queries" +
              (mailto ? "" : "; no polite-pool contact is configured for this account, so requests are throttled aggressively") +
              "."
            : "Check the query syntax and try again."),
      );
    }

    return {
      success: true,
      destinationDir: `/workspace/${destination.workspacePath}`,
      mode: input.queries ? "search" : "work-ids",
      files,
      totalRecords,
      distinctWorkIds: workIds.size,
      failedRequests,
      rateLimited,
      aborted,
      politePool: Boolean(mailto),
      message:
        `Fetched ${totalRecords} records (${workIds.size} distinct works) across ${files.length} page files into /workspace/${destination.workspacePath}` +
        (failedRequests.length ? `; ${failedRequests.length} request(s) failed and were skipped` : "") +
        (rateLimited ? "; OpenAlex rate-limited this run — wait about a minute before re-calling failed queries" : ""),
    };
  },
});
