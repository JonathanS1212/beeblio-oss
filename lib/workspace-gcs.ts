import { Storage } from "@google-cloud/storage";
import path from "node:path";

import { integerEnv } from "./env-config";
import { getUserEntitlements } from "./entitlements/user";

/**
 * Object-native workspace file layer (docs/plans/blaxel-sandbox-migration.md §5).
 *
 * Workspaces live as `<userId>/<projectSlug>/...` prefixes in one GCS bucket
 * (`gs://<GCS_BUCKET>`, hierarchical namespace). Both sides of the co-edit
 * loop use this module: the Next.js app (server actions + API routes) and
 * the eve agent runtime (tools, sweep, skills). Disposable Blaxel Jobs copy
 * the active project prefix into their isolated /workspace and sync allowed
 * outputs back after successful execution.
 *
 * Semantics preserved from the former host-filesystem implementation
 * (agent/workspace-files.ts): identity/path validation, WorkspaceFileError
 * statuses/codes, dirs-first listings, recursive listings with truncation,
 * quota-checked writes, move/copy with destination guards. The tmp+rename
 * atomic-write dance is gone — object PUTs are atomic. The ETag is the
 * object generation, which changes on every overwrite from either side.
 */

export type WorkspaceFileEntry = {
  name: string;
  path: string;
  isDir: boolean;
  size: number;
};

export type WorkspaceRootTree = {
  entries: WorkspaceFileEntry[];
  children: Record<string, WorkspaceFileEntry[]>;
};

export class WorkspaceFileError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code: string,
  ) {
    super(message);
    this.name = "WorkspaceFileError";
  }
}

const workspaceComponentPattern = /^[A-Za-z0-9_-]+$/;

export const WORKSPACE_MARKER_FILENAME = ".bee-workspace.json";

function badRequest(message: string): never {
  throw new WorkspaceFileError(message, 400, "invalid_workspace_request");
}

function notFound(): never {
  throw new WorkspaceFileError("Workspace path was not found", 404, "workspace_path_not_found");
}

export function workspaceBucketName(): string {
  const bucket = process.env.GCS_BUCKET?.trim();
  if (!bucket) throw new Error("GCS_BUCKET is not set (see .env.example)");
  return bucket;
}

let storageSingleton: Storage | null = null;

export function workspaceStorage(): Storage {
  storageSingleton ??= new Storage({
    keyFilename: process.env.GCS_SA_KEY_FILE || undefined,
    credentials: process.env.GCS_SA_KEY ? JSON.parse(process.env.GCS_SA_KEY) : undefined,
    projectId: process.env.GCS_PROJECT_ID || undefined,
  });
  return storageSingleton;
}

export function workspaceBucket() {
  return workspaceStorage().bucket(workspaceBucketName());
}

function requireIdentity(userId: string, projectSlug: string): string {
  if (!workspaceComponentPattern.test(userId) || !workspaceComponentPattern.test(projectSlug)) {
    throw new WorkspaceFileError("Invalid workspace identity", 400, "invalid_workspace_identity");
  }
  return `${userId}/${projectSlug}`;
}

/**
 * Maps a workspace-relative path ("" = project root, "docs/paper.md") to an
 * object name inside the project prefix. Accepts the canonical /workspace
 * prefixed form tools prefer ("workspace/..." and "/workspace/..."), while
 * "./workspace/..." addresses a real folder of that name. Rejects absolute
 * paths outside /workspace, traversal, empty segments, and marker files
 * owned by workspace infrastructure.
 */
