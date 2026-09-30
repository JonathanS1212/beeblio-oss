import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";

import { and, eq } from "drizzle-orm";
import JSZip from "jszip";

import { db } from "@/db";
import { agentSessions, projects } from "@/db/schema";
import {
  DEMO_MAIN_DOCUMENT_PATH,
  DEMO_PROJECT_DESCRIPTION,
  DEMO_PROJECT_NAME,
  DEMO_PROJECT_SLUG,
  DEMO_PROJECT_TEMPLATE_KEY,
  DEMO_PROJECT_TEMPLATE_VERSION,
  DEMO_SUGGESTED_PROMPTS,
} from "@/lib/demo-project-config";
import { RESEARCH_WORKSPACE_DIRECTORIES } from "@/lib/research-workspace";
import { writeAgentWorkspaceFile } from "@/lib/workspace-gcs";
import { integerEnv } from "@/lib/env-config";

const MAX_ARCHIVE_BYTES = integerEnv("DEMO_PROJECT_MAX_ARCHIVE_BYTES", 8 * 1024 * 1024, 1024);
const PUBLIC_TEMPLATE_URL =
  "https://storage.googleapis.com/beeblio-demo-templates-154673643735/demo-projects/everyday-habits-and-well-being/v4/workspace.zip";

type DemoManifest = {
  schemaVersion: number;
  templateKey: string;
  version: string;
  mainDocument: string;
  suggestedPrompts: Array<{ label: string; prompt: string }>;
  directories: string[];
  files: Array<{ path: string; bytes: number; sha256: string }>;
};

export type EnsuredDemoProject = {
  projectId: string;
  sessionId: string | null;
  created: boolean;
} | null;

function localTemplatePath() {
  return path.resolve(
    /* turbopackIgnore: true */
    process.env.DEMO_PROJECT_TEMPLATE_PATH?.trim() ||
      path.join(
        process.cwd(),
        ".demo-project",
        `${DEMO_PROJECT_TEMPLATE_KEY}-${DEMO_PROJECT_TEMPLATE_VERSION}.zip`,
      ),
  );
}

async function loadTemplateArchive() {
  if (process.env.NODE_ENV !== "production" || process.env.DEMO_PROJECT_TEMPLATE_PATH) {
    try {
      const local = await readFile(/* turbopackIgnore: true */ localTemplatePath());
      if (local.byteLength > MAX_ARCHIVE_BYTES) throw new Error("Demo template archive is too large");
      return local;
    } catch (error) {
      if (process.env.DEMO_PROJECT_TEMPLATE_PATH) throw error;
    }
  }

  const response = await fetch(
    process.env.DEMO_PROJECT_TEMPLATE_URL?.trim() || PUBLIC_TEMPLATE_URL,
    { cache: "force-cache" },
  );
  if (!response.ok) {
    throw new Error(`Unable to download demo template (${response.status})`);
  }
  const contentLength = Number(response.headers.get("content-length") || 0);
  if (contentLength > MAX_ARCHIVE_BYTES) throw new Error("Demo template archive is too large");
  const archive = Buffer.from(await response.arrayBuffer());
  if (archive.byteLength > MAX_ARCHIVE_BYTES) throw new Error("Demo template archive is too large");
  return archive;
}

function isSafeWorkspacePath(filePath: string) {
  const normalized = path.posix.normalize(filePath);
  if (normalized !== filePath || normalized.startsWith("../") || path.posix.isAbsolute(normalized)) {
    return false;
  }
  return RESEARCH_WORKSPACE_DIRECTORIES.some((directory) =>
    normalized.startsWith(`${directory}/`),
  );
}

