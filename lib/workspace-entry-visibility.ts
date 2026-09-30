import type { WorkspaceFileEntry } from "./workspace-gcs";

const PYTHON_CACHE_DIRECTORY = "__pycache__";
const PYTHON_CACHE_FILE_PATTERN = /\.(?:pyc|pyo)$/i;

/**
 * Keep runtime and tool bookkeeping out of user-facing workspace listings.
 * A hidden directory segment hides its entire subtree.
 */
export function isVisibleWorkspaceEntry(entry: WorkspaceFileEntry): boolean {
  const segments = entry.path.split("/");
  if (segments.some((segment) =>
    segment.startsWith(".") || segment === PYTHON_CACHE_DIRECTORY
  )) return false;

  return !PYTHON_CACHE_FILE_PATTERN.test(segments.at(-1) ?? "");
}
