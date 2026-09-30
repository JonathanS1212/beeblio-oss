import type { ComponentType } from "react";

import type { FileEntry } from "../../file-actions";

export interface WorkspaceEditorProps {
  projectId: string;
  file: FileEntry;
  sourceUrl: string;
  onSaved?: () => void;
}

/** Which EditorSkeleton shape matches the editor's first meaningful render. */
export type EditorSkeletonKind =
  | "prose"
  | "code"
  | "table"
  | "page"
  | "image"
  | "media"
  | "canvas"
  | "notebook"
  | "form"
  | "generic";

export interface WorkspaceEditorDefinition {
  id: string;
  extensions: readonly string[];
  Component: ComponentType<WorkspaceEditorProps>;
  skeleton: EditorSkeletonKind;
}

export function extensionOf(name: string) {
  return name.split(".").pop()?.toLowerCase() ?? "";
}