function requireObjectPath(userId: string, projectSlug: string, workspacePath: string): string {
  const projectPrefix = requireIdentity(userId, projectSlug);
  if (workspacePath.includes("\0")) badRequest("Workspace path contains an invalid null byte");
  let candidate = workspacePath.trim();
  if (candidate.startsWith("./")) {
    candidate = candidate.slice(2);
  } else {
    candidate = candidate.replace(/^\/+/, "").replace(/^workspace\//, "");
  }
  // Folder paths may carry a trailing slash from GCS prefixes; strip it so
  // the split below doesn't produce an empty segment that trips validation.
  candidate = candidate.replace(/\/+$/, "");
  if (candidate === "") badRequest("The workspace root cannot be targeted directly");
  if (candidate.length > 1024) badRequest("Workspace path is too long");
  const segments = candidate.split("/");
  for (const segment of segments) {
    if (segment === "" || segment === "." || segment === "..") {
      badRequest("Invalid workspace path");
    }
  }
  if (segments.includes(WORKSPACE_MARKER_FILENAME)) {
    badRequest("This file is managed by the workspace runtime");
  }
  return `${projectPrefix}/${segments.join("/")}`;
}

function isFolderPlaceholder(objectName: string): boolean {
  return objectName.endsWith("/");
}

function entryFor(objectName: string, projectPrefix: string, size: number): WorkspaceFileEntry {
  const relative = objectName.slice(projectPrefix.length + 1);
  // Folder prefixes end with '/'; strip it so paths are clean and the name
  // is the folder itself, not the empty string after the trailing slash.
  const isDir = isFolderPlaceholder(objectName);
  const cleaned = isDir ? relative.replace(/\/+$/, "") : relative;
  const name = cleaned.split("/").pop() ?? cleaned;
  return { name, path: cleaned, isDir, size };
}

function sortEntries(entries: WorkspaceFileEntry[]): WorkspaceFileEntry[] {
  return entries.sort((left, right) =>
    left.isDir === right.isDir
      ? left.name.localeCompare(right.name)
      : left.isDir
        ? -1
        : 1,
  );
}

function matchesWorkspaceGlob(candidatePath: string, pattern: string): boolean {
  if (path.posix.matchesGlob(candidatePath, pattern)) return true;
  // Eve's sandbox glob uses ripgrep, where a pattern without a slash matches
  // basenames at any depth. Preserve that useful behavior for the GCS-native
  // replacement instead of requiring callers to add **/ themselves.
  return !pattern.includes("/") && path.posix.matchesGlob(
    path.posix.basename(candidatePath),
    pattern,
  );
}

function isGcsNotFound(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    ((error as { code?: number }).code === 404 ||
      /Not Found|does not exist/i.test((error as Error).message ?? ""))
  );
}

function isGcsPreconditionFailed(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    ((error as { code?: number }).code === 412 ||
      /Precondition Failed|conditionNotMet|ifGenerationMatch/i.test(
        (error as Error).message ?? "",
      ))
  );
}

type GcsObject = ReturnType<ReturnType<typeof workspaceBucket>["file"]>;
type GcsPageQuery = { prefix: string; pageToken?: string };
type GcsLevelQuery = GcsPageQuery & {
  delimiter: string;
  includeFoldersAsPrefixes?: boolean;
};

async function getObject(objectName: string): Promise<{ file: GcsObject; metadata: { size: string; generation: string; contentType?: string; updated?: string } }> {
  const file = workspaceBucket().file(objectName);
  try {
    const [metadata] = await file.getMetadata();
    return { file, metadata: metadata as { size: string; generation: string; contentType?: string; updated?: string } };
  } catch (error) {
    if (isGcsNotFound(error)) notFound();
    throw error;
  }
}

/** Lists one directory level: objects directly inside + folder prefixes. */
async function listLevel(prefix: string): Promise<WorkspaceFileEntry[]> {
  const bucket = workspaceBucket();
  const entries: WorkspaceFileEntry[] = [];
  const objects: { name: string; size: string | number }[] = [];
  let query: GcsLevelQuery | undefined = { prefix, delimiter: "/", includeFoldersAsPrefixes: true };
  const folderPrefixes = new Set<string>();
  while (query) {
    const page = await bucket.getFiles({ ...query, autoPaginate: false }) as unknown as [unknown[], GcsLevelQuery | null | undefined, unknown];
    const [files, , response] = page;
    for (const file of files as unknown as { name: string; metadata?: { size?: string } }[]) {
      if (file.name === prefix) continue; // the directory's own placeholder
      objects.push({ name: file.name, size: Number(file.metadata?.size ?? 0) });
    }
    for (const folderPrefix of ((response as { prefixes?: string[] } | null)?.prefixes ?? [])) {
      if (folderPrefix !== prefix) folderPrefixes.add(folderPrefix);
    }
    query = page[1] ?? undefined;
  }
  const projectPrefix = prefix.split("/").slice(0, 2).join("/");
  for (const name of objects) {
    if (isFolderPlaceholder(name.name)) continue; // placeholder folders come from prefixes
    entries.push(entryFor(name.name, projectPrefix, Number(name.size)));
  }
  for (const folderPrefix of folderPrefixes) {
    entries.push(entryFor(folderPrefix, projectPrefix, 0));
  }
  return sortEntries(entries);
}

