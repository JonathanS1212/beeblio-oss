"use client";

import { useMemo, useState } from "react";
import dynamic from "next/dynamic";
import { Download, Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { EditorShell } from "./editor-shell";
import { EditorSkeleton } from "./editor-skeleton";
import { EditorError, EditorLoading } from "./editor-states";
import { SourceCodeEditor } from "./source-code-editor";
import { isUntitledDraftPath } from "@/lib/untitled-draft";
import { extensionOf, type WorkspaceEditorProps } from "./types";
import { useTextFile } from "./use-text-file";
import { AutoCompletionButton, useProjectSettings } from "../auto-completion-button";
import { useWorkspaceDownload } from "../use-workspace-download";
import { DEFAULT_COMPLETION_SETTINGS } from "@/lib/project-settings";

const MarkdownWysiwyg = dynamic(
  () => import("./markdown-wysiwyg").then((module) => module.MarkdownWysiwyg),
  { ssr: false, loading: () => <EditorSkeleton kind="prose" /> },
);

const MarkdownDownloadMenu = dynamic(
  () => import("./markdown-wysiwyg").then((module) => module.MarkdownDownloadMenu),
  { ssr: false },
);

export function TextEditor({ projectId, file, onSaved }: WorkspaceEditorProps) {
  const text = useTextFile(projectId, file.path, onSaved);
  const lines = useMemo(() => text.draft.split(/\r?\n/).length, [text.draft]);
  return <EditorShell path={file.path} dirty={text.dirty} status={!text.loading && !text.error ? <span className="text-xs text-muted-foreground">{lines.toLocaleString()} Lines</span> : undefined} discard={{ onDiscard: text.discard, disabled: text.saving }} save={{ onClick: () => text.save(), saving: text.saving }} review={text.review}>{text.loading ? <EditorLoading name={file.name} size={file.size} /> : text.error ? <EditorError message={text.error} /> : <SourceCodeEditor value={text.draft} extension={extensionOf(file.name)} onChange={text.setDraft} />}</EditorShell>;
}

export function MarkdownEditor({ projectId, file, sourceUrl, onSaved }: WorkspaceEditorProps) {
  const text = useTextFile(projectId, file.path, onSaved);
  const untitled = isUntitledDraftPath(file.path);
  const mermaidFile = ["mmd", "mermaid"].includes(extensionOf(file.name));
  const toEditorMarkdown = (value: string) => mermaidFile ? `\`\`\`mermaid\n${value.replace(/\n$/, "")}\n\`\`\`` : value;
  const fromEditorMarkdown = (value: string) => mermaidFile ? value.match(/^```mermaid\s*\n([\s\S]*?)\n```\s*$/)?.[1] ?? value : value;
  const words = useMemo(() => countWords(text.draft), [text.draft]);
  const settings = useProjectSettings(projectId);
  const completion = settings.completion ?? DEFAULT_COMPLETION_SETTINGS;
  return <EditorShell path={file.path} sourceUrl={sourceUrl} dirty={text.dirty} status={<span className="text-xs text-muted-foreground">
    {/* {mermaidFile ? "Mermaid" : untitled ? "Draft" : "Markdown"} ·  */}
  {words.toLocaleString()} Word{words === 1 ? "" : "s"}
  {/* {words > 0 ? ` · ${Math.max(1, Math.round(words / 220))} min read` : ""} */}
  </span>} leadingActions={<AutoCompletionButton projectId={projectId} settings={settings} />} downloadAction={untitled ? undefined : <MarkdownDownloadMenu projectId={projectId} filePath={file.path} filename={file.name} markdown={toEditorMarkdown(text.draft)} />} discard={{ onDiscard: text.discard, disabled: untitled || text.saving }} save={{ onClick: () => text.save(), saving: text.saving }} review={text.review ? { ...text.review, documentDefaults: settings.documentDefaults } : undefined}>{text.loading ? <EditorLoading name={file.name} size={file.size} /> : text.error ? <EditorError message={text.error} /> : <MarkdownWysiwyg projectId={projectId} filePath={file.path} markdown={toEditorMarkdown(text.draft)} originalMarkdown={toEditorMarkdown(text.content)} onChange={(value) => text.setDraft(fromEditorMarkdown(value))} completion={completion} documentDefaults={settings.documentDefaults} />}</EditorShell>;
}

/**
 * Unicode-aware word count for the editor status line. Markdown syntax that
 * never reaches a reader (code, images, link URLs, markup sigils) is excluded
 * so the count matches what would export.
 */
function countWords(markdown: string): number {
  const prose = markdown
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/`[^`\n]*`/g, " ")
    .replace(/!\[[^\]]*\]\([^)]*\)/g, " ")
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/^\s{0,3}[>#\-*+|]+/gm, " ");
  const words = prose.match(/[\p{L}\p{N}][\p{L}\p{N}'’-]*/gu);
  return words ? words.length : 0;
}

export function ImageViewer({ file, sourceUrl }: WorkspaceEditorProps) {
  const [dimensions, setDimensions] = useState<{ width: number; height: number }>();
  const [loaded, setLoaded] = useState(false);
  const label = extensionOf(file.name).toUpperCase() || "Image";
  return <EditorShell path={file.path} sourceUrl={sourceUrl} openUrl={sourceUrl} status={dimensions ? <span className="text-xs text-muted-foreground">
    {/* {label} ·  */}
  Res. {dimensions.width.toLocaleString()} × {dimensions.height.toLocaleString()}</span> : undefined}><div className="relative flex h-full items-center justify-center p-4">{!loaded ? <div className="absolute inset-0 z-10"><EditorLoading name={file.name} size={file.size} /></div> : null}{/* eslint-disable-next-line @next/next/no-img-element */}<img src={sourceUrl} alt={file.name} onLoad={(event) => { setLoaded(true); setDimensions({ width: event.currentTarget.naturalWidth, height: event.currentTarget.naturalHeight }); }} onError={() => setLoaded(true)} className="max-h-full max-w-full object-contain" /></div></EditorShell>;
}

export function UnsupportedViewer({ file, sourceUrl }: WorkspaceEditorProps) {
  const { download, downloading } = useWorkspaceDownload(sourceUrl, file.path);
  return <EditorShell path={file.path} sourceUrl={sourceUrl} openUrl={sourceUrl}><div className="flex h-full flex-col items-center justify-center p-6 text-center"><div><p className="text-sm font-medium">Preview Unavailable</p><p className="mt-1 text-xs text-muted-foreground">This file type does not have a workspace editor yet.</p></div><Button className="mt-4" size="sm" variant="outline" onClick={() => void download()} disabled={downloading}>{downloading ? <Loader2 className="animate-spin" /> : <Download />}Download to Edit Offline</Button></div></EditorShell>;
}
