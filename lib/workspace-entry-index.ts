import { WORKSPACE_MUTATION_EVENT, type WorkspaceMutation } from "./workspace-mutations";

/**
 * Best-effort client-side index of workspace entries (path → isDir). Mention
 * chips parsed out of assistant markdown (`` `/workspace/2-Data/raw` ``) carry
 * no kind information, so they consult this index to decide between opening
 * an editor tab and revealing a folder in the File Explorer.
 *
 * The chat seeds it from the recursive listing it already fetches; optimistic
 * mutation events keep it fresh between listings.
 */
const entryKinds = new Map<string, boolean>();

/** Replaces the index with a full recursive listing. */
export function rememberWorkspaceEntries(
  entries: readonly { readonly path: string; readonly isDir: boolean }[],
) {
  entryKinds.clear();
  for (const entry of entries) entryKinds.set(entry.path, entry.isDir);
}

export function isWorkspaceDirectory(path: string): boolean {
  const known = entryKinds.get(path);
  if (known !== undefined) return known;
  // Unknown to the index: fall back to the same shape cue the blocked-link
  // rescue uses — a last segment without an extension reads as a folder.
  return !/\.[A-Za-z0-9]+$/.test(path.slice(path.lastIndexOf("/") + 1));
}

function applyMutation(mutation: WorkspaceMutation) {
  if (mutation.kind === "create") {
    entryKinds.set(mutation.entry.path, mutation.entry.isDir);
    return;
  }
  if (mutation.kind === "delete") {
    for (const path of entryKinds.keys()) {
      if (path === mutation.path || path.startsWith(`${mutation.path}/`)) {
        entryKinds.delete(path);
      }
    }
    return;
  }
  // Move: rewrites collected first so a destination inside the source tree
  // cannot re-match its own rewrite.
  const rewrites: Array<[path: string, isDir: boolean]> = [];
  for (const [path, isDir] of entryKinds) {
    if (path === mutation.from) {
      rewrites.push([mutation.to, mutation.entry.isDir]);
      entryKinds.delete(path);
    } else if (path.startsWith(`${mutation.from}/`)) {
      rewrites.push([mutation.to + path.slice(mutation.from.length), isDir]);
      entryKinds.delete(path);
    }
  }
  for (const [path, isDir] of rewrites) entryKinds.set(path, isDir);
}

if (typeof window !== "undefined") {
  window.addEventListener(WORKSPACE_MUTATION_EVENT, (event) => {
    const mutation = (event as CustomEvent<WorkspaceMutation>).detail;
    if (mutation) applyMutation(mutation);
  });
}