export async function listWorkspaceFiles(
  userId: string,
  projectSlug: string,
  workspacePath = "",
): Promise<WorkspaceFileEntry[]> {
  const projectPrefix = requireIdentity(userId, projectSlug);
  const dirPrefix = workspacePath.replace(/^\/+/, "").replace(/\/+$/, "");
  // The prefix must always end with '/' so GCS only matches children of this
  // directory, not sibling prefixes that share a name prefix (e.g. "docs" must
  // not match "docs-old/").
  const prefix = dirPrefix ? `${projectPrefix}/${dirPrefix}/` : `${projectPrefix}/`;
  try {
    return await listLevel(prefix);
  } catch (error) {
    if (isGcsNotFound(error)) notFound();
    throw error;
  }
}

/**
 * Finds workspace files by glob directly through the GCS object API.
 *
 * `workspacePath` scopes the object prefix and `pattern` is matched against
 * paths relative to that directory, mirroring Eve's sandbox glob semantics.
 * One extra match is read so callers can report truncation accurately without
 * listing the entire workspace when a broad pattern already filled the limit.
 */
export async function globWorkspaceFiles(
  userId: string,
  projectSlug: string,
  workspacePath: string,
  pattern: string,
  limit: number,
): Promise<{ entries: WorkspaceFileEntry[]; truncated: boolean }> {
  const projectPrefix = requireIdentity(userId, projectSlug);
  const directory = workspacePath.replace(/^\/+/, "").replace(/\/+$/, "");
  const prefix = directory
    ? `${projectPrefix}/${directory}/`
    : `${projectPrefix}/`;
  const maxMatches = Math.max(1, limit);
  const entries: WorkspaceFileEntry[] = [];
  let query: GcsPageQuery | undefined = { prefix };

  while (query && entries.length <= maxMatches) {
    const page = await workspaceBucket().getFiles({
      ...query,
      autoPaginate: false,
    }) as unknown as [
      { name: string; metadata?: { size?: string } }[],
      GcsPageQuery | null | undefined,
    ];

    for (const object of page[0]) {
      if (isFolderPlaceholder(object.name)) continue;
      const projectRelativePath = object.name.slice(projectPrefix.length + 1);
      if (
        projectRelativePath
          .split("/")
          .includes(WORKSPACE_MARKER_FILENAME)
      ) continue;
      const searchRelativePath = directory
        ? projectRelativePath.slice(directory.length + 1)
        : projectRelativePath;
      if (!matchesWorkspaceGlob(searchRelativePath, pattern)) continue;

      entries.push({
        name: path.posix.basename(projectRelativePath),
        path: projectRelativePath,
        isDir: false,
        size: Number(object.metadata?.size ?? 0),
      });
      if (entries.length > maxMatches) break;
    }
    query = page[1] ?? undefined;
  }

  const truncated = entries.length > maxMatches;
  if (truncated) entries.length = maxMatches;
  entries.sort((left, right) => left.path.localeCompare(right.path));
  return { entries, truncated };
}

export async function listWorkspaceRootTree(
  userId: string,
  projectSlug: string,
): Promise<WorkspaceRootTree> {
  const entries = await listWorkspaceFiles(userId, projectSlug);
  const folderChildren = await Promise.all(
    entries
      .filter((entry) => entry.isDir)
      .map(async (folder) => [
        folder.path,
        await listWorkspaceFiles(userId, projectSlug, folder.path),
      ] as const),
  );
  return { entries, children: Object.fromEntries(folderChildren) };
}

/**
 * Whole-tree listing in one paginated scan. Folder entries are synthesized
 * from object path segments so folders that only exist implicitly (files
 * written without placeholder objects) still appear. Sorted by path.
 */
