"use client";

import { useCallback, useEffect, useState } from "react";
import dynamic from "next/dynamic";
import { useTheme } from "next-themes";

import { EditorShell } from "./editor-shell";
import { EditorSkeleton } from "./editor-skeleton";
import { EditorError, EditorLoading } from "./editor-states";
import { ExcalidrawDownloadMenu } from "./excalidraw-download-menu";
import { parseExcalidrawScene, type ExcalidrawScene } from "./excalidraw-scene";
import type { WorkspaceEditorProps } from "./types";
import { useTextFile } from "./use-text-file";
import { isUntitledDraftPath } from "@/lib/untitled-draft";

const ExcalidrawCanvas = dynamic(() => import("./excalidraw-canvas"), {
  ssr: false,
  loading: () => <EditorSkeleton kind="canvas" />,
});

export function ExcalidrawEditor({ projectId, file, sourceUrl, onSaved }: WorkspaceEditorProps) {
  const text = useTextFile(projectId, file.path, onSaved);
  const untitled = isUntitledDraftPath(file.path);
  const { resolvedTheme } = useTheme();

  // The canvas initializes from `initialData` only, so a scene version bump
  // (external reload, discard) remounts it with the re-parsed content.
  const [scene, setScene] = useState<{ data: ExcalidrawScene; version: number } | null>(null);
  const [elementCount, setElementCount] = useState(0);
  const [parseError, setParseError] = useState<string | null>(null);

  useEffect(() => {
    if (text.loading || text.error) return;
    const parsed = parseExcalidrawScene(text.content);
    if ("error" in parsed) {
      setParseError(parsed.error);
      setScene(null);
      return;
    }
    setParseError(null);
    setScene((current) => ({ data: parsed.scene, version: (current?.version ?? 0) + 1 }));
  }, [text.loading, text.error, text.content, text.editorVersion]);

  const handleSceneChange = useCallback((sceneJson: string, count: number) => {
    text.setDraft(sceneJson);
    setElementCount(count);
  }, [text.setDraft]);

  return (
    <EditorShell
      path={file.path}
      sourceUrl={sourceUrl}
      dirty={text.dirty}
      status={!text.loading && !text.error && !parseError ? (
        <span className="text-xs text-muted-foreground">
          {elementCount.toLocaleString()} Element{elementCount === 1 ? "" : "s"}
        </span>
      ) : undefined}
      downloadAction={<ExcalidrawDownloadMenu filename={file.name} sceneJson={text.draft} />}
      discard={{ onDiscard: text.discard, disabled: untitled || text.saving }}
      save={{ onClick: () => text.save(), saving: text.saving }}
      review={text.review}
    >
      {text.loading ? <EditorLoading name={file.name} size={file.size} /> : text.error ? <EditorError message={text.error} /> : parseError ? <EditorError message={parseError} /> : (
        <div className="h-full w-full">
          {scene && (
            <ExcalidrawCanvas
              key={scene.version}
              initialData={scene.data}
              theme={resolvedTheme === "dark" ? "dark" : "light"}
              onSceneChange={handleSceneChange}
            />
          )}
        </div>
      )}
    </EditorShell>
  );
}
