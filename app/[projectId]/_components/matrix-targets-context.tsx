"use client";

import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";

import { DEFAULT_MATRIX_PATH, MATRIX_EXTENSION } from "@/lib/literature-matrix";
import { WORKSPACE_CHANGED_EVENT, type WorkspaceChangedDetail } from "@/lib/workspace-change";
import { applyMutationToFlatListing, WORKSPACE_MUTATION_EVENT, type WorkspaceMutation } from "@/lib/workspace-mutations";
import { listAllFiles, type FileEntry } from "../file-actions";
import type { MatrixFileSummary } from "../matrix-actions";
import { clearMatrixMembership } from "./matrix-membership-cache";

const MatrixTargetsContext = createContext<MatrixFileSummary[] | undefined>(undefined);

export function MatrixTargetsProvider({ projectId, initialFiles, children }: {
  projectId: string;
  initialFiles?: FileEntry[];
  children: ReactNode;
}) {
  const [files, setFiles] = useState<FileEntry[] | undefined>(initialFiles);

  useEffect(() => {
    // Project slugs are scoped to an owner; discard membership from a prior
    // visit when this workspace shell mounts again.
    clearMatrixMembership(projectId);
  }, [projectId]);

  useEffect(() => {
    let active = true;
    let revision = 0;
    const refresh = async () => {
      const requestedAt = revision;
      const listing = await listAllFiles(projectId);
      if (active && requestedAt === revision) setFiles(listing);
    };
    const onMutation = (event: Event) => {
      revision++;
      setFiles((current) => current && applyMutationToFlatListing(current, (event as CustomEvent<WorkspaceMutation>).detail));
    };
    const onChange = (event: Event) => {
      const changed = (event as CustomEvent<WorkspaceChangedDetail>).detail?.files;
      if (!changed?.length) {
        void refresh();
        return;
      }
      revision++;
      // A content write cannot remove or rename a target. The add action can
      // create the default matrix, so insert its known path without a scan.
      setFiles((current) => {
        if (!current) return current;
        let next = current;
        for (const file of changed) {
          if (!file.path.toLocaleLowerCase().endsWith(`.${MATRIX_EXTENSION}`)) continue;
          if (next.some((entry) => entry.path === file.path)) continue;
          next = [...next, {
            path: file.path,
            name: file.path.split("/").at(-1) || file.path,
            isDir: false,
            size: file.content.length,
          }];
        }
        return next;
      });
    };
    if (!initialFiles) void refresh();
    window.addEventListener(WORKSPACE_MUTATION_EVENT, onMutation);
    window.addEventListener(WORKSPACE_CHANGED_EVENT, onChange);
    return () => {
      active = false;
      window.removeEventListener(WORKSPACE_MUTATION_EVENT, onMutation);
      window.removeEventListener(WORKSPACE_CHANGED_EVENT, onChange);
    };
  }, [projectId, initialFiles]);

  const targets = useMemo(() => files?.filter(
    (entry) => !entry.isDir && entry.name.toLocaleLowerCase().endsWith(`.${MATRIX_EXTENSION}`),
  ).map((entry) => ({
    path: entry.path,
    name: entry.name,
    isDefault: entry.path === DEFAULT_MATRIX_PATH,
  })).sort((left, right) =>
    Number(right.isDefault) - Number(left.isDefault) || left.name.localeCompare(right.name),
  ), [files]);

  return <MatrixTargetsContext.Provider value={targets}>{children}</MatrixTargetsContext.Provider>;
}

export function useMatrixTargets() {
  return useContext(MatrixTargetsContext);
}
