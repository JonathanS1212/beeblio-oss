export const WORKSPACE_PATHS_DRAG_TYPE = "application/x-beeblio-workspace-path";

export function setWorkspaceDragData(
  dataTransfer: DataTransfer,
  paths: string[],
  effectAllowed: DataTransfer["effectAllowed"] = "copyMove",
) {
  dataTransfer.effectAllowed = effectAllowed;
  dataTransfer.setData(WORKSPACE_PATHS_DRAG_TYPE, JSON.stringify(paths));
  if (paths.length === 1) dataTransfer.setData("text/plain", paths[0]);
}

export function getWorkspaceDragPaths(dataTransfer: DataTransfer) {
  if (!dataTransfer.types.includes(WORKSPACE_PATHS_DRAG_TYPE)) return [];

  try {
    const paths = JSON.parse(dataTransfer.getData(WORKSPACE_PATHS_DRAG_TYPE)) as unknown;
    return Array.isArray(paths) && paths.every((path) => typeof path === "string")
      ? paths
      : [];
  } catch {
    return [];
  }
}
