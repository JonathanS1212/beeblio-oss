"use client";

import { useEffect, useState } from "react";
import type { FileEntry } from "../file-actions";
import { editorFor, editorRefreshesInPlace } from "./editors/registry";
import { usePublicView } from "@/app/share/[shareId]/_components/public-view-context";

export function fileUrl(projectId: string, relativePath: string) {
  const encoded = relativePath.split("/").map(encodeURIComponent).join("/");
  return `/api/workspace/${projectId}/${encoded}`;
}

export function FileViewer({
  projectId,
  file,
  instanceKey,
  onSaved,
}: {
  projectId: string;
  file: FileEntry;
  /**
   * Identity of the open editor instance, stable across renames and moves so
   * the editor (and its unsaved edits) survives a re-path. Falls back to the
   * path for callers without tab bookkeeping (e.g. share views).
   */
  instanceKey?: string;
  onSaved?: () => void;
}) {
  const [reloadVersion, setReloadVersion] = useState(0);
  const publicView = usePublicView();
  const refreshesInPlace = editorRefreshesInPlace(file.name);

  useEffect(() => {
    const reload = (event: Event) => {
      const detail = (event as CustomEvent<{ path?: string }>).detail;
      if (detail?.path === file.path && !refreshesInPlace) {
        setReloadVersion((value) => value + 1);
      }
    };
    window.addEventListener("beeblio:reload-workspace-file", reload);
    return () => window.removeEventListener("beeblio:reload-workspace-file", reload);
  }, [file.path, refreshesInPlace]);

  // In the share view the session may be absent or belong to another user, so
  // content loads through the share-link endpoint instead of the
  // session-authenticated workspace API.
  const encodedPath = file.path.split("/").map(encodeURIComponent).join("/");
  const sourceUrl = publicView.shareId
    ? `/api/share/${encodeURIComponent(publicView.shareId)}/${encodedPath}`
    : fileUrl(projectId, file.path);

  const Editor = editorFor(file.name);
  const stableKey = instanceKey ?? file.path;
  return (
    <Editor
      key={refreshesInPlace ? stableKey : `${stableKey}:${reloadVersion}`}
      projectId={projectId}
      file={file}
      sourceUrl={sourceUrl}
      onSaved={onSaved}
    />
  );
}
