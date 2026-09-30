import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

/**
 * Indeterminate sweep for in-flight uploads (see .upload-progress-run in
 * globals.css). Deliberately not byte-accurate: attaching upload progress
 * listeners to the signed storage POST would force a CORS preflight the
 * bucket may not answer, so the row animates until the upload resolves.
 */
export function UploadProgressBar({ className }: { className?: string }) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        "pointer-events-none absolute inset-x-1.5 bottom-0 h-0.5 overflow-hidden rounded-full bg-primary/15",
        className,
      )}
    >
      <span className="upload-progress-run absolute inset-y-0 left-0 w-1/3 rounded-full bg-primary/75" />
    </span>
  );
}

/**
 * Grayed, non-interactive stand-in for a file still travelling to storage:
 * the same icon and name as the row it becomes, an "Uploading…" status, and a
 * progress sweep along the bottom edge. It disappears the moment the upload
 * resolves — into the real row on success, or nothing on failure.
 */
export function PendingUploadRow({
  icon,
  name,
  detail,
  className,
}: {
  icon: ReactNode;
  name: string;
  detail?: string;
  className?: string;
}) {
  return (
    <div
      aria-busy="true"
      title={`Uploading ${name}…`}
      className={cn(
        "relative flex w-full min-w-0 cursor-default items-center gap-2 rounded-md px-2 py-1.5 text-muted-foreground/80",
        className,
      )}
    >
      <span className="shrink-0 opacity-70">{icon}</span>
      <span className="min-w-0 flex-1 truncate text-sm">{name}</span>
      {detail ? (
        <span className="shrink-0 text-[10px] tabular-nums text-muted-foreground/70">{detail}</span>
      ) : null}
      <span className="shrink-0 text-[10px] text-muted-foreground/70">Uploading…</span>
      <UploadProgressBar />
    </div>
  );
}
