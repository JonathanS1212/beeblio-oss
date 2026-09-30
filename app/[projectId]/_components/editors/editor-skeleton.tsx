import { formatStorageBytes } from "../storage-meter";
import { cn } from "@/lib/utils";
import type { EditorSkeletonKind } from "./types";

/**
 * Loading placeholder shaped like the editor that is about to mount, so the
 * wait communicates what is coming instead of a generic spinner. The kind is
 * derived from the file's registry entry (see skeletonKindFor); `name` and
 * `size`, when the opening entry carries them, ground the caption in the
 * concrete file ("Loading report.md · 12 KB").
 *
 * The container fades in after a short delay (globals.css `.editor-skeleton`)
 * so cache hits and other sub-~120ms loads never flash a skeleton at all.
 */
export function EditorSkeleton({
  kind,
  name,
  size,
  label,
}: {
  kind: EditorSkeletonKind;
  name?: string;
  size?: number;
  /** Overrides the derived caption (e.g. "Preparing Preview"). */
  label?: string;
}) {
  const caption = label ?? (name
    ? `Loading ${name}${size && size > 0 ? ` · ${formatStorageBytes(size)}` : ""}`
    : undefined);

  return (
    <div className="editor-skeleton flex h-full min-h-0 flex-col overflow-hidden">
      <div className="flex min-h-0 flex-1 items-center justify-center overflow-hidden p-6">
        {kind === "prose" ? <ProseSkeleton /> : null}
        {kind === "code" ? <CodeSkeleton /> : null}
        {kind === "table" ? <TableSkeleton /> : null}
        {kind === "page" ? <PageSkeleton /> : null}
        {kind === "image" ? <ImageSkeleton /> : null}
        {kind === "media" ? <MediaSkeleton /> : null}
        {kind === "canvas" ? <CanvasSkeleton /> : null}
        {kind === "notebook" ? <NotebookSkeleton /> : null}
        {kind === "form" ? <FormSkeleton /> : null}
        {kind === "generic" ? <GenericSkeleton /> : null}
      </div>
      {caption ? (
        <p className="shrink-0 pb-4 text-center text-xs text-muted-foreground" aria-live="polite">
          {caption}
        </p>
      ) : null}
    </div>
  );
}

function Bar({ className }: { className?: string }) {
  return <div className={cn("animate-pulse rounded-full bg-muted", className)} />;
}

/** Document-like content: a title, then paragraphs of varying line widths. */
function ProseSkeleton() {
  return (
    <div className="w-full max-w-xl space-y-5 py-2" aria-hidden>
      <Bar className="h-5 w-2/5" />
      <div className="space-y-2">
        <Bar className="h-3 w-full" />
        <Bar className="h-3 w-11/12" />
        <Bar className="h-3 w-4/5" />
      </div>
      <div className="space-y-2">
        <Bar className="h-3 w-2/3" />
        <Bar className="h-3 w-full" />
      </div>
      <Bar className="h-3 w-1/3" />
      <div className="space-y-2">
        <Bar className="h-3 w-full" />
        <Bar className="h-3 w-5/6" />
        <Bar className="h-3 w-1/2" />
      </div>
    </div>
  );
}

/** Source files: a gutter strip next to monospace-ish lines. */
function CodeSkeleton() {
  const widths = ["w-11/12", "w-3/4", "w-full", "w-2/3", "w-5/6", "w-1/2", "w-4/5", "w-full", "w-3/5", "w-11/12", "w-7/12", "w-full", "w-3/4", "w-1/2"];
  return (
    <div className="flex w-full max-w-3xl gap-4 py-2" aria-hidden>
      <div className="flex w-8 shrink-0 flex-col gap-2.5 pt-0.5">
        {widths.map((_, index) => <Bar key={index} className="h-2.5 w-full opacity-60" />)}
      </div>
      <div className="flex min-w-0 flex-1 flex-col gap-2.5">
        {widths.map((width, index) => <Bar key={index} className={cn("h-2.5", width)} />)}
      </div>
    </div>
  );
}

