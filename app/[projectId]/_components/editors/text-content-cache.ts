// Client-side cache of text file contents, keyed by workspace path, so
// re-opening a recently viewed file renders instantly instead of paying a
// server-action round trip (auth + Neon ownership query + agent fetch).
//
// Freshness is event-driven, mirroring what the file explorer already trusts:
//   - beeblio:workspace-changed  → clear everything (agent turn finished,
//     upload, copy-into-workspace)
//   - beeblio:reload-workspace-file → drop that one path
//   - successful saves write the saved content back into the cache
// Entries older than REVALIDATE_AFTER_MS additionally revalidate in the
// background the next time the file opens (SWR-style), covering out-of-band
// changes such as another browser tab editing the same file.

import { getFileContent } from "../../file-actions";

const REVALIDATE_AFTER_MS = 30_000;

type CacheEntry = {
  content: string;
  cachedAt: number;
};

const entries = new Map<string, CacheEntry>();

export function readCachedText(path: string): string | undefined {
  return entries.get(path)?.content;
}

export function cachedTextNeedsRevalidation(path: string): boolean {
  const entry = entries.get(path);
  return entry === undefined || Date.now() - entry.cachedAt > REVALIDATE_AFTER_MS;
}

export function writeCachedText(path: string, content: string): void {
  entries.set(path, { content, cachedAt: Date.now() });
}

export function invalidateCachedText(path?: string): void {
  if (path === undefined) entries.clear();
  else entries.delete(path);
}

// Hover/keyboard warmth for file listings: pulling the text into the cache
// before the click lets the editor mount read synchronously instead of paying
// the server-action round trip after React commits. Fresh entries and
// duplicate hovers are skipped so the action fires at most once per staleness
// window; failures stay silent (the editor's own load reports real errors).
const prefetchInFlight = new Map<string, Promise<void>>();

export function prefetchTextFile(projectId: string, path: string): void {
  if (!cachedTextNeedsRevalidation(path)) return;
  if (prefetchInFlight.has(path)) return;
  const load = (async () => {
    try {
      const value = await getFileContent(projectId, path);
      if (value !== null) writeCachedText(path, value);
    } catch {
      // Best-effort warmth only.
    } finally {
      prefetchInFlight.delete(path);
    }
  })();
  prefetchInFlight.set(path, load);
}

// Bind the invalidation listeners once per page session (the Symbol.for guard
// keeps a hot-reloading dev server from stacking duplicates).
if (typeof window !== "undefined") {
  const globalWindow = window as { __beeblioTextCacheBound?: boolean };
  if (!globalWindow.__beeblioTextCacheBound) {
    globalWindow.__beeblioTextCacheBound = true;
    window.addEventListener("beeblio:workspace-changed", () => entries.clear());
    window.addEventListener("beeblio:reload-workspace-file", (event) => {
      const detail = (event as CustomEvent<{ path?: string }>).detail;
      invalidateCachedText(detail?.path);
    });
  }
}
