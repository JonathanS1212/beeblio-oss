"use client";

import { useCallback, useEffect, useState } from "react";
import { HardDrive } from "lucide-react";

import { cn } from "@/lib/utils";
import { getStorageUsage } from "../storage-actions";

type StorageUsage = {
  usedBytes: number;
  /** null = unlimited (admins). */
  quotaBytes: number | null;
};

export function formatStorageBytes(bytes: number): string {
  if (bytes >= 1024 ** 3) {
    const gib = bytes / 1024 ** 3;
    return `${gib >= 10 ? gib.toFixed(0) : gib.toFixed(1)} GB`;
  }
  if (bytes >= 1024 ** 2) {
    const mib = bytes / 1024 ** 2;
    return `${mib >= 10 ? mib.toFixed(0) : mib.toFixed(1)} MB`;
  }
  return `${Math.max(0, Math.round(bytes / 1024))} KB`;
}

/**
 * Workspace storage meter for the left rail. The agent owns the filesystem,
 * so usage comes from the storage API; it refreshes after agent turns and
 * uploads (window events) so near-quota states surface promptly.
 */
export function StorageMeter({ initial }: { initial: StorageUsage | null }) {
  const [usage, setUsage] = useState<StorageUsage | null>(initial);

  const refresh = useCallback(async () => {
    try {
      const next = await getStorageUsage();
      if (next) setUsage(next);
    } catch {
      // The agent may be unreachable; keep showing the last known value.
    }
  }, []);

  useEffect(() => {
    void refresh();
    const onWorkspaceChanged = () => void refresh();
    window.addEventListener("beeblio:workspace-changed", onWorkspaceChanged);
    window.addEventListener("beeblio:storage-changed", onWorkspaceChanged);
    return () => {
      window.removeEventListener("beeblio:workspace-changed", onWorkspaceChanged);
      window.removeEventListener("beeblio:storage-changed", onWorkspaceChanged);
    };
  }, [refresh]);

  if (!usage) return null;

  if (usage.quotaBytes === null) {
    return (
      <div
        className="flex h-9 items-center gap-2 rounded-lg px-2.5 text-xs font-medium text-muted-foreground"
        title={`Using ${formatStorageBytes(usage.usedBytes)} (unlimited admin storage)`}
      >
        <HardDrive className="size-[17px] shrink-0" aria-hidden="true" />
        <span className="truncate">{formatStorageBytes(usage.usedBytes)} stored</span>
      </div>
    );
  }

  const quota = Math.max(1, usage.quotaBytes);
  const percent = Math.min(100, Math.round((usage.usedBytes / quota) * 100));
  const atLimit = usage.usedBytes >= usage.quotaBytes;
  const nearLimit = percent >= 85;

  return (
    <div
      className={cn(
        "flex h-9 w-full flex-col justify-center gap-1 rounded-lg px-2.5",
        (atLimit || nearLimit) && "px-2 py-1.5",
      )}
      title={
        atLimit
          ? "Your workspace is full. Delete files or upgrade your plan to add more."
          : `${formatStorageBytes(usage.usedBytes)} of ${formatStorageBytes(usage.quotaBytes)} used`
      }
    >
      <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
        <HardDrive
          className={cn("size-[15px] shrink-0", atLimit && "text-destructive")}
          aria-hidden="true"
        />
        <span className={cn("truncate", atLimit && "text-destructive font-semibold")}>
          {atLimit
            ? "Storage full"
            : `${formatStorageBytes(usage.usedBytes)} / ${formatStorageBytes(usage.quotaBytes)}`}
        </span>
      </div>
      <div
        className="h-1 w-full overflow-hidden rounded-full bg-muted"
        role="progressbar"
        aria-label="Workspace storage used"
        aria-valuenow={percent}
        aria-valuemin={0}
        aria-valuemax={100}
      >
        <div
          className={cn(
            "h-full rounded-full transition-[width] duration-300",
            atLimit ? "bg-destructive" : nearLimit ? "bg-amber-500" : "bg-primary/70",
          )}
          style={{ width: `${Math.max(percent, usage.usedBytes > 0 ? 2 : 0)}%` }}
        />
      </div>
    </div>
  );
}