export async function listWorkspaceFilesRecursive(
  userId: string,
  projectSlug: string,
  maxEntries: number,
): Promise<{ entries: WorkspaceFileEntry[]; truncated: boolean }> {
  const projectPrefix = requireIdentity(userId, projectSlug);
  const bucket = workspaceBucket();
  const files: WorkspaceFileEntry[] = [];
  const folders = new Map<string, WorkspaceFileEntry>();
  let truncated = false;
  let query: GcsPageQuery | undefined = { prefix: `${projectPrefix}/` };
  while (query && !truncated) {
    const page = await bucket.getFiles({ ...query, autoPaginate: false }) as unknown as [unknown[], GcsPageQuery | null | undefined];
    const objects = page[0];
    for (const object of objects as unknown as { name: string; metadata?: { size?: string } }[]) {
      if (object.name === `${projectPrefix}/`) continue;
      const relative = object.name.slice(projectPrefix.length + 1);
      const segments = relative.split("/");
      for (let depth = 1; depth < segments.length; depth++) {
        const folderPath = segments.slice(0, depth).join("/");
        if (!folders.has(folderPath)) {
          folders.set(folderPath, {
            name: segments[depth - 1],
            path: folderPath,
            isDir: true,
            size: 0,
          });
        }
      }
      if (isFolderPlaceholder(object.name)) continue;
      files.push({
        name: segments[segments.length - 1],
        path: relative,
        isDir: false,
        size: Number(object.metadata?.size ?? 0),
      });
    }
    query = page[1] ?? undefined;
  }
  const entries = [...folders.values(), ...files];
  if (entries.length > maxEntries) {
    entries.length = maxEntries;
    truncated = true;
  }
  entries.sort((left, right) => left.path.localeCompare(right.path));
  return { entries, truncated };
}

// Strong validator: the object generation changes on every overwrite from
// any writer (app PUT, sandbox write through gcsfuse, out-of-band upload).
export function workspaceFileEtag(generation: string | number, size: string | number): string {
  return `"g${Number(generation).toString(16)}-${Number(size).toString(16)}"`;
}

export async function readWorkspaceFile(
  userId: string,
  projectSlug: string,
  workspacePath: string,
): Promise<{ content: Buffer; etag: string; generation: string; updatedAt: string }> {
  const objectName = requireObjectPath(userId, projectSlug, workspacePath);
  const { file, metadata } = await getObject(objectName);
  const [content] = await file.download();
  return {
    content: Buffer.from(content),
    etag: workspaceFileEtag(metadata.generation, metadata.size),
    generation: metadata.generation,
    updatedAt: metadata.updated ?? new Date(0).toISOString(),
  };
}

/** Returns lightweight metadata for an exact workspace file without downloading it. */
export async function statWorkspaceFile(
  userId: string,
  projectSlug: string,
  workspacePath: string,
): Promise<WorkspaceFileEntry & { etag: string }> {
  const objectName = requireObjectPath(userId, projectSlug, workspacePath);
  const { metadata } = await getObject(objectName);
  return {
    ...entryFor(objectName, requireIdentity(userId, projectSlug), Number(metadata.size)),
    etag: workspaceFileEtag(metadata.generation, metadata.size),
  };
}

export async function writeWorkspaceFile(
  userId: string,
  projectSlug: string,
  workspacePath: string,
  content: Uint8Array,
  options?: {
    contentType?: string;
    /**
     * GCS compare-and-swap guard. Use 0 when creating a new object and the
     * generation returned by readWorkspaceFile when replacing one.
     */
    ifGenerationMatch?: string | number;
  },
): Promise<{ existed: boolean }> {
  const objectName = requireObjectPath(userId, projectSlug, workspacePath);
  let replacedBytes = 0;
  let existed = false;
  try {
    const { metadata } = await getObject(objectName);
    replacedBytes = Number(metadata.size);
    existed = true;
  } catch (error) {
    if (!(error instanceof WorkspaceFileError) || error.status !== 404) throw error;
  }
  await assertStorageQuota(userId, content.byteLength, replacedBytes);
  const file = workspaceBucket().file(objectName);
  try {
    await file.save(Buffer.from(content), {
      contentType: options?.contentType,
      resumable: content.byteLength > 10 * 1024 * 1024,
      preconditionOpts:
        options?.ifGenerationMatch === undefined
          ? undefined
          : { ifGenerationMatch: options.ifGenerationMatch },
    });
  } catch (error) {
    if (!isGcsPreconditionFailed(error)) throw error;

    if (
      options?.ifGenerationMatch !== 0 &&
      options?.ifGenerationMatch !== "0"
    ) {
      // Eve may replay a replacement whose first request reached GCS but whose
      // result was not durably recorded. Treat identical current content as
      // settlement of that retry. Creation stays strict: ifGenerationMatch=0
      // must fail whenever any object already occupies the path.
        try {
          const [current] = await file.download();
          if (Buffer.from(current).equals(Buffer.from(content))) {
            invalidateUserStorageCache(userId);
            return { existed: true };
          }
        } catch {
          // Preserve the compare-and-swap failure below when the object vanished
          // or could not be re-read.
        }
    }

    throw new WorkspaceFileError(
      "The workspace file changed after it was read. Read it again before writing.",
      409,
      "workspace_generation_mismatch",
    );
  }
  adjustUserStorageCache(userId, content.byteLength - replacedBytes);
  return { existed };
}

