"use client";

import { createContext, useContext } from "react";

import type { SelectionRange } from "@/lib/chat-context";
import type { FileEntry } from "../file-actions";

export type WorkspaceSelection = {
  filePath: string;
  text: string;
  /** Present when the selection came from the visual editor; see SelectionRange. */
  range?: SelectionRange;
  /** Neighboring source text around the passage, when the editor can see it. */
  before?: string;
  after?: string;
  /** How the text was extracted; see ChatSelectionContext.source. */
  source?: "document" | "rendered";
};

export type WorkspaceEditorRegistration = {
  id: string;
  path: string;
  dirty: boolean;
  save: () => Promise<boolean>;
  discard: () => void;
  getContent: () => string | null;
};

/** Lets a rich (document-model) editor answer "what is selected right now"
 *  with source-faithful text instead of flattened DOM text. The provider must
 *  validate on every call that the current DOM selection actually sits inside
 *  its editor, returning null otherwise, so selections made elsewhere (e.g.
 *  the chat composer) never read the editor's stale selection. */
export type WorkspaceSelectionProvider = {
  id: string;
  path: string;
  getSelection: () => Omit<WorkspaceSelection, "filePath"> | null;
};

export type WorkspaceUnsavedFile = {
  path: string;
};

export type WorkspaceContextValue = {
  activeFile?: FileEntry;
  selection?: WorkspaceSelection;
  unsavedFile?: WorkspaceUnsavedFile;
  clearSelection: () => void;
  pinFile: (path: string) => void;
  registerEditor: (registration: WorkspaceEditorRegistration) => void;
  unregisterEditor: (id: string) => void;
  registerSelectionProvider: (provider: WorkspaceSelectionProvider) => void;
  unregisterSelectionProvider: (id: string) => void;
  saveUnsavedFile: () => Promise<boolean>;
  discardUnsavedFile: () => boolean;
  getUnsavedContent: () => string | null;
  getCurrentContent: () => string | null;
  saveUntitledDraft: (draftPath: string, content: string) => Promise<boolean>;
};

export const WorkspaceContext = createContext<WorkspaceContextValue>({
  clearSelection: () => undefined,
  pinFile: () => undefined,
  registerEditor: () => undefined,
  unregisterEditor: () => undefined,
  registerSelectionProvider: () => undefined,
  unregisterSelectionProvider: () => undefined,
  saveUnsavedFile: async () => true,
  discardUnsavedFile: () => true,
  getUnsavedContent: () => null,
  getCurrentContent: () => null,
  saveUntitledDraft: async () => false,
});

export function useWorkspaceContext() {
  return useContext(WorkspaceContext);
}
