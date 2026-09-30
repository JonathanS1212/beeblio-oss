export function workspaceFilePath(value: string): string | null {
  const normalized = value.trim().replace(/\\/g, "/");
  if (!normalized.startsWith("/workspace/")) return null;

  const relative = normalized.slice("/workspace/".length).replace(/^\/+/, "");
  if (!relative || relative.endsWith("/") || relative.split("/").includes("..")) {
    return null;
  }
  return relative;
}

/**
 * Recovers a workspace-relative file path from a URL that rehype-harden
 * blocked. The chat markdown renderer blocks link hrefs it cannot parse,
 * which includes the bare relative paths agents use to reference files
 * they created (e.g. `[Open the report](survey_report.md)`). Those hrefs
 * are file mentions, not navigation targets, so we resolve them here to
 * render an open-in-workspace chip instead of the "[blocked]" indicator.
 *
 * Accepts `file:///workspace/...` URLs and bare relative paths that look
 * like files (last segment has an extension). Returns null for anything
 * else — schemes like `javascript:` stay blocked.
 */
export function blockedUrlWorkspacePath(url: string): string | null {
  let candidate = url.trim().replace(/\\/g, "/");

  if (candidate.startsWith("file://")) {
    candidate = candidate.slice("file://".length);
    // Only file URLs that point into the workspace are rescuable.
    if (!candidate.startsWith("/workspace/")) return null;
  }

  try {
    candidate = decodeURIComponent(candidate);
  } catch {
    return null;
  }

  if (candidate.startsWith("/workspace/")) {
    return workspaceFilePath(candidate);
  }

  // Bare relative path: reject scheme-like (`mailto:`, `javascript:`)
  // and fragment/query/absolute forms; only workspace-relative file
  // paths pass.
  if (/[:?#]/.test(candidate) || candidate.startsWith("/")) return null;

  const segments = candidate.split("/");
  const lastSegment = segments.at(-1) ?? "";
  if (
    !lastSegment ||
    !/\.[A-Za-z0-9]+$/.test(lastSegment) ||
    segments.includes("..") ||
    segments.includes("")
  ) {
    return null;
  }
  return candidate;
}