export async function createWorkspaceDirectory(
  userId: string,
  projectSlug: string,
  workspacePath: string,
): Promise<void> {
  const objectName = `${requireObjectPath(userId, projectSlug, workspacePath)}/`;
  await workspaceBucket().file(objectName).save(Buffer.alloc(0), {
    contentType: "application/x-directory",
  });
}

async function listObjectNamesUnder(prefix: string): Promise<string[]> {
  const bucket = workspaceBucket();
  const names: string[] = [];
  let query: GcsPageQuery | undefined = { prefix };
  while (query) {
    const page = await bucket.getFiles({ ...query, autoPaginate: false }) as unknown as [unknown[], GcsPageQuery | null | undefined];
    const objects = page[0];
    for (const object of objects as unknown as { name: string }[]) names.push(object.name);
    query = page[1] ?? undefined;
  }
  return names;
}

export async function deleteWorkspacePath(
  userId: string,
  projectSlug: string,
  workspacePath: string,
): Promise<void> {
  const objectName = requireObjectPath(userId, projectSlug, workspacePath);
  try {
    const { file } = await getObject(objectName);
    await file.delete();
    return;
  } catch (error) {
    if (!(error instanceof WorkspaceFileError)) throw error;
  }
  // Not an object: delete as a folder prefix.
  const names = await listObjectNamesUnder(`${objectName}/`);
  if (names.length === 0) notFound();
  await workspaceBucket().deleteFiles({ prefix: `${objectName}/`, force: true });
  invalidateUserStorageCache(userId);
}

function assertDestinationOutsideSource(sourcePath: string, destinationPath: string): void {
  if (destinationPath === sourcePath || destinationPath.startsWith(`${sourcePath}/`)) {
    badRequest("A directory cannot be copied or moved into itself");
  }
}

async function requireDestinationAvailable(objectName: string): Promise<void> {
  const existing = await listObjectNamesUnder(objectName);
  const collision = existing.find((name) => name === objectName || name === `${objectName}/` || name.startsWith(`${objectName}/`));
  if (collision !== undefined) {
    throw new WorkspaceFileError(
      "The destination already exists",
      409,
      "workspace_destination_exists",
    );
  }
}

export async function moveWorkspacePath(
  userId: string,
  projectSlug: string,
  sourceWorkspacePath: string,
  destinationWorkspacePath: string,
): Promise<void> {
  const sourceName = requireObjectPath(userId, projectSlug, sourceWorkspacePath);
  const destinationName = requireObjectPath(userId, projectSlug, destinationWorkspacePath);
  assertDestinationOutsideSource(sourceWorkspacePath, destinationWorkspacePath);
  await requireDestinationAvailable(destinationName);

  try {
    const { file } = await getObject(sourceName);
    // Single object: server-side rename (atomic on hierarchical-namespace
    // buckets, copy+delete otherwise).
    await file.rename(destinationName);
    return;
  } catch (error) {
    if (!(error instanceof WorkspaceFileError)) throw error;
  }

  const memberNames = await listObjectNamesUnder(`${sourceName}/`);
  if (memberNames.length === 0) notFound();
  const bucket = workspaceBucket();
  for (const memberName of memberNames) {
    await bucket.file(memberName).rename(memberName.replace(`${sourceName}/`, `${destinationName}/`));
  }
  // Renames keep the stored byte total; no usage cache adjustment needed.
}

export async function copyWorkspacePath(
  userId: string,
  projectSlug: string,
  sourceWorkspacePath: string,
  destinationWorkspacePath: string,
): Promise<void> {
  const sourceName = requireObjectPath(userId, projectSlug, sourceWorkspacePath);
  const destinationName = requireObjectPath(userId, projectSlug, destinationWorkspacePath);
  assertDestinationOutsideSource(sourceWorkspacePath, destinationWorkspacePath);
  await requireDestinationAvailable(destinationName);

  const sizeObjects = await listObjectNamesUnder(sourceName);
  let copiedBytes = 0;
  const countSize = async (name: string) => {
    const { metadata } = await getObject(name);
    copiedBytes += Number(metadata.size);
  };

  try {
    const { file, metadata } = await getObject(sourceName);
    copiedBytes = Number(metadata.size);
    await assertStorageQuota(userId, copiedBytes);
    await file.copy(destinationName);
    adjustUserStorageCache(userId, copiedBytes);
    return;
  } catch (error) {
    if (!(error instanceof WorkspaceFileError)) throw error;
  }

  const memberNames = await listObjectNamesUnder(`${sourceName}/`);
  if (memberNames.length === 0) notFound();
  for (const memberName of memberNames) {
    await countSize(memberName);
  }
  await assertStorageQuota(userId, copiedBytes);
  const bucket = workspaceBucket();
  for (const memberName of memberNames) {
    await bucket.file(memberName).copy(memberName.replace(`${sourceName}/`, `${destinationName}/`));
  }
  adjustUserStorageCache(userId, copiedBytes);
}

