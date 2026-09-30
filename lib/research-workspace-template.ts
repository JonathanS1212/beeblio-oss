import { promises as fs } from "node:fs";
import path from "node:path";

import { createSeedMatrix, DEFAULT_MATRIX_PATH, serializeMatrix } from "@/lib/literature-matrix";
import { PROJECT_BIBLIOGRAPHY_PATH } from "@/lib/project-bibliography";
import { RESEARCH_WORKSPACE_DIRECTORIES } from "@/lib/research-workspace";

export const RESEARCH_WORKSPACE_TEMPLATE_VERSION = 7;
export { RESEARCH_WORKSPACE_DIRECTORIES } from "@/lib/research-workspace";

const canonicalFiles = [
  { relativePath: PROJECT_BIBLIOGRAPHY_PATH, content: "" },
  { relativePath: DEFAULT_MATRIX_PATH, content: serializeMatrix(createSeedMatrix()) },
] as const;

async function existingEntry(absolutePath: string) {
  try {
    return await fs.lstat(absolutePath);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  }
}

/** Add the canonical research structure to an existing local folder. Never replace user content. */
export async function provisionResearchWorkspace(folderPath: string): Promise<void> {
  // Check all name conflicts before creating anything, so an incompatible
  // existing entry does not leave a half-created template behind.
  for (const directory of RESEARCH_WORKSPACE_DIRECTORIES) {
    const entry = await existingEntry(path.join(folderPath, directory));
    if (entry && (!entry.isDirectory() || entry.isSymbolicLink())) {
      throw new Error(`${directory} already exists but is not a regular folder`);
    }
  }
  for (const file of canonicalFiles) {
    const entry = await existingEntry(path.join(folderPath, file.relativePath));
    if (entry && (!entry.isFile() || entry.isSymbolicLink())) {
      throw new Error(`${file.relativePath} already exists but is not a regular file`);
    }
  }

  for (const directory of RESEARCH_WORKSPACE_DIRECTORIES) {
    await fs.mkdir(path.join(folderPath, directory), { recursive: true });
  }
  for (const file of canonicalFiles) {
    try {
      await fs.writeFile(path.join(folderPath, file.relativePath), file.content, { flag: "wx" });
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
      const entry = await existingEntry(path.join(folderPath, file.relativePath));
      if (!entry?.isFile() || entry.isSymbolicLink()) {
        throw new Error(`${file.relativePath} already exists but is not a regular file`);
      }
    }
  }
}