function validateManifest(value: unknown): asserts value is DemoManifest {
  if (!value || typeof value !== "object") throw new Error("Demo template manifest is missing");
  const manifest = value as Partial<DemoManifest>;
  if (
    manifest.schemaVersion !== 1 ||
    manifest.templateKey !== DEMO_PROJECT_TEMPLATE_KEY ||
    manifest.version !== DEMO_PROJECT_TEMPLATE_VERSION ||
    manifest.mainDocument !== DEMO_MAIN_DOCUMENT_PATH ||
    !Array.isArray(manifest.files) ||
    !Array.isArray(manifest.directories) ||
    !Array.isArray(manifest.suggestedPrompts)
  ) {
    throw new Error("Demo template manifest is invalid or incompatible");
  }
  if (
    manifest.directories.join("\n") !== RESEARCH_WORKSPACE_DIRECTORIES.join("\n") ||
    JSON.stringify(manifest.suggestedPrompts) !== JSON.stringify(DEMO_SUGGESTED_PROMPTS)
  ) {
    throw new Error("Demo template metadata does not match this application version");
  }
  for (const file of manifest.files) {
    if (
      !file ||
      typeof file.path !== "string" ||
      !isSafeWorkspacePath(file.path) ||
      !Number.isSafeInteger(file.bytes) ||
      file.bytes < 0 ||
      !/^[a-f0-9]{64}$/.test(file.sha256)
    ) {
      throw new Error("Demo template contains an invalid file entry");
    }
  }
  if (!manifest.files.some((file) => file.path === DEMO_MAIN_DOCUMENT_PATH)) {
    throw new Error("Demo template does not contain its main document");
  }
}

async function provisionDemoWorkspace(userId: string) {
  const archive = await loadTemplateArchive();
  const zip = await JSZip.loadAsync(archive);
  const manifestEntry = zip.file("manifest.json");
  if (!manifestEntry) throw new Error("Demo template manifest is missing");
  const manifest = JSON.parse(await manifestEntry.async("string")) as unknown;
  validateManifest(manifest);

  await Promise.all(
    manifest.files.map(async (file) => {
      const entry = zip.file(`workspace/${file.path}`);
      if (!entry) throw new Error(`Demo template is missing ${file.path}`);
      const bytes = await entry.async("uint8array");
      const digest = createHash("sha256").update(bytes).digest("hex");
      if (bytes.byteLength !== file.bytes || digest !== file.sha256) {
        throw new Error(`Demo template integrity check failed for ${file.path}`);
      }
      const body = new Uint8Array(bytes.byteLength);
      body.set(bytes);
      await writeAgentWorkspaceFile(userId, DEMO_PROJECT_SLUG, file.path, body.buffer);
    }),
  );
}

async function findDemoProject(userId: string) {
  return db.query.projects.findFirst({
    where: and(eq(projects.userId, userId), eq(projects.slug, DEMO_PROJECT_SLUG)),
  });
}

async function ensureDemoSession(projectId: string) {
  const existing = await db.query.agentSessions.findFirst({
    where: eq(agentSessions.id, projectId),
  });
  if (existing) {
    return existing.status === "active" && !existing.deletedAt ? existing.id : null;
  }
  await db
    .insert(agentSessions)
    .values({
      id: projectId,
      projectId,
      title: "Explore the demo project",
    })
    .onConflictDoNothing({ target: agentSessions.id });
  return projectId;
}

/**
 * Idempotently gives a user the onboarding project. A soft-deleted demo stays
 * deleted, respecting the user's choice. The Eve session remains lazy until
 * the first suggested prompt is submitted.
 */
export async function ensureDemoProject(userId: string): Promise<EnsuredDemoProject> {
  const existing = await findDemoProject(userId);
  if (existing?.deletedAt) return null;
  if (existing) {
    return {
      projectId: existing.id,
      sessionId: await ensureDemoSession(existing.id),
      created: false,
    };
  }

  // The workspace is scoped by user and deterministic slug. Retried or
  // concurrent writes replace the same immutable bytes safely.
  await provisionDemoWorkspace(userId);
  const inserted = await db
    .insert(projects)
    .values({
      userId,
      slug: DEMO_PROJECT_SLUG,
      name: DEMO_PROJECT_NAME,
      description: DEMO_PROJECT_DESCRIPTION,
    })
    .onConflictDoNothing({ target: [projects.userId, projects.slug] })
    .returning();
  const project = inserted[0] ?? await findDemoProject(userId);
  if (!project || project.deletedAt) return null;
  return {
    projectId: project.id,
    sessionId: await ensureDemoSession(project.id),
    created: inserted.length > 0,
  };
}
