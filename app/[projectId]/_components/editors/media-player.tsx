"use client";

import dynamic from "next/dynamic";
import { useEffect, useState } from "react";
import { AudioLines, Download, TriangleAlert } from "lucide-react";

import { Button } from "@/components/ui/button";
import { isAudioFileName } from "@/lib/media-files";
import { EditorShell } from "./editor-shell";
import { EditorSkeleton } from "./editor-skeleton";
import { extensionOf, type WorkspaceEditorProps } from "./types";

// The player (Media Chrome) only downloads when a media file is opened.
const MediaChromePlayer = dynamic(
  () => import("./media-chrome-player").then((m) => m.MediaChromePlayer),
  { ssr: false, loading: () => <EditorSkeleton kind="media" /> },
);

export function MediaPlayer({ file, sourceUrl }: WorkspaceEditorProps) {
  const [error, setError] = useState<"unsupported" | "failed">();
  const [duration, setDuration] = useState<number>();
  const [size, setSize] = useState(file.size);
  const extension = extensionOf(file.name);
  const audio = isAudioFileName(file.name);

  // Files opened from a deep link or an agent message do not come from the
  // workspace listing, so their temporary tab entry has no byte count. Read
  // it from the file response instead of leaving the media chrome at `0 B`.
  useEffect(() => {
    setSize(file.size);
    if (file.size > 0) return;

    let cancelled = false;
    void fetch(sourceUrl, { method: "HEAD" })
      .then((response) => {
        const bytes = Number(response.headers.get("content-length"));
        if (!cancelled && response.ok && Number.isSafeInteger(bytes) && bytes > 0) {
          setSize(bytes);
        }
      })
      .catch(() => undefined);
    return () => { cancelled = true; };
  }, [file.size, sourceUrl]);

  const status = (
    <span className="text-xs text-muted-foreground">
      {extension.toUpperCase()} · {formatBytes(size)}
      {duration && Number.isFinite(duration) ? ` · ${formatDuration(duration)}` : ""}
    </span>
  );

  return (
    <EditorShell path={file.path} sourceUrl={sourceUrl} openUrl={sourceUrl} status={status}>
      {error ? (
        <MediaErrorState
          kind={audio ? "audio" : "video"}
          reason={error}
          sourceUrl={sourceUrl}
          filename={file.name}
        />
      ) : audio ? (
        <div className="flex h-full items-center justify-center overflow-y-auto p-6">
          <div className="w-full overflow-hidden rounded-2xl border bg-card shadow-sm">
            <div className="flex items-center gap-3 px-4 pt-4">
              <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-indigo-500/10 text-indigo-600 dark:text-indigo-300">
                <AudioLines className="size-5" />
              </span>
              <div className="min-w-0 pb-1">
                <p className="truncate text-sm font-medium" title={file.name}>{file.name}</p>
                <p className="text-xs tabular-nums text-muted-foreground">
                  {formatBytes(size)}
                  {duration && Number.isFinite(duration) ? ` · ${formatDuration(duration)}` : ""}
                </p>
              </div>
            </div>
            <div className="px-2 pb-2 pt-1">
              <MediaChromePlayer
                kind="audio"
                src={sourceUrl}
                onError={setError}
                onDuration={setDuration}
              />
            </div>
          </div>
        </div>
      ) : (
        <div className="flex h-full items-center justify-center bg-muted/50 dark:bg-black/50">
          <MediaChromePlayer
            kind="video"
            src={sourceUrl}
            onError={setError}
            onDuration={setDuration}
          />
        </div>
      )}
    </EditorShell>
  );
}

function MediaErrorState({
  kind,
  reason,
  sourceUrl,
  filename,
}: {
  kind: "audio" | "video";
  reason: "unsupported" | "failed";
  sourceUrl: string;
  filename: string;
}) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-3 p-6 text-center">
      <span className="flex size-10 items-center justify-center rounded-xl bg-amber-500/10 text-amber-600 dark:text-amber-300">
        <TriangleAlert className="size-5" />
      </span>
      <div>
        <p className="text-sm font-medium">
          {reason === "unsupported"
            ? `This ${kind} file can’t be played in the browser`
            : `Couldn’t load this ${kind} file`}
        </p>
        <p className="mt-1 max-w-sm text-xs leading-5 text-muted-foreground">
          {reason === "unsupported"
            ? "The file’s format isn’t supported by the built-in player. Download it to open it in another app."
            : "The workspace storage could not serve the file. Try again, or download it if the problem persists."}
        </p>
      </div>
      <Button asChild size="sm" variant="outline">
        <a href={sourceUrl} download={filename}>
          <Download />
          Download file
        </a>
      </Button>
    </div>
  );
}

function formatBytes(size: number) {
  if (size < 1_000) return `${size} B`;
  if (size < 1_000_000) return `${(size / 1_000).toFixed(size < 10_000 ? 1 : 0)} KB`;
  return `${(size / 1_000_000).toFixed(size < 10_000_000 ? 1 : 0)} MB`;
}

function formatDuration(seconds: number) {
  const total = Math.round(seconds);
  const h = Math.floor(total / 3_600);
  const m = Math.floor((total % 3_600) / 60);
  const s = total % 60;
  return h > 0
    ? `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`
    : `${m}:${String(s).padStart(2, "0")}`;
}