/** Tabular data: a stronger header row above uniform rows of cells. */
function TableSkeleton() {
  return (
    <div className="w-full max-w-3xl overflow-hidden rounded-lg border" aria-hidden>
      <div className="grid grid-cols-6 border-b bg-muted/70">
        {Array.from({ length: 6 }, (_, index) => <div key={index} className="animate-pulse h-7 border-r last:border-r-0 bg-muted" />)}
      </div>
      {Array.from({ length: 9 }, (_, row) => (
        <div key={row} className="grid grid-cols-6 border-b last:border-b-0">
          {Array.from({ length: 6 }, (_, column) => (
            <div key={column} className="flex items-center border-r px-2 py-1.5 last:border-r-0">
              <Bar className={cn("h-2.5", row % 3 === column % 4 ? "w-3/5" : "w-4/5")} />
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}

/** Paginated documents (PDF, Office): a sheet of paper with text lines. */
function PageSkeleton() {
  return (
    <div className="flex h-full max-h-full w-full max-w-[620px] justify-center" aria-hidden>
      <div className="aspect-[1/1.414] max-h-full w-full rounded-md border bg-card p-8 shadow-sm">
        <Bar className="mb-6 h-5 w-1/3" />
        <div className="space-y-2.5">
          <Bar className="h-2.5 w-full" />
          <Bar className="h-2.5 w-full" />
          <Bar className="h-2.5 w-11/12" />
          <Bar className="h-2.5 w-full" />
        </div>
        <div className="mt-6 space-y-2.5">
          <Bar className="h-2.5 w-full" />
          <Bar className="h-2.5 w-5/6" />
          <Bar className="h-2.5 w-2/3" />
        </div>
        <div className="mt-6 space-y-2.5">
          <Bar className="h-2.5 w-full" />
          <Bar className="h-2.5 w-9/12" />
        </div>
      </div>
    </div>
  );
}

/** Images: a centered frame the picture will occupy. */
function ImageSkeleton() {
  return (
    <div className="flex size-full max-h-[420px] max-w-[560px] items-center justify-center rounded-lg border border-dashed bg-muted/20" aria-hidden>
      <div className="animate-pulse size-16 rounded-2xl bg-muted" />
    </div>
  );
}

/** Audio/video: player chrome with an unsettled progress bar. */
function MediaSkeleton() {
  return (
    <div className="w-full max-w-2xl space-y-3" aria-hidden>
      <div className="flex aspect-video items-center justify-center rounded-xl bg-neutral-200 dark:bg-neutral-800">
        <div className="animate-pulse size-12 rounded-full bg-neutral-300 dark:bg-neutral-700" />
      </div>
      <div className="flex items-center gap-3 px-1">
        <div className="animate-pulse size-8 shrink-0 rounded-full bg-muted" />
        <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
          <div className="editor-skeleton-progress h-full w-1/4 rounded-full bg-primary/40" />
        </div>
        <Bar className="h-2 w-8" />
      </div>
    </div>
  );
}

/** Drawing canvas: the dot grid the canvas will paint on. */
function CanvasSkeleton() {
  return (
    <div className="relative size-full overflow-hidden rounded-lg border border-dashed" aria-hidden>
      <div
        className="absolute inset-0 opacity-60"
        style={{ backgroundImage: "radial-gradient(color-mix(in oklab, var(--muted-foreground) 32%, transparent) 1px, transparent 1px)", backgroundSize: "22px 22px" }}
      />
    </div>
  );
}

/** Notebooks: a stack of code and output cells. */
function NotebookSkeleton() {
  return (
    <div className="w-full max-w-2xl space-y-3" aria-hidden>
      <div className="rounded-lg border p-4">
        <Bar className="mb-3 h-2.5 w-1/4" />
        <div className="space-y-2">
          <Bar className="ml-4 h-2.5 w-5/6" />
          <Bar className="ml-4 h-2.5 w-2/3" />
        </div>
      </div>
      <div className="rounded-lg border border-dashed p-4">
        <Bar className="h-2.5 w-1/2" />
      </div>
      <div className="rounded-lg border p-4">
        <div className="space-y-2">
          <Bar className="h-2.5 w-full" />
          <Bar className="h-2.5 w-4/5" />
        </div>
      </div>
    </div>
  );
}

/** Form builder: labelled fields and a submit affordance. */
function FormSkeleton() {
  return (
    <div className="w-full max-w-md space-y-5" aria-hidden>
      <Bar className="h-5 w-2/5" />
      {Array.from({ length: 3 }, (_, index) => (
        <div key={index} className="space-y-2">
          <Bar className="h-2.5 w-24" />
          <div className="animate-pulse h-9 rounded-md border bg-muted/40" />
        </div>
      ))}
      <div className="animate-pulse h-9 w-24 rounded-md bg-primary/25" />
    </div>
  );
}

function GenericSkeleton() {
  return (
    <div className="w-full max-w-md space-y-3" aria-hidden>
      <Bar className="h-3 w-full" />
      <Bar className="h-3 w-5/6" />
      <Bar className="h-3 w-2/3" />
    </div>
  );
}
