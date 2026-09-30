"use client";

import { useState } from "react";
import { Code2, Columns2, Eye } from "lucide-react";

import { EditorShell } from "./editor-shell";
import { EditorError, EditorLoading } from "./editor-states";
import { LatexReadingPreview } from "./latex-reading-preview";
import { LatexSourceEditor } from "./latex-source-editor";
import type { WorkspaceEditorProps } from "./types";
import { useTextFile } from "./use-text-file";

export function LatexEditor({ projectId, file, sourceUrl, onSaved }: WorkspaceEditorProps) {
  const text = useTextFile(projectId, file.path, onSaved);
  const [mode, setMode] = useState<"source" | "preview" | "split">("split");

  const lines = text.draft.split(/\r?\n/).length;
  const source = <div className="flex h-full min-h-0 flex-col"><div className="flex h-8 shrink-0 items-center justify-between border-b bg-muted/50 px-3 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground"><span>LaTeX source</span><span>{lines} lines</span></div><LatexSourceEditor value={text.draft} onChange={text.setDraft} /></div>;
  const preview = <div className="h-full overflow-auto bg-neutral-200 p-5 dark:bg-neutral-900"><LatexReadingPreview source={text.draft} /></div>;
  return <EditorShell path={file.path} sourceUrl={sourceUrl} dirty={text.dirty} status={!text.loading && !text.error ? <span className="text-xs text-muted-foreground">{lines.toLocaleString()} Lines</span> : undefined} viewModes={[{
    value: mode,
    onChange: (value) => setMode(value as "source" | "preview" | "split"),
    options: [
      { value: "preview", label: "Preview", icon: Eye },
      { value: "source", label: "Edit source", icon: Code2 },
      { value: "split", label: "Split source and preview", icon: Columns2 },
    ],
  }]} discard={{ onDiscard: text.discard, disabled: text.saving }} save={{ onClick: () => text.save(), saving: text.saving }} review={text.review}>
    {text.loading ? <EditorLoading name={file.name} size={file.size} /> : text.error ? <EditorError message={text.error} /> : mode === "source" ? source : mode === "preview" ? preview : <div className="grid h-full min-h-0 grid-cols-2 divide-x">{source}{preview}</div>}
  </EditorShell>;
}
