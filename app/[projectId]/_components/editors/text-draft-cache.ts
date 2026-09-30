// Client-side store of unsaved editor drafts, keyed by `${projectId}:${path}`.
//
// Where text-content-cache.ts remembers the last *saved* content so a file
// opens instantly, this store keeps the user's *unsaved* work so it survives
// tab switches (which unmount the editor and its React state) and page
// reloads:
//   - the in-memory Map lives as long as the page and is written through on
//     every edit
//   - a sessionStorage mirror (debounced, flushed on pagehide) restores the
//     draft after a reload in the same tab; it never outlives the tab
//
// Entries are cleared on save/discard and when the tab or file goes away, and
// re-keyed on rename/move. Unlike the content cache, drafts are NOT
// invalidated by beeblio:workspace-changed — an agent rewriting the file does
// not undo the user's typing; the editor's existing review flow reconciles
// the two on the next open. Keys carry the project id because module state
// survives client-side navigation between projects, where paths alone would
// collide (every project has a references.bib).

const DRAFT_KEY_PREFIX = "beeblio:draft:";
const SESSION_FLUSH_DELAY_MS = 400;

const entries = new Map<string, string>();
// sessionStorage writes are debounced per keystroke; a pending null removes
// the key. pagehide flushes everything so a reload keeps the latest draft.
const pendingSessionWrites = new Map<string, string | null>();
let flushTimer: ReturnType<typeof setTimeout> | undefined;

const draftKey = (projectId: string, path: string) => `${DRAFT_KEY_PREFIX}${projectId}:${path}`;

// sessionStorage access itself throws when site data is blocked; mirroring is
// best-effort and the in-memory store still covers the page session.
function sessionStorageRef(): Storage | null {
  try {
    return typeof sessionStorage === "undefined" ? null : sessionStorage;
  } catch {
    return null;
  }
}

function flushSessionWrites() {
  if (flushTimer !== undefined) {
    clearTimeout(flushTimer);
    flushTimer = undefined;
  }
  const storage = sessionStorageRef();
  if (storage) {
    for (const [key, value] of pendingSessionWrites) {
      try {
        if (value === null) storage.removeItem(key);
        else storage.setItem(key, value);
      } catch {
        // Quota exceeded (or storage denied): skip mirroring this write.
      }
    }
  }
  pendingSessionWrites.clear();
}

function scheduleSessionFlush() {
  if (flushTimer !== undefined) return;
  // The callback clears its own handle before flushing, so clearTimeout only
  // ever runs for a pending timer (the pagehide flush).
  flushTimer = setTimeout(() => {
    flushTimer = undefined;
    flushSessionWrites();
  }, SESSION_FLUSH_DELAY_MS);
}

export function readTextDraft(projectId: string, path: string): string | undefined {
  const key = draftKey(projectId, path);
  // The pending queue reflects the latest write/clear even before the
  // debounce flushes; consulting it first keeps a just-cleared draft from
  // resurrecting out of sessionStorage within the flush window.
  if (pendingSessionWrites.has(key)) {
    const pending = pendingSessionWrites.get(key)!;
    return pending === null ? undefined : pending;
  }
  if (entries.has(key)) return entries.get(key);
  const stored = sessionStorageRef()?.getItem(key) ?? null;
  if (stored === null) return undefined;
  entries.set(key, stored);
  return stored;
}

export function writeTextDraft(projectId: string, path: string, content: string): void {
  const key = draftKey(projectId, path);
  entries.set(key, content);
  pendingSessionWrites.set(key, content);
  scheduleSessionFlush();
}

export function clearTextDraft(projectId: string, path: string): void {
  const key = draftKey(projectId, path);
  entries.delete(key);
  pendingSessionWrites.set(key, null);
  scheduleSessionFlush();
}

// Rename/move: carry a stored draft (if any) to the file's new path.
export function moveTextDraftKey(projectId: string, fromPath: string, toPath: string): void {
  const draft = readTextDraft(projectId, fromPath);
  if (draft !== undefined) writeTextDraft(projectId, toPath, draft);
  clearTextDraft(projectId, fromPath);
}

// Bind the flush once per page session (the guard keeps a hot-reloading dev
// server from stacking duplicates).
if (typeof window !== "undefined") {
  const globalWindow = window as { __beeblioDraftCacheBound?: boolean };
  if (!globalWindow.__beeblioDraftCacheBound) {
    globalWindow.__beeblioDraftCacheBound = true;
    window.addEventListener("pagehide", flushSessionWrites);
  }
}
