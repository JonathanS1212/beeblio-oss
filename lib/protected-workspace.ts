import {
  affectsProjectBibliography,
  PROJECT_BIBLIOGRAPHY_PROTECTION_MESSAGE,
} from "./project-bibliography.ts";
import {
  isResearchWorkspaceDirectory,
  RESEARCH_WORKSPACE_PROTECTION_MESSAGE,
} from "./research-workspace.ts";

export const PROTECTED_WORKSPACE_MESSAGE =
  `${RESEARCH_WORKSPACE_PROTECTION_MESSAGE} ${PROJECT_BIBLIOGRAPHY_PROTECTION_MESSAGE}`;

export function affectsProtectedWorkspacePath(filePath: string) {
  return affectsProjectBibliography(filePath) ||
    isResearchWorkspaceDirectory(filePath);
}
