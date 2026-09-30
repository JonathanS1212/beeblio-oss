import {
  PROJECT_BIBLIOGRAPHY_NAME,
  PROJECT_BIBLIOGRAPHY_PATH,
  REFERENCES_DIRECTORY,
} from "@/lib/project-bibliography";
import { RESEARCH_WORKSPACE_DIRECTORIES } from "@/lib/research-workspace";
import {
  createAgentWorkspaceDirectory,
  listAgentWorkspaceFiles,
  writeAgentWorkspaceFile,
} from "@/lib/workspace-files";

export const RESEARCH_WORKSPACE_TEMPLATE_VERSION = 6;

// Starter working document at the workspace root. Ordinary user file, not protected.
export const RESEARCH_DRAFT_NAME = "research-draft.md";
export const RESEARCH_DRAFT_PATH = RESEARCH_DRAFT_NAME;

export { RESEARCH_WORKSPACE_DIRECTORIES } from "@/lib/research-workspace";

/**
 * Adds the standard research structure without moving or replacing user files.
 * Safe to call again when a project-creation request is retried.
 */
export async function provisionResearchWorkspace(input: {
  userId: string;
  projectSlug: string;
}): Promise<void> {
  const { userId, projectSlug } = input;

  await Promise.all(
    RESEARCH_WORKSPACE_DIRECTORIES.map((directory) =>
      createAgentWorkspaceDirectory(userId, projectSlug, directory),
    ),
  );

  await Promise.all([
    ensureBlankWorkspaceFile(
      userId,
      projectSlug,
      REFERENCES_DIRECTORY,
      PROJECT_BIBLIOGRAPHY_NAME,
      PROJECT_BIBLIOGRAPHY_PATH,
    ),
    ensureBlankWorkspaceFile(
      userId,
      projectSlug,
      "",
      RESEARCH_DRAFT_NAME,
      RESEARCH_DRAFT_PATH,
    ),
  ]);
}

async function ensureBlankWorkspaceFile(
  userId: string,
  projectSlug: string,
  directory: string,
  fileName: string,
  filePath: string,
) {
  const files = await listAgentWorkspaceFiles(userId, projectSlug, directory);
  if (files.some((file) => file.name === fileName && !file.isDir)) {
    return;
  }

  await writeAgentWorkspaceFile(userId, projectSlug, filePath, "");
}
