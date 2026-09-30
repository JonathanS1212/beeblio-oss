export const WORKSPACE_CHANGED_EVENT = "beeblio:workspace-changed";

export type WorkspaceChangedFile = {
  path: string;
  content: string;
};

export type WorkspaceChangedDetail = {
  files?: WorkspaceChangedFile[];
};

export function announceWorkspaceChange(files?: WorkspaceChangedFile[]) {
  window.dispatchEvent(new CustomEvent<WorkspaceChangedDetail>(WORKSPACE_CHANGED_EVENT, {
    detail: files?.length ? { files } : undefined,
  }));
}
