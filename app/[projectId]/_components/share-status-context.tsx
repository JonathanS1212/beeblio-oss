"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { WORKSPACE_MUTATION_EVENT, type WorkspaceMutation } from "@/lib/workspace-mutations";

type ShareStatus = {
  projectId: string;
  files: Map<string, string>;
  publicOrigin: string | null;
  loaded: boolean;
  error: boolean;
};

type ShareStatusContextValue = {
  files: Map<string, string>;
  publicOrigin: string | null;
  loaded: boolean;
  error: boolean;
  refresh: () => Promise<void>;
  setFileStatus: (filePath: string, shareId: string | null) => void;
};

const ShareStatusContext = createContext<ShareStatusContextValue | null>(null);

export function ShareStatusProvider({ projectId, children }: { projectId: string; children: ReactNode }) {
  const [status, setStatus] = useState<ShareStatus>(() => ({
    projectId, files: new Map(), publicOrigin: null, loaded: false, error: false,
  }));
  const requestVersion = useRef(0);

  const refresh = useCallback(async () => {
    const version = ++requestVersion.current;
    try {
      const response = await fetch(`/api/projects/${encodeURIComponent(projectId)}/share-status`, { cache: "no-store" });
      if (!response.ok) throw new Error("Unable to load share status");
      const data = await response.json() as { files: { filePath: string; id: string }[]; publicOrigin: string | null };
      if (version === requestVersion.current) {
        setStatus({ projectId, files: new Map(data.files.map(({ filePath, id }) => [filePath, id])), publicOrigin: data.publicOrigin, loaded: true, error: false });
      }
    } catch {
      if (version === requestVersion.current) {
        setStatus({ projectId, files: new Map(), publicOrigin: null, loaded: false, error: true });
      }
    }
  }, [projectId]);

  useEffect(() => {
    void refresh();
    return () => { requestVersion.current += 1; };
  }, [refresh]);

  useEffect(() => {
    const onMutation = (event: Event) => {
      const mutation = (event as CustomEvent<WorkspaceMutation>).detail;
      if (mutation.kind === "create") return;
      setStatus((current) => {
        if (current.projectId !== projectId || !current.loaded) return current;
        const files = new Map(current.files);
        for (const [filePath, shareId] of current.files) {
          const source = mutation.kind === "move" ? mutation.from : mutation.path;
          if (filePath !== source && !filePath.startsWith(`${source}/`)) continue;
          files.delete(filePath);
          if (mutation.kind === "move") files.set(mutation.to + filePath.slice(source.length), shareId);
        }
        return { ...current, files };
      });
    };
    window.addEventListener(WORKSPACE_MUTATION_EVENT, onMutation);
    return () => window.removeEventListener(WORKSPACE_MUTATION_EVENT, onMutation);
  }, [projectId]);

  const setFileStatus = useCallback((filePath: string, shareId: string | null) => {
    setStatus((current) => {
      if (current.projectId !== projectId) return current;
      const files = new Map(current.files);
      if (shareId) files.set(filePath, shareId);
      else files.delete(filePath);
      return { ...current, files };
    });
  }, [projectId]);

  const value = useMemo<ShareStatusContextValue>(() => ({
    files: status.projectId === projectId ? status.files : new Map(),
    publicOrigin: status.projectId === projectId ? status.publicOrigin : null,
    loaded: status.projectId === projectId && status.loaded,
    error: status.projectId === projectId && status.error,
    refresh,
    setFileStatus,
  }), [projectId, status, refresh, setFileStatus]);

  return <ShareStatusContext.Provider value={value}>{children}</ShareStatusContext.Provider>;
}

export function useShareStatus() {
  const context = useContext(ShareStatusContext);
  if (!context) throw new Error("Share status is only available in a project workspace");
  return context;
}
