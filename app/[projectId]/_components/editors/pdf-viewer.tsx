"use client";

import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { formatStorageBytes } from "../storage-meter";
import { EditorShell } from "./editor-shell";
import { EditorLoading } from "./editor-states";
import type { WorkspaceEditorProps } from "./types";

export function PdfViewer({ file, sourceUrl }: WorkspaceEditorProps) {
  const [size, setSize] = useState<string>();
  const [loaded, setLoaded] = useState(false);

  // Page count would need pdfjs in the client bundle; the size is the cheap,
  // useful signal for a preview (the document itself is already loading).
  useEffect(() => {
    let cancelled = false;
    void fetch(sourceUrl, { method: "HEAD" })
      .then((response) => {
        const bytes = Number(response.headers.get("content-length"));
        if (!cancelled && response.ok && Number.isSafeInteger(bytes) && bytes > 0) {
          setSize(formatStorageBytes(bytes));
        }
      })
      .catch(() => undefined);
    return () => { cancelled = true; };
  }, [sourceUrl]);

  // The browser's <object> embed gives no dependable loading signal across
  // engines: onLoad covers the common path, and the timer guarantees a viewer
  // that never fires it still uncovers the document beneath the skeleton.
  useEffect(() => {
    setLoaded(false);
    const fallback = window.setTimeout(() => setLoaded(true), 6_000);
    return () => window.clearTimeout(fallback);
  }, [sourceUrl]);

  return (
    <EditorShell path={file.path} sourceUrl={sourceUrl} openUrl={sourceUrl} status={size ? <span className="text-xs text-muted-foreground">
      PDF · {size}</span> : undefined}>
      <div className="relative h-full w-full">
        <object
          data={`${sourceUrl}#toolbar=1&navpanes=0&view=FitH`}
          type="application/pdf"
          className="h-full w-full bg-muted"
          onLoad={() => setLoaded(true)}
        >
          <div className="flex h-full flex-col items-center justify-center gap-3"><p className="text-sm">Your browser cannot display this PDF.</p><Button asChild size="sm"><a href={sourceUrl} target="_blank" rel="noreferrer">Open PDF</a></Button></div>
        </object>
        {!loaded ? (
          <div className="absolute inset-0 z-10">
            <EditorLoading label={`Loading ${file.name}${size ? ` · ${size}` : ""}`} />
          </div>
        ) : null}
      </div>
    </EditorShell>
  );
}
