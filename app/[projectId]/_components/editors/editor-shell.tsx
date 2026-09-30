"use client";

import { useEffect, useRef, useState, useCallback, type ReactNode } from "react";
import { Check, CloudCheck, Download, SquareArrowOutUpRight, Loader2, Maximize, Save, type LucideIcon } from "lucide-react";

import { Brand } from "@/app/_components/brand";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useWorkspaceDownload } from "../use-workspace-download";
import { ShareButton } from "./share-button";
import { CopyToWorkspaceButton } from "./copy-to-workspace-button";
import { DiscardChangesButton } from "./discard-changes-button";
import { InlineDiffView } from "./inline-diff-view";
import { Pencil } from "lucide-react";
import { isUntitledDraftPath } from "@/lib/untitled-draft";
import { WORKSPACE_CHANGED_EVENT, type WorkspaceChangedDetail } from "@/lib/workspace-change";
import type { DocumentDefaultSettings } from "@/lib/project-settings";
import { usePublicView } from "../../../share/[shareId]/_components/public-view-context";
import { useWorkspaceContext } from "../workspace-context";

export interface EditorViewModeOption {
  value: string;
  label: string;
  icon: LucideIcon;
  /** Richer tooltip text; falls back to the label. */
  title?: string;
}

export function EditorShell({
  path,
  sourceUrl,
  actions,
  downloadAction,
  status,
  leadingActions,
  viewModes,
  save,
  discard,
  review,
  openUrl,
  dirty = false,
  shareable = true,
  children,
}: {
  path: string;
  sourceUrl?: string;
  /** Editor-specific controls (sheet selector, Format, Edit All…) rendered before the file utilities. */
  actions?: ReactNode;
  downloadAction?: ReactNode;
  status?: ReactNode;
  /** Controls anchored in the left status cluster (after the status text). */
  leadingActions?: ReactNode;
  /** Segmented view-mode groups, rendered as icon toggles left of the action cluster. */
  viewModes?: {
    value: string;
    onChange: (value: string) => void;
    options: EditorViewModeOption[];
  }[];
  /** Omit on viewers; when provided, the save group renders at the far right. */
  save?: {
    onClick: () => void;
    saving?: boolean;
    /** Editor-specific blockers such as parse errors. */
    disabled?: boolean;
  };
  discard?: {
    onDiscard: () => void;
    disabled?: boolean;
  };
  review?: {
    onAccept: () => boolean | Promise<boolean>;
    onReject: () => void;
    proposed: string;
    local: string;
    mode?: "stage" | "commit";
    focus?: { before: string; after: string };
    documentDefaults?: DocumentDefaultSettings;
  };
  /** Renders an icon-only "open in new tab" utility; pass the raw file URL on viewers. */
  openUrl?: string;
  dirty?: boolean;
  shareable?: boolean;
  children: ReactNode;
}) {
  const { shareId, isOwner, projectSlug, filePath } = usePublicView();
  const { pinFile } = useWorkspaceContext();
  const isPublicRoute = !!shareId;
  const untitled = isUntitledDraftPath(path);
  const projectId = isPublicRoute ? (projectSlug || "") : (typeof window !== "undefined" ? window.location.pathname.split("/").filter(Boolean)[0] : "");
  const filename = path.split("/").at(-1) || path;
  const { download, downloading } = useWorkspaceDownload(sourceUrl, path);
  const fingerprintRef = useRef<string | undefined>(undefined);
  const initialFingerprintRef = useRef<{ url: string; promise: Promise<string> } | undefined>(undefined);
  const dirtyRef = useRef(dirty);
  const actionsRef = useRef<HTMLDivElement>(null);
  const [syncState, setSyncState] = useState<"idle" | "checking" | "updated" | "reloading">("idle");
  const [agentEditCalls, setAgentEditCalls] = useState<Set<string>>(() => new Set());
  const [fullscreen, setFullscreen] = useState(false);

  useEffect(() => {
    setAgentEditCalls(new Set());
    const onAgentEdit = (event: Event) => {
      const detail = (event as CustomEvent<{
        projectId?: string;
        path: string;
        callId: string;
        editing: boolean;
      }>).detail;
      if (detail?.projectId !== projectId || detail.path !== path) return;
      setAgentEditCalls((current) => {
        const next = new Set(current);
        if (detail.editing) next.add(detail.callId);
        else next.delete(detail.callId);
        return next;
      });
    };
    window.addEventListener("beeblio:agent-file-edit", onAgentEdit);
    return () => window.removeEventListener("beeblio:agent-file-edit", onAgentEdit);
  }, [path, projectId]);

  useEffect(() => {
    dirtyRef.current = dirty;
    if (dirty) pinFile(path);
  }, [dirty, path, pinFile]);

  useEffect(() => {
    const syncFullscreen = () => setFullscreen(!!document.fullscreenElement);
    document.addEventListener("fullscreenchange", syncFullscreen);
    return () => document.removeEventListener("fullscreenchange", syncFullscreen);
  }, []);

  const toggleFullscreen = () => {
    if (document.fullscreenElement) {
      document.exitFullscreen().catch(() => undefined);
    } else {
      document.documentElement.requestFullscreen().catch(() => undefined);
    }
  };

  useEffect(() => {
    const clickSaveButton = (event: KeyboardEvent) => {
      const isSaveShortcut =
        event.key?.toLowerCase() === "s" &&
        (event.metaKey || event.ctrlKey) &&
        !event.altKey &&
        !event.shiftKey;
      if (!isSaveShortcut) return;

      const saveButton = actionsRef.current?.querySelector<HTMLButtonElement>('[data-action="save"]');
      if (!saveButton) return;

      event.preventDefault();
      event.stopPropagation();
      if (!event.repeat) saveButton.click();
    };

    window.addEventListener("keydown", clickSaveButton, true);
    return () => window.removeEventListener("keydown", clickSaveButton, true);
  }, []);

  useEffect(() => {
    if (isUntitledDraftPath(path)) return;

    // A re-path (rename/move of the open file) resubscribes this effect; the
    // in-flight check from the old path is cancelled and can no longer reset
    // the state, so start fresh here or "Checking for updates" spins forever.
    setSyncState("idle");

    let cancelled = false;
    const encodedPath = path.split("/").map(encodeURIComponent).join("/");
    const resolvedUrl = sourceUrl ?? `/api/workspace/${encodeURIComponent(projectId)}/${encodedPath}`;

    // Change detection rides cheap HEAD metadata instead of the body: the
    // ETag when the storage host exposes it cross-origin, otherwise the
    // CORS-safelisted Last-Modified and Content-Length pair. A HEAD never
    // streams file bytes, so an open editor (or a workspace-change storm
    // during an agent turn) cannot re-download a large media file just to
    // notice whether it changed. Exposing ETag in the storage bucket's CORS
    // responseHeaders upgrades the fallback pair to a strong validator.
    const fingerprint = async () => {
      const response = await fetch(resolvedUrl, { method: "HEAD", cache: "no-store" });
      if (!response.ok) throw new Error("Unable to check file version");
      const etag = response.headers.get("etag");
      if (etag) return etag;
      const length = response.headers.get("content-length");
      const modified = response.headers.get("last-modified");
      return `${length ?? "*"}:${modified ?? "*"}`;
    };

    const initialFingerprint = initialFingerprintRef.current?.url === resolvedUrl
      ? initialFingerprintRef.current.promise
      : fingerprint();
    initialFingerprintRef.current = { url: resolvedUrl, promise: initialFingerprint };
    void initialFingerprint.then((value) => { if (!cancelled) fingerprintRef.current = value; }).catch(() => undefined);
    const checkForUpdate = (event: Event) => {
      const hasKnownContent = (event as CustomEvent<WorkspaceChangedDetail>).detail?.files
        ?.some((file) => file.path === path);
      if (hasKnownContent) {
        setSyncState("idle");
        // Keep the conditional-request validator current without showing a
        // redundant checking/reloading cycle; the editor already received the
        // exact bytes returned by the completed mutation.
        void fingerprint().then((value) => {
          if (!cancelled) fingerprintRef.current = value;
        }).catch(() => undefined);
        return;
      }
      setSyncState("checking");
      void fingerprint()
        .then((value) => {
          if (cancelled) return;
          if (fingerprintRef.current && fingerprintRef.current !== value) {
            if (dirtyRef.current) {
              setSyncState("updated");
            } else {
              setSyncState("reloading");
              window.dispatchEvent(new CustomEvent("beeblio:reload-workspace-file", { detail: { path } }));
            }
          } else {
            setSyncState("idle");
          }
          fingerprintRef.current = value;
        })
        .catch(() => { if (!cancelled) setSyncState("idle"); });
    };
    window.addEventListener(WORKSPACE_CHANGED_EVENT, checkForUpdate);
    const markReloaded = (event: Event) => {
      const detail = (event as CustomEvent<{ path?: string }>).detail;
      if (detail?.path === path) setSyncState("idle");
    };
    window.addEventListener("beeblio:workspace-file-reloaded", markReloaded);
    return () => {
      cancelled = true;
      window.removeEventListener(WORKSPACE_CHANGED_EVENT, checkForUpdate);
      window.removeEventListener("beeblio:workspace-file-reloaded", markReloaded);
    };
  }, [path, sourceUrl]);

  const reloadUpdatedFile = useCallback(() => {
    setSyncState("reloading");
    window.dispatchEvent(new CustomEvent("beeblio:reload-workspace-file", { detail: { path } }));
  }, [path]);

  useEffect(() => {
    if (syncState === "updated") {
      reloadUpdatedFile();
    }
  }, [syncState, reloadUpdatedFile]);

  useEffect(() => {
    if (!dirty && syncState === "updated") {
      reloadUpdatedFile();
    }
  }, [dirty, syncState, reloadUpdatedFile]);

  const [showReview, setShowReview] = useState(false);

  // Auto-open diff view when the AI proposes new content
  useEffect(() => {
    if (review) setShowReview(true);
    else setShowReview(false);
  }, [review]);

  const showDiscard = !isPublicRoute && dirty && discard && !discard.disabled;
  const showSaveGroup = !isPublicRoute && save;

  return (
    <div className="flex h-full min-h-0 flex-col bg-card">
      {!fullscreen && (
      <header className="h-10 shrink-0 touch-pan-x overflow-x-auto overflow-y-hidden border-b">
        <div className="flex h-full w-max min-w-full items-center gap-3 whitespace-nowrap px-2">
          {isPublicRoute && (
            <Brand small className="shrink-0" />
          )}
          <div className="mr-auto flex shrink-0 items-center gap-2">
            {agentEditCalls.size > 0 && syncState === "idle" ? <span className="flex items-center gap-1.5 text-xs font-medium text-emerald-700 dark:text-emerald-400" role="status"><Loader2 className="size-3.5 animate-spin" />Agent editing</span> : null}
            {syncState === "checking" ? <span className="flex items-center gap-1.5 text-xs text-muted-foreground"><Loader2 className="size-3.5 animate-spin" />Checking for Updates</span> : null}
            {syncState === "reloading" ? <span className="flex items-center gap-1.5 text-xs font-medium text-emerald-700 dark:text-emerald-400"><Loader2 className="size-3.5 animate-spin" />Updated by AI · Refreshing</span> : null}
            {syncState === "updated" && dirty && !review ? <span className="flex items-center gap-1.5 rounded-md border border-amber-500/40 px-2 py-1 text-xs font-medium text-amber-700 dark:text-amber-400"><CloudCheck className="size-3.5" />AI Version Available · Save or Discard Your Changes First</span> : null}
            {review ? <Button size="xs" variant="outline" className="border-amber-500/30 text-amber-700 dark:text-amber-400" onClick={() => setShowReview(true)}><CloudCheck className="size-3.5" />AI Version Available · Review Changes</Button> : null}
            {syncState === "updated" && !dirty ? <Button size="xs" variant="outline" className="border-emerald-500/30 text-emerald-700 dark:text-emerald-400" onClick={reloadUpdatedFile}><CloudCheck />Updated by AI · Reload</Button> : null}
            {syncState === "idle" && !review && status ? status : null}
            {!isPublicRoute && leadingActions}
          </div>
          <div ref={actionsRef} className="flex shrink-0 items-center gap-1.5">
            {viewModes?.map((group) => (
              <div key={group.options.map((option) => option.value).join("|")} className="flex items-center rounded-md border bg-muted/30 p-0.5">
                {group.options.map((option) => (
                  <Tooltip key={option.value}>
                    <TooltipTrigger asChild>
                      <Button
                        size="icon-xs"
                        variant={group.value === option.value ? "secondary" : "ghost"}
                        onClick={() => group.onChange(option.value)}
                        aria-label={option.label}
                        aria-pressed={group.value === option.value}
                      >
                        <option.icon />
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>{option.title ?? option.label}</TooltipContent>
                  </Tooltip>
                ))}
              </div>
            ))}
            {!isPublicRoute && actions}
            {!isPublicRoute && openUrl && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button size="icon-sm" variant="ghost" className="shrink-0 text-muted-foreground hover:text-foreground" asChild>
                    <a href={openUrl} target="_blank" rel="noreferrer" aria-label="Open in new tab">
                      <SquareArrowOutUpRight />
                    </a>
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Open in a New Tab</TooltipContent>
              </Tooltip>
            )}
            {shareable && !isPublicRoute && !untitled && projectId && <ShareButton projectId={projectId} filePath={path} />}
            {!untitled && (downloadAction ?? <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  size="icon-sm"
                  variant="ghost"
                  className="shrink-0 text-muted-foreground hover:text-foreground"
                  disabled={downloading}
                  onClick={() => void download()}
                  aria-label={`Download ${filename}`}
                >
                  {downloading ? <Loader2 className="animate-spin" /> : <Download />}
                </Button>
              </TooltipTrigger>
              <TooltipContent>Download the last saved version</TooltipContent>
            </Tooltip>)}
            {isPublicRoute && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    size="icon-sm"
                    variant="ghost"
                    className="shrink-0"
                    onClick={toggleFullscreen}
                    aria-label="Full screen"
                  >
                    <Maximize />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>View in full screen</TooltipContent>
              </Tooltip>
            )}
            {isPublicRoute && isOwner && projectSlug && filePath ? (
              <>
                <span className="mx-0.5 h-5 w-px shrink-0 self-center bg-border" />
                <Button size="sm" onClick={() => { window.location.href = `/${projectSlug}?file=${encodeURIComponent(filePath)}`; }}>
                  <Pencil />Edit
                </Button>
              </>
            ) : isPublicRoute && !isOwner && shareId ? (
              <>
                <span className="mx-0.5 h-5 w-px shrink-0 self-center bg-border" />
                <CopyToWorkspaceButton shareId={shareId} filePath={path} />
              </>
            ) : null}
            {showSaveGroup && (
              <>
                <span className="mx-0.5 h-5 w-px shrink-0 self-center bg-border" />
                {showDiscard && <DiscardChangesButton dirty onDiscard={discard!.onDiscard} />}
                <SaveControl dirty={dirty} onClick={save!.onClick} saving={save!.saving} disabled={save!.disabled} />
              </>
            )}
          </div>
        </div>
      </header>
      )}
      <div className="min-h-0 flex-1 overflow-hidden bg-muted/10">
        {showReview && review ? (
          <InlineDiffView
            projectId={projectId}
            filePath={path}
            local={review.local}
            proposed={review.proposed}
            mode={review.mode}
            focus={review.focus}
            documentDefaults={review.documentDefaults}
            onAccept={async () => {
              const accepted = await review.onAccept();
              if (accepted !== false) setShowReview(false);
              return accepted;
            }}
            onReject={() => {
              review.onReject();
              setShowReview(false);
            }}
          />
        ) : (
          children
        )}
      </div>
    </div>
  );
}

/**
 * The save affordance doubles as the save state: quiet "Saved" when clean
 * (no brand color on screen), primary "Save" pinned at the far right when
 * there is something to write back.
 */
function SaveControl({ dirty, saving, disabled, onClick }: { dirty: boolean; saving?: boolean; disabled?: boolean; onClick: () => void }) {
  if (!dirty && !saving) {
    return (
      <span className="flex h-8 items-center gap-1.5 px-1 text-xs font-medium text-muted-foreground" aria-live="polite">
        <Check className="size-3.5 text-emerald-600 dark:text-emerald-400" />Saved
      </span>
    );
  }
  return (
    <Button size="sm" data-action="save" onClick={onClick} disabled={disabled || saving}>
      {saving ? <Loader2 className="animate-spin" /> : <Save />}Save
    </Button>
  );
}