/**
 * Reads a workspace file as a fetch `Response`, preserving the conditional
 * and range semantics the browser-facing routes relay: 304 on matching
 * If-None-Match, 206/416 for media Range requests.
 */
export async function readWorkspaceFileAsResponse(
  userId: string,
  projectSlug: string,
  workspacePath: string,
  options?: { ifNoneMatch?: string; range?: string },
): Promise<Response> {
  const objectName = requireObjectPath(userId, projectSlug, workspacePath);
  const { file, metadata } = await getObject(objectName);
  const etag = workspaceFileEtag(metadata.generation, metadata.size);
  const size = Number(metadata.size);
  const headers = new Headers({
    etag,
    "content-type": metadata.contentType ?? "application/octet-stream",
    "accept-ranges": "bytes",
  });

  if (options?.ifNoneMatch && options.ifNoneMatch === etag) {
    return new Response(null, { status: 304, headers });
  }

  let rangeStart: number | undefined;
  let rangeEnd: number | undefined;
  const rangeMatch = options?.range?.match(/^bytes=(\d*)-(\d*)$/);
  if (rangeMatch) {
    const [, rawStart, rawEnd] = rangeMatch;
    if (rawStart === "" && rawEnd === "") {
      // malformed; ignore
    } else if (rawStart === "") {
      const suffixLength = Number(rawEnd);
      rangeStart = Math.max(0, size - suffixLength);
      rangeEnd = size - 1;
    } else {
      rangeStart = Number(rawStart);
      rangeEnd = rawEnd === "" ? size - 1 : Math.min(Number(rawEnd), size - 1);
    }
    if (rangeStart !== undefined && rangeEnd !== undefined && (rangeStart >= size || rangeEnd < rangeStart)) {
      headers.set("content-range", `bytes */${size}`);
      return new Response(null, { status: 416, headers });
    }
  }

  if (rangeStart !== undefined && rangeEnd !== undefined) {
    const [buffer] = await file.download({ start: rangeStart, end: rangeEnd });
    headers.set("content-range", `bytes ${rangeStart}-${rangeEnd}/${size}`);
    headers.set("content-length", String(buffer.byteLength));
    return new Response(new Uint8Array(buffer), { status: 206, headers });
  }

  const [buffer] = await file.download();
  headers.set("content-length", String(buffer.byteLength));
  return new Response(new Uint8Array(buffer), { status: 200, headers });
}

/**
 * Issues a presigned PUT so the browser uploads directly to GCS, bypassing
 * serverless request-body caps entirely. Quota is pre-checked when the
 * client reports a size; the write itself is enforced on next server-side
 * usage reconciliation.
 */
export async function createWorkspaceUploadTicket(
  userId: string,
  projectSlug: string,
  workspacePath: string,
  options?: { contentType?: string; sizeBytes?: number; ttlMs?: number },
): Promise<{ uploadUrl: string; fields: Record<string, string>; objectPath: string; expiresAt: number }> {
  const objectName = requireObjectPath(userId, projectSlug, workspacePath);
  let replacedBytes = 0;
  try {
    const { metadata } = await getObject(objectName);
    replacedBytes = Number(metadata.size);
  } catch {
    replacedBytes = 0;
  }
  if (options?.sizeBytes !== undefined) {
    await assertStorageQuota(userId, options.sizeBytes, replacedBytes);
  }
  const ttlMs = options?.ttlMs ?? 10 * 60_000;
  const expiresAt = Date.now() + ttlMs;
  const contentType = options?.contentType ?? "application/octet-stream";
  // GCS rejects a signed POST policy whose content-length range has a zero
  // upper bound. Keep zero-byte files constrained to the smallest valid
  // range; all non-empty uploads remain pinned to their exact declared size.
  const sizeCondition = options?.sizeBytes === undefined
    ? undefined
    : [
        "content-length-range",
        options.sizeBytes,
        Math.max(options.sizeBytes, 1),
      ] as ["content-length-range", number, number];
  const [policy] = await workspaceBucket()
    .file(objectName)
    .generateSignedPostPolicyV4({
      expires: expiresAt,
      fields: { "Content-Type": contentType },
      conditions: sizeCondition ? [sizeCondition] : undefined,
    });
  return {
    uploadUrl: policy.url,
    fields: policy.fields,
    objectPath: workspacePath.replace(/^\/+/, ""),
    expiresAt,
  };
}

