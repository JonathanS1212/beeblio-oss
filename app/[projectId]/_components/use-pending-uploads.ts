"use client";

import { useCallback, useState } from "react";

import { resizeImageForAgent } from "@/lib/client-image-resize";
import { isStorageLimitError } from "@/lib/storage-errors";
import { dispatchWorkspaceMutation } from "@/lib/workspace-mutations";
import { uploadWorkspaceFile } from "@/lib/workspace-upload";
import type { FileEntry } from "../file-actions";

/**
 * A stand-in row for an upload still in flight. Shaped like the entry it will
 * become so listings can sort and render it unchanged; `pendingId` marks it as
 * provisional — the server may still dedupe the final name on collision.
 */
export type PendingUpload = FileEntry & {
  pendingId: string;
  folder: string;
};

export type UploadOutcome =
  | { name: string; ok: true }
  | { name: string; ok: false; error: string; storageLimit: boolean };

export function isPendingUpload(file: FileEntry): file is PendingUpload {
  return typeof (file as PendingUpload).pendingId === "string";
}

let uploadSeq = 0;

/**
 * Optimistic upload pipeline shared by the File Explorer and the artifact
 * panels. Dropped or picked files enter `pendingUploads` immediately — the
 * caller renders grayed stand-in rows — upload sequentially, and each resolves
 * into the regular "create" mutation panels already apply. Callers keep their
 * own toasts and refresh behavior from the returned outcomes.
 *
 * Flows with work beyond the plain upload (the bibliography imports) drive the
 * same rows manually through `addPendingUpload`/`removePendingUpload`.
 */
export function usePendingUploads(projectId: string) {
  const [pendingUploads, setPendingUploads] = useState<PendingUpload[]>([]);

  /** Adds a grayed stand-in row for a file starting its journey to storage. */
  const addPendingUpload = useCallback((folder: string, file: globalThis.File): PendingUpload => {
    const pending: PendingUpload = {
      name: file.name,
      path: [folder, file.name].filter(Boolean).join("/"),
      isDir: false,
      size: file.size,
      pendingId: `${Date.now().toString(36)}-${uploadSeq++}`,
      folder,
    };
    setPendingUploads((current) => [...current, pending]);
    return pending;
  }, []);

  /** Drops a stand-in row; safe to call again for an already-removed upload. */
  const removePendingUpload = useCallback((pending: PendingUpload) => {
    setPendingUploads((current) =>
      current.filter((entry) => entry.pendingId !== pending.pendingId),
    );
  }, []);

  const uploadFiles = useCallback(async (folder: string, selected: globalThis.File[]) => {
    if (selected.length === 0) return [];
    const batch = selected.map((file) => addPendingUpload(folder, file));

    const outcomes: UploadOutcome[] = [];
    let uploaded = 0;
    for (let index = 0; index < batch.length; index++) {
      const pending = batch[index];
      const original = selected[index];
      if (!original) continue;
      let outcome: UploadOutcome;
      try {
        const file = await resizeImageForAgent(original);
        const result = await uploadWorkspaceFile(projectId, folder, file);
        if (result.success) {
          dispatchWorkspaceMutation({ kind: "create", entry: result.file });
          uploaded += 1;
          outcome = { name: original.name, ok: true };
        } else {
          outcome = {
            name: original.name,
            ok: false,
            error: result.error,
            storageLimit: isStorageLimitError(result.error),
          };
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        outcome = {
          name: original.name,
          ok: false,
          error: message,
          storageLimit: isStorageLimitError(message),
        };
      }
      outcomes.push(outcome);
      removePendingUpload(pending);
    }

    if (uploaded > 0) {
      // Panels listen for these to re-list and re-measure storage; the create
      // mutations above have already updated their rows optimistically.
      window.dispatchEvent(new CustomEvent("beeblio:workspace-changed"));
      window.dispatchEvent(new Event("beeblio:storage-changed"));
    }
    return outcomes;
  }, [projectId, addPendingUpload, removePendingUpload]);

  return { pendingUploads, uploadFiles, addPendingUpload, removePendingUpload };
}
