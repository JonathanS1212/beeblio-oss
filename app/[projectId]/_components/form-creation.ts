"use client";

import { generateFormHtml } from "@/lib/forms/generate";
import { createBlankDefinition, FORMS_DIRECTORY } from "@/lib/forms/schema";
import { dispatchWorkspaceMutation } from "@/lib/workspace-mutations";
import { listFiles, saveFile } from "../file-actions";
import type { FileEntry } from "../file-actions";

export { FORMS_DIRECTORY };

/**
 * Creates a new blank form directly in the data folder (FORMS_DIRECTORY),
 * together with its future sibling responses CSV — no matter where in the
 * workspace the user clicked "New Form" from.
 */
export async function createFormInFormsFolder(
  projectId: string,
  name: string,
): Promise<FileEntry> {
  const slug = name
    .toLocaleLowerCase()
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/^-+|-+$/g, "");
  if (!slug) throw new Error("Use a name with letters or numbers");

  const fileName = `${slug}.form.html`;
  let folderEntries: FileEntry[] = [];
  try {
    folderEntries = await listFiles(projectId, FORMS_DIRECTORY);
  } catch {
    folderEntries = [];
  }
  if (folderEntries.some((entry) => entry.name === fileName)) {
    throw new Error(`${fileName} already exists in ${FORMS_DIRECTORY}. Choose a different name.`);
  }

  const path = `${FORMS_DIRECTORY}/${fileName}`;
  await saveFile(projectId, path, generateFormHtml(createBlankDefinition(name)));
  const file: FileEntry = { name: fileName, path, isDir: false, size: 0 };
  dispatchWorkspaceMutation({ kind: "create", entry: file });
  return file;
}

export function announceFormCreated() {
  window.dispatchEvent(new CustomEvent("beeblio:workspace-changed"));
  window.dispatchEvent(new Event("beeblio:storage-changed"));
}
