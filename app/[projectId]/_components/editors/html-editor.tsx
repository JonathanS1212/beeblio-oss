"use client";

import { useMemo, useState } from "react";
import { Code2, Columns2, Eye, Monitor, Smartphone, Tablet } from "lucide-react";

import { Brand } from "@/app/_components/brand";
import { usePublicView } from "@/app/share/[shareId]/_components/public-view-context";
import { EditorShell } from "./editor-shell";
import { EditorError, EditorLoading } from "./editor-states";
import { SourceCodeEditor } from "./source-code-editor";
import type { WorkspaceEditorProps } from "./types";
import { useTextFile } from "./use-text-file";

type ViewMode = "preview" | "source" | "split";
type Viewport = "desktop" | "tablet" | "mobile";

const viewportWidths: Record<Viewport, string> = {
  desktop: "100%",
  tablet: "768px",
  mobile: "390px",
};

export function HtmlEditor({ projectId, file, sourceUrl, onSaved }: WorkspaceEditorProps) {
  const text = useTextFile(projectId, file.path, onSaved);
  const [mode, setMode] = useState<ViewMode>("preview");
  const [viewport, setViewport] = useState<Viewport>("desktop");
  const lines = useMemo(() => text.draft.split(/\r?\n/).length, [text.draft]);
  const isPublicRoute = Boolean(usePublicView().shareId);

  return (
    <EditorShell
      path={file.path}
      sourceUrl={sourceUrl}
      dirty={text.dirty}
      status={
        mode === "preview" ? (
          // The share page header already carries the brand; don't render a second one.
          isPublicRoute ? undefined : <Brand href="/workspace" small />
        ) : !text.loading && !text.error ? (
          <span className="text-xs text-muted-foreground">{lines.toLocaleString()} Lines</span>
        ) : undefined
      }
      viewModes={[
        {
          value: mode,
          onChange: (value) => setMode(value as ViewMode),
          options: [
            { value: "preview", label: "Preview", icon: Eye },
            { value: "source", label: "Edit Source", icon: Code2 },
            { value: "split", label: "Split Preview", icon: Columns2 },
          ],
        },
        ...(mode === "preview" && !isPublicRoute
          ? [{
              value: viewport,
              onChange: (value: string) => setViewport(value as Viewport),
              options: [
                { value: "desktop", label: "Desktop Preview", icon: Monitor },
                { value: "tablet", label: "Tablet Preview", icon: Tablet },
                { value: "mobile", label: "Mobile Preview", icon: Smartphone },
              ],
            }]
          : []),
      ]}
      discard={{ onDiscard: text.discard, disabled: text.saving }}
      save={{ onClick: () => text.save(), saving: text.saving }}
      review={text.review}
    >
      {text.loading ? (
        <EditorLoading name={file.name} size={file.size} />
      ) : text.error ? (
        <EditorError message={text.error} />
      ) : mode === "source" ? (
        <HtmlSource value={text.draft} onChange={text.setDraft} />
      ) : mode === "split" ? (
        <div className="grid h-full min-h-0 grid-cols-1 grid-rows-2 md:grid-cols-2 md:grid-rows-1">
          <div className="min-h-0 border-r"><HtmlSource value={text.draft} onChange={text.setDraft} /></div>
          <HtmlPreview fileName={file.name} html={text.draft} viewport="desktop" />
        </div>
      ) : (
        <HtmlPreview fileName={file.name} html={text.draft} viewport={viewport} />
      )}
    </EditorShell>
  );
}

function HtmlSource({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex h-8 shrink-0 items-center justify-between border-b bg-muted/50 px-3 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
        <span>HTML source</span>
        <span>{value.split("\n").length} lines</span>
      </div>
      <SourceCodeEditor value={value} extension="html" onChange={onChange} />
    </div>
  );
}

function HtmlPreview({ fileName, html, viewport }: { fileName: string; html: string; viewport: Viewport }) {
  const settlePreview = (iframe: HTMLIFrameElement) => {
    const targetWidth = viewportWidths[viewport];
    const initialWidth = iframe.clientWidth;
    if (!initialWidth) return;

    // Some srcDoc layouts retain their first viewport calculation until the
    // iframe itself changes width. Keep the document alive while giving it
    // the same resize that switching viewport presets provides.
    iframe.style.width = `${Math.max(1, Math.floor(initialWidth / 2))}px`;
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        if (iframe.isConnected) iframe.style.width = targetWidth;
      });
    });
  };

  return (
    <div className="flex h-full min-h-0 flex-col bg-muted/30">
      <div className={`min-h-0 flex-1 overflow-auto ${viewport === "desktop" ? "p-0" : "p-4"}`}>
        <iframe
          title={`Preview of ${fileName}`}
          // HTML artifacts are intentionally interactive, but remain in an
          // opaque origin: omitting allow-same-origin prevents their scripts
          // from reading Beeblio's DOM, cookies, or browser storage.
          sandbox="allow-scripts allow-forms allow-modals allow-popups allow-downloads"
          srcDoc={html}
          onLoad={(event) => settlePreview(event.currentTarget)}
          className="mx-auto block h-full min-h-[320px] border-0 bg-white shadow-sm"
          style={{ width: viewportWidths[viewport], maxWidth: "100%" }}
        />
      </div>
    </div>
  );
}
