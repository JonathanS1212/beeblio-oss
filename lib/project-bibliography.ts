import { REFERENCES_DIRECTORY } from "./research-workspace.ts";

export { REFERENCES_DIRECTORY };

export const PROJECT_BIBLIOGRAPHY_NAME = "references.bib";
export const PROJECT_BIBLIOGRAPHY_PATH =
  `${REFERENCES_DIRECTORY}/${PROJECT_BIBLIOGRAPHY_NAME}`;

/** Staging folder for imported BibTeX files; entries merge into the project
 *  bibliography, so the files themselves stay out of the visible listings. */
export const BIB_IMPORTS_DIRECTORY = ".bee-imports";

export const PROJECT_BIBLIOGRAPHY_PROTECTION_MESSAGE =
  `${PROJECT_BIBLIOGRAPHY_PATH} is the project bibliography database and cannot be moved, renamed, or deleted.`;

function normalizeWorkspacePath(filePath: string) {
  const segments: string[] = [];
  for (const segment of filePath.split("/")) {
    if (!segment || segment === ".") continue;
    if (segment === "..") segments.pop();
    else segments.push(segment);
  }
  return segments.join("/");
}

export function affectsProjectBibliography(filePath: string) {
  const normalizedPath = normalizeWorkspacePath(filePath);
  return normalizedPath === PROJECT_BIBLIOGRAPHY_PATH ||
    PROJECT_BIBLIOGRAPHY_PATH.startsWith(`${normalizedPath}/`);
}
