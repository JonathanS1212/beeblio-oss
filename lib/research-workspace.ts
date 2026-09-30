export const RESEARCH_WORKSPACE_DIRECTORIES = [
  "1-References",
  "2-Data",
  "3-Analysis",
  "4-Reports",
] as const;

export const REFERENCES_DIRECTORY = RESEARCH_WORKSPACE_DIRECTORIES[0];
export const DATA_DIRECTORY = RESEARCH_WORKSPACE_DIRECTORIES[1];
export const ANALYSIS_DIRECTORY = RESEARCH_WORKSPACE_DIRECTORIES[2];
export const REPORTS_DIRECTORY = RESEARCH_WORKSPACE_DIRECTORIES[3];

export const RESEARCH_WORKSPACE_PROTECTION_MESSAGE =
  "Beeblio's four research folders cannot be moved, renamed, replaced, or deleted. You can manage all files and folders inside them.";

function normalizeWorkspacePath(filePath: string) {
  const segments: string[] = [];
  for (const segment of filePath.split("/")) {
    if (!segment || segment === ".") continue;
    if (segment === "..") segments.pop();
    else segments.push(segment);
  }
  return segments.join("/");
}

export function isResearchWorkspaceDirectory(filePath: string) {
  const normalizedPath = normalizeWorkspacePath(filePath);
  return RESEARCH_WORKSPACE_DIRECTORIES.some(
    (directory) => directory === normalizedPath,
  );
}

export function isInsideWorkspaceDirectory(
  filePath: string,
  directory: (typeof RESEARCH_WORKSPACE_DIRECTORIES)[number],
) {
  const normalizedPath = normalizeWorkspacePath(filePath);
  return normalizedPath.startsWith(`${directory}/`);
}
