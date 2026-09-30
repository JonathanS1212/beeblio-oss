import { AlertCircle } from "lucide-react";

import { EditorSkeleton } from "./editor-skeleton";
import { skeletonKindFor } from "./registry";

/**
 * Loading state for an opening file. The file name selects the skeleton shape
 * (prose, table, media chrome, …) via the editor registry, and the optional
 * size grounds the caption; without a name it falls back to plain bars.
 */
export function EditorLoading({ name, size, label }: { name?: string; size?: number; label?: string }) {
  return <EditorSkeleton kind={name ? skeletonKindFor(name) : "generic"} name={name} size={size} label={label} />;
}

export function EditorError({ message }: { message: string }) {
  return <div className="flex h-full flex-col items-center justify-center gap-2 p-6 text-center"><AlertCircle className="size-5 text-destructive" /><p className="text-sm font-medium">Unable to open file</p><p className="max-w-sm text-xs text-muted-foreground">{message}</p></div>;
}
