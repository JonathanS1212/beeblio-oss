"use client";

import { useEffect, useState } from "react";

import { usePublicView } from "@/app/share/[shareId]/_components/public-view-context";
import { EditorShell } from "./editor-shell";
import { EditorSkeleton } from "./editor-skeleton";
import { EditorError } from "./editor-states";
import type { WorkspaceEditorProps } from "./types";

const VIEWER_EMBED_URL = "https://view.officeapps.live.com/op/embed.aspx";
const VIEWER_PAGE_URL = "https://view.officeapps.live.com/op/view.aspx";

/**
 * Read-only Office preview through Microsoft's Office Online viewer. The
 * viewer fetches the document server-side, so the file is served from a
 * short-lived signed URL minted per mount (see /api/office/[projectId]/view).
 */
export function OfficeWebViewer({ projectId, file, sourceUrl }: WorkspaceEditorProps) {
  const { shareId } = usePublicView();
  const [src, setSrc] = useState<string>();
  const [frameLoaded, setFrameLoaded] = useState(false);
  const [error, setError] = useState<string>();

  useEffect(() => {
    let cancelled = false;
    const controller = new AbortController();
    setSrc(undefined);
    setFrameLoaded(false);
    setError(undefined);

    void (async () => {
      try {
        if (shareId) {
          if (window.location.protocol !== "https:") {
            throw new Error("Office preview requires a public HTTPS share URL");
          }
          if (!cancelled) setSrc(new URL(sourceUrl, window.location.href).href);
          return;
        }
        const response = await fetch(
          `/api/office/${encodeURIComponent(projectId)}/view?path=${encodeURIComponent(file.path)}`,
          { signal: controller.signal, cache: "no-store" },
        );
        const result = await response.json() as { src?: string; error?: string };
        if (!response.ok || !result.src) {
          throw new Error(result.error || "Unable to open Office preview");
        }
        if (!cancelled) setSrc(result.src);
      } catch (cause) {
        if (!cancelled && cause instanceof Error && cause.name !== "AbortError") {
          setError(cause.message);
        }
      }
    })();

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [projectId, file.path, shareId, sourceUrl]);

  const embedUrl = src ? `${VIEWER_EMBED_URL}?src=${encodeURIComponent(src)}` : undefined;
  const openUrl = src ? `${VIEWER_PAGE_URL}?src=${encodeURIComponent(src)}` : undefined;

  return (
    <EditorShell
      path={file.path}
      sourceUrl={sourceUrl}
      openUrl={openUrl}
      status={<span className="text-xs text-muted-foreground">Read-only · Office Online preview</span>}
    >
      <div className="relative h-full bg-background">
        {embedUrl ? (
          <iframe
            src={embedUrl}
            title={`Preview of ${file.name}`}
            referrerPolicy="no-referrer"
            onLoad={() => setFrameLoaded(true)}
            className="h-full w-full border-0"
          />
        ) : null}
        {!frameLoaded && !error ? (
          <div className="absolute inset-0 z-10 bg-background">
            <EditorSkeleton kind="page" label="Preparing Preview" />
          </div>
        ) : null}
        {error ? (
          <div className="absolute inset-0 z-20 bg-background"><EditorError message={error} /></div>
        ) : null}
      </div>
    </EditorShell>
  );
}