/** Time-limited direct-download URL for a workspace file. */
export async function createWorkspaceReadTicket(
  userId: string,
  projectSlug: string,
  workspacePath: string,
  options?: { ttlMs?: number; disposition?: "inline" | "attachment"; filename?: string },
): Promise<{ url: string; expiresAt: number }> {
  const objectName = requireObjectPath(userId, projectSlug, workspacePath);
  await getObject(objectName);
  const ttlMs = options?.ttlMs ?? 5 * 60_000;
  const safeFilename = (options?.filename ?? path.posix.basename(workspacePath)).replace(/["\\\r\n]/g, "_");
  const [url] = await workspaceBucket()
    .file(objectName)
    .getSignedUrl({
      version: "v4",
      action: "read",
      expires: Date.now() + ttlMs,
      responseDisposition: `${options?.disposition ?? "inline"}; filename="${safeFilename}"`,
    });
  return { url, expiresAt: Date.now() + ttlMs };
}

/** Metadata for editor freshness checks without generating a download ticket. */
export async function getWorkspaceFileFingerprint(
  userId: string,
  projectSlug: string,
  workspacePath: string,
): Promise<{ etag: string; size: string; updated?: string }> {
  const objectName = requireObjectPath(userId, projectSlug, workspacePath);
  const { metadata } = await getObject(objectName);
  return {
    etag: `"${metadata.generation}"`,
    size: metadata.size,
    updated: metadata.updated,
  };
}

// --- Quota -----------------------------------------------------------------
// Usage is the summed object size under gs://<bucket>/<userId>/ (all projects
// plus skills). Scans are cached briefly in-process; every server-side write
// path re-checks, and sandbox-origin writes are backstopped by the turn gate.

const CACHE_TTL_SECONDS = integerEnv("STORAGE_USAGE_CACHE_TTL_SECONDS", 30, 0);
const usageCache = new Map<string, { usedBytes: number; expiresAt: number }>();
const QUOTA_CACHE_TTL_SECONDS = integerEnv("STORAGE_QUOTA_CACHE_TTL_SECONDS", 15, 0);
const quotaCache = new Map<string, { quotaBytes: number | null; expiresAt: number }>();

export type StorageUsage = {
  usedBytes: number;
  /** null = unlimited (admins). */
  quotaBytes: number | null;
};

function validateUserId(userId: string): void {
  if (!workspaceComponentPattern.test(userId)) {
    throw new WorkspaceFileError("Invalid workspace user id", 400, "invalid_workspace_identity");
  }
}

export function invalidateUserStorageCache(userId: string): void {
  usageCache.delete(userId);
}

/**
 * Adjusts the cached usage by a write's net delta instead of dropping it, so
 * consecutive writes in one flow don't each re-list every stored object.
 */
function adjustUserStorageCache(userId: string, deltaBytes: number): void {
  const cached = usageCache.get(userId);
  if (!cached || cached.expiresAt <= Date.now()) return;
  usageCache.set(userId, {
    usedBytes: Math.max(0, cached.usedBytes + deltaBytes),
    expiresAt: cached.expiresAt,
  });
}

export async function getWorkspaceStorageUsage(userId: string): Promise<number> {
  validateUserId(userId);
  const cached = usageCache.get(userId);
  if (cached && cached.expiresAt > Date.now()) return cached.usedBytes;
  const names = await listObjectNamesUnderWithSize(`${userId}/`);
  let total = 0;
  for (const { size } of names) total += size;
  usageCache.set(userId, { usedBytes: total, expiresAt: Date.now() + CACHE_TTL_SECONDS * 1000 });
  return total;
}

async function listObjectNamesUnderWithSize(prefix: string): Promise<{ name: string; size: number }[]> {
  const bucket = workspaceBucket();
  const results: { name: string; size: number }[] = [];
  let query: GcsPageQuery | undefined = { prefix };
  while (query) {
    const page = await bucket.getFiles({ ...query, autoPaginate: false }) as unknown as [unknown[], GcsPageQuery | null | undefined];
    const objects = page[0];
    for (const object of objects as unknown as { name: string; metadata?: { size?: string } }[]) {
      results.push({ name: object.name, size: Number(object.metadata?.size ?? 0) });
    }
    query = page[1] ?? undefined;
  }
  return results;
}

export async function getUserStorageUsage(userId: string): Promise<StorageUsage> {
  const usedBytes = await getWorkspaceStorageUsage(userId);
  const quotaBytes = await quotaBytesForUser(userId);
  return { usedBytes, quotaBytes };
}

function formatBytes(bytes: number): string {
  if (bytes >= 1024 ** 3) return `${(bytes / 1024 ** 3).toFixed(1)} GB`;
  if (bytes >= 1024 ** 2) return `${(bytes / 1024 ** 2).toFixed(1)} MB`;
  return `${Math.max(0, Math.round(bytes / 1024))} KB`;
}

async function quotaBytesForUser(userId: string): Promise<number | null> {
  // Plans rarely change mid-session; a short memo avoids three entitlement
  // queries on every workspace write. Failures are not cached.
  const cached = quotaCache.get(userId);
  if (cached && cached.expiresAt > Date.now()) return cached.quotaBytes;
  try {
    const entitlements = await getUserEntitlements(userId);
    const quotaBytes = entitlements.storageQuotaBytes ?? null;
    quotaCache.set(userId, { quotaBytes, expiresAt: Date.now() + QUOTA_CACHE_TTL_SECONDS * 1000 });
    return quotaBytes;
  } catch {
    return null;
  }
}

export async function assertStorageQuota(
  userId: string,
  additionalBytes: number,
  replacedBytes = 0,
): Promise<void> {
  const quotaBytes = await quotaBytesForUser(userId);
  if (quotaBytes === null) return;
  const usedBytes = await getWorkspaceStorageUsage(userId);
  const projected = usedBytes + Math.max(0, additionalBytes - replacedBytes);
  if (projected <= quotaBytes) return;
  throw new WorkspaceFileError(
    `Your workspace is full — ${formatBytes(usedBytes)} of ${formatBytes(quotaBytes)} used. Delete files or upgrade your plan to add more.`,
    413,
    "storage_quota_exceeded",
  );
}

// Compatibility names for the existing app call sites. They now execute
// directly against GCS; the "Agent" prefix only remains until the broader
// Phase 2 naming cleanup.
export { WorkspaceFileError as AgentWorkspaceError };
export const listAgentWorkspaceFiles = listWorkspaceFiles;
export const getAgentWorkspaceRootTree = listWorkspaceRootTree;
export async function listAgentWorkspaceFilesRecursive(
  userId: string,
  projectSlug: string,
  maxEntries: number,
): Promise<WorkspaceFileEntry[]> {
  return (await listWorkspaceFilesRecursive(userId, projectSlug, maxEntries)).entries;
}
export const readAgentWorkspaceFile = readWorkspaceFileAsResponse;
/**
 * Reads a workspace text file, returning null when it does not exist — a
 * 404 answers existence without a preceding directory listing.
 */
export async function readAgentWorkspaceTextOrNull(
  userId: string,
  projectSlug: string,
  workspacePath: string,
): Promise<string | null> {
  try {
    const response = await readWorkspaceFileAsResponse(userId, projectSlug, workspacePath);
    return await response.text();
  } catch (error) {
    if (error instanceof WorkspaceFileError && error.status === 404) return null;
    throw error;
  }
}
export async function writeAgentWorkspaceFile(
  userId: string,
  projectSlug: string,
  workspacePath: string,
  content: BodyInit,
): Promise<void> {
  const bytes = new Uint8Array(await new Response(content).arrayBuffer());
  await writeWorkspaceFile(userId, projectSlug, workspacePath, bytes);
}
export const deleteAgentWorkspacePath = deleteWorkspacePath;
export const createAgentWorkspaceDirectory = createWorkspaceDirectory;
export const moveAgentWorkspacePath = moveWorkspacePath;
export const copyAgentWorkspacePath = copyWorkspacePath;
export async function getAgentStorageUsage(userId: string): Promise<StorageUsage | null> {
  try {
    return await getUserStorageUsage(userId);
  } catch {
    return null;
  }
}
