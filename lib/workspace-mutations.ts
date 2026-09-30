import type { WorkspaceFileEntry } from "./workspace-files";

/**
 * Optimistic workspace mutations. Actions that already know their outcome
 * (rename, move, delete, duplicate, upload) broadcast one of these right after
 * the server call succeeds, so panels update — with correct paths — instead of
 * showing stale rows until a full listing refresh lands. The existing
 * "beeblio:workspace-changed" refresh then reconciles in the background.
 */
export const WORKSPACE_MUTATION_EVENT = "beeblio:workspace-mutation";

export type WorkspaceMutation =
  /** A rename is a move inside the same folder; `entry` is the post-move row. */
  | { kind: "move"; from: string; to: string; entry: WorkspaceFileEntry }
  | { kind: "delete"; path: string }
  | { kind: "create"; entry: WorkspaceFileEntry };

export function pathParent(path: string) {
  const slash = path.lastIndexOf("/");
  return slash === -1 ? "" : path.slice(0, slash);
}

export function pathBasename(path: string) {
  return path.slice(path.lastIndexOf("/") + 1);
}

/** Applies a mutation to one folder's listing; `folderPath` of "" is the root. */
export function applyMutationToFolderListing(
  entries: WorkspaceFileEntry[],
  folderPath: string,
  mutation: WorkspaceMutation,
): WorkspaceFileEntry[] {
  if (mutation.kind === "create") {
    return pathParent(mutation.entry.path) === folderPath &&
      !entries.some((entry) => entry.path === mutation.entry.path)
      ? [...entries, mutation.entry]
      : entries;
  }
  if (mutation.kind === "delete") {
    return entries.filter((entry) => entry.path !== mutation.path);
  }
  const sourceParent = pathParent(mutation.from);
  const targetParent = pathParent(mutation.to);
  if (folderPath === sourceParent && folderPath === targetParent) {
    return entries.map((entry) => (entry.path === mutation.from ? mutation.entry : entry));
  }
  if (folderPath === sourceParent) {
    return entries.filter((entry) => entry.path !== mutation.from);
  }
  if (folderPath === targetParent) {
    return entries.some((entry) => entry.path === mutation.to)
      ? entries.map((entry) => (entry.path === mutation.to ? mutation.entry : entry))
      : [...entries, mutation.entry];
  }
  return entries;
}

/** Applies a mutation to a flat recursive listing of the whole workspace. */
export function applyMutationToFlatListing(
  entries: WorkspaceFileEntry[],
  mutation: WorkspaceMutation,
): WorkspaceFileEntry[] {
  if (mutation.kind === "create") {
    return entries.some((entry) => entry.path === mutation.entry.path)
      ? entries
      : [...entries, mutation.entry];
  }
  if (mutation.kind === "delete") {
    return entries.filter(
      (entry) => entry.path !== mutation.path && !entry.path.startsWith(`${mutation.path}/`),
    );
  }
  const moved = entries.map((entry) => {
    if (entry.path === mutation.from) return mutation.entry;
    if (entry.path.startsWith(`${mutation.from}/`)) {
      // Moving a folder shifts everything under it along with it.
      return { ...entry, path: mutation.to + entry.path.slice(mutation.from.length) };
    }
    return entry;
  });
  // The source may be missing from a truncated listing; the moved row exists.
  return moved.some((entry) => entry.path === mutation.to) ? moved : [...moved, mutation.entry];
}

/**
 * For a delete (or a move of a directory), cached listings under that path are
 * stale wholesale; callers drop them so the next browse re-fetches.
 */
export function removedFolderRoot(mutation: WorkspaceMutation): string | undefined {
  if (mutation.kind === "create") return undefined;
  return mutation.kind === "move" ? mutation.from : mutation.path;
}

// Best-effort client-side cache of per-folder listings, shared by the file
// explorer, the artifact panels, and the per-row move dialogs. Populated by
// whoever fetches a listing; the move dialog reads it before hitting the
// server, so browsing folders it has already seen is instant.
const folderListings = new Map<string, WorkspaceFileEntry[]>();

export function rememberFolderListing(folderPath: string, entries: WorkspaceFileEntry[]) {
  folderListings.set(folderPath, entries);
}

export function cachedFolderListing(folderPath: string) {
  return folderListings.get(folderPath);
}

/**
 * Derives per-folder listings from a flat recursive listing (the artifact
 * panels already hold one). Never overwrites an existing entry: folder-by-
 * folder fetches are complete, while the recursive listing may be truncated.
 */
export function seedFolderListingsFromFlatListing(entries: WorkspaceFileEntry[]) {
  const byFolder = new Map<string, WorkspaceFileEntry[]>();
  for (const entry of entries) {
    const parent = pathParent(entry.path);
    const list = byFolder.get(parent);
    if (list) list.push(entry);
    else byFolder.set(parent, [entry]);
  }
  for (const [folder, list] of byFolder) {
    if (!folderListings.has(folder)) folderListings.set(folder, list);
  }
}

export function dispatchWorkspaceMutation(mutation: WorkspaceMutation) {
  for (const [folder, entries] of folderListings) {
    folderListings.set(folder, applyMutationToFolderListing(entries, folder, mutation));
  }
  const removedRoot = removedFolderRoot(mutation);
  if (removedRoot !== undefined) {
    for (const folder of [...folderListings.keys()]) {
      if (folder === removedRoot || folder.startsWith(`${removedRoot}/`)) {
        folderListings.delete(folder);
      }
    }
  }
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent(WORKSPACE_MUTATION_EVENT, { detail: mutation }));
  }
}

// The refresh event means "something outside these mutations changed" (agent
// edits, uploads elsewhere); cached listings can no longer be trusted. Panels
// re-seed the cache from the listings they fetch to reconcile.
if (typeof window !== "undefined") {
  window.addEventListener("beeblio:workspace-changed", () => folderListings.clear());
}
