import path from "node:path";
import type { ToolContext } from "eve/tools";

import {
  stripCopiedDisplayLinePrefixes,
  stripStandaloneMermaidFences,
} from "./file-content-guards";
import { ensureBlankLineAfterTables } from "../../lib/markdown-repair";
import { resolveAuthenticatedWorkspace } from "../workspace-paths";
import { readWorkspaceFile, writeWorkspaceFile } from "../workspace-files";

/**
 * Text file extensions the sweep is willing to read and rewrite. Anything
 * else (binaries, unknown extensions) is left untouched even when modified.
 */
const SWEEPABLE_EXTENSIONS = new Set([
  ".md", ".markdown", ".mdx", ".txt", ".tex", ".bib", ".ris", ".csv", ".tsv",
  ".json", ".yaml", ".yml", ".html", ".htm", ".xml", ".css", ".js", ".mjs",
  ".cjs", ".ts", ".tsx", ".jsx", ".py", ".r", ".sps", ".do", ".log", ".ini",
  ".toml", ".env", ".sh", ".bash", ".sql", ".svg", ".matrix", ".mermaid",
  ".mmd",
]);

const MARKDOWN_EXTENSIONS = new Set([".md", ".markdown"]);
const MERMAID_EXTENSIONS = new Set([".mmd", ".mermaid"]);

/** Files larger than this are skipped: rewriting big outputs is not worth a
 * stale-read stamp mismatch risk, and corruption reports involve prose. */
const MAX_SWEEP_FILE_BYTES = 2 * 1024 * 1024;

type WorkspaceStamp = { userId: string; projectSlug: string; versions: Map<string, string> };

function resolveWorkspaceFromToolContext(ctx: ToolContext): WorkspaceStamp | undefined {
  try {
    const auth = ctx.session.auth.current;
    const { identity } = resolveAuthenticatedWorkspace({
      principalId: auth?.principalId,
      projectSlug: auth?.attributes?.projectSlug,
      sessionId: ctx.session.id,
    });
    return { userId: identity.userId, projectSlug: identity.projectSlug, versions: new Map() };
  } catch {
    // Dev fallbacks and unauthenticated contexts have no workspace to sweep;
    // the write_file cleaner still covers tool-routed writes.
    return undefined;
  }
}

async function listProjectObjects(
  userId: string,
  projectSlug: string,
): Promise<Map<string, string>> {
  // Object generations are the change signal (they increment on every
  // overwrite, from any writer), replacing the mtime snapshots the
  // host-filesystem sweep used.
  const { workspaceBucket } = await import("../workspace-files");
  const bucket = workspaceBucket();
  const prefix = `${userId}/${projectSlug}/`;
  const versions = new Map<string, string>();
  type PageQuery = { prefix: string; pageToken?: string };
  let query: PageQuery | undefined = { prefix };
  while (query) {
    const page = await bucket.getFiles({ ...query, autoPaginate: false }) as unknown as [unknown[], PageQuery | null | undefined];
    const objects = page[0];
    for (const object of objects as unknown as { name: string; metadata?: { generation?: string } }[]) {
      const relative = object.name.slice(prefix.length);
      if (relative === "" || relative.endsWith("/")) continue;
      versions.set(relative, object.metadata?.generation ?? "");
    }
    query = page[1] ?? undefined;
  }
  return versions;
}

/** Captures workspace file versions (object generations) before a command runs. */
export async function snapshotWorkspace(
  ctx: ToolContext,
): Promise<WorkspaceStamp | undefined> {
  const workspace = resolveWorkspaceFromToolContext(ctx);
  if (!workspace) return undefined;
  workspace.versions = await listProjectObjects(workspace.userId, workspace.projectSlug);
  return workspace;
}

/**
 * Re-checks workspace files modified since {@link snapshotWorkspace} and
 * removes copied tool-display line-number prefixes (read_file, grep, cat -n)
 * from text files written outside the write_file tool — shell redirections
 * and scripts run through bash. Returns a human-readable notice for the tool
 * output, or undefined when nothing needed cleaning.
 */
export async function sweepWorkspaceTextFiles(
  ctx: ToolContext,
  before: WorkspaceStamp | undefined,
): Promise<string | undefined> {
  if (!before) return undefined;

  const after = await listProjectObjects(before.userId, before.projectSlug);
  const notices: string[] = [];

  for (const [relativePath, generation] of after) {
    if (before.versions.get(relativePath) === generation) continue;
    const extension = path.extname(relativePath).toLowerCase();
    if (!SWEEPABLE_EXTENSIONS.has(extension)) continue;

    let buffer: Buffer;
    try {
      const { content } = await readWorkspaceFile(before.userId, before.projectSlug, relativePath);
      if (content.byteLength > MAX_SWEEP_FILE_BYTES) continue;
      buffer = content;
    } catch {
      continue;
    }

    // Never rewrite content that is not clean UTF-8: the sweep must not be
    // able to corrupt a binary saved with a text-like extension.
    const text = buffer.toString("utf8");
    if (Buffer.from(text, "utf8").equals(buffer) === false) continue;
    if (text.includes("\0")) continue;

    let cleaned = text;
    const parts: string[] = [];

    const stripped = stripCopiedDisplayLinePrefixes(cleaned);
    if (stripped) {
      cleaned = stripped.cleaned;
      parts.push(stripped.description);
    }

    if (MARKDOWN_EXTENSIONS.has(extension)) {
      const repaired = ensureBlankLineAfterTables(cleaned);
      if (repaired.insertedCount > 0) {
        cleaned = repaired.repaired;
        parts.push(
          `inserted ${repaired.insertedCount} blank line(s) after tables`,
        );
      }
    }

    if (MERMAID_EXTENSIONS.has(extension)) {
      const strippedFences = stripStandaloneMermaidFences(cleaned);
      if (strippedFences) {
        cleaned = strippedFences.cleaned;
        parts.push(strippedFences.description);
      }
    }

    if (parts.length === 0) continue;

    try {
      await writeWorkspaceFile(before.userId, before.projectSlug, relativePath, Buffer.from(cleaned, "utf8"));
      notices.push(`${relativePath}: ${parts.join("; ")}`);
    } catch {
      // Transient error; the write_file cleaner remains the primary defense.
    }
  }

  if (notices.length === 0) return undefined;
  return notices.join("\n");
}
