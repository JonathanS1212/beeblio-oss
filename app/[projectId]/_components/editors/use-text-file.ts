"use client";

import { useCallback, useEffect, useId, useRef, useState } from "react";
import { toast } from "sonner";

import { useWorkspaceContext } from "../workspace-context";
import { usePublicView } from "@/app/share/[shareId]/_components/public-view-context";
import { isUntitledDraftPath } from "@/lib/untitled-draft";
import { PROJECT_BIBLIOGRAPHY_PATH } from "@/lib/project-bibliography";
import { announceWorkspaceChange, WORKSPACE_CHANGED_EVENT, type WorkspaceChangedDetail } from "@/lib/workspace-change";
import { uploadWorkspaceFile } from "@/lib/workspace-upload";
import {
  DOCUMENT_REVIEW_ACCEPTED_EVENT,
  DOCUMENT_REVIEW_PROPOSAL_EVENT,
  DOCUMENT_REVIEW_REJECTED_EVENT,
  type DocumentReviewAcceptedDetail,
  type DocumentReviewProposalDetail,
  type DocumentReviewRejectedDetail,
} from "@/lib/document-review";
import { getFileContent } from "../../file-actions";
import {
  cachedTextNeedsRevalidation,
  readCachedText,
  writeCachedText,
} from "./text-content-cache";
import {
  clearTextDraft,
  moveTextDraftKey,
  readTextDraft,
  writeTextDraft,
} from "./text-draft-cache";

async function fetchShareFileText(shareId: string, filePath: string): Promise<string | null> {
  const encoded = filePath.split("/").map(encodeURIComponent).join("/");
  const response = await fetch(`/api/share/${encodeURIComponent(shareId)}/${encoded}`, { cache: "no-store" });
  if (!response.ok) return null;
  return await response.text();
}

type UseTextFileOptions = {
  /**
   * Apply an AI-originated file update to this mounted editor instead of
   * letting FileViewer recreate the whole editor tree.
   */
  refreshOnExternalChange?: boolean;
};

export function useTextFile(
  projectId: string,
  filePath: string,
  onSaved?: () => void,
  { refreshOnExternalChange = true }: UseTextFileOptions = {},
) {
  const registrationId = useId();
  const { registerEditor, unregisterEditor, saveUntitledDraft } = useWorkspaceContext();
  const publicView = usePublicView();
  const untitled = isUntitledDraftPath(filePath);
  // Share views are session-independent; the content cache is only coherent
  // inside the owning workspace, so it is skipped there (and for drafts).
  const cacheable = !untitled && !publicView.shareId;
  const initialCached = cacheable ? readCachedText(filePath) : undefined;
  // Unsaved drafts survive tab switches (which unmount this editor) and page
  // reloads through the draft store. Untitled drafts are eligible too — their
  // content exists nowhere else — but share views stay out (read-only).
  const draftStoreEligible = !publicView.shareId;
  const initialDraft = draftStoreEligible ? readTextDraft(projectId, filePath) : undefined;
  const [content, setContent] = useState(() => initialCached ?? "");
  const [draft, setDraft] = useState(() => initialDraft ?? initialCached ?? "");
  // True when this mount restored an unsaved draft, so the initial load must
  // keep it (record the saved baseline only) instead of replacing the text.
  const restoredDraftRef = useRef(initialDraft !== undefined && initialDraft !== initialCached);
  const [editorVersion, setEditorVersion] = useState(0);
  const [loading, setLoading] = useState(() => !untitled && initialCached === undefined);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string>();
  const [proposedContent, setProposedContent] = useState<string>();
  const [proposedReviewMode, setProposedReviewMode] = useState<"stage" | "commit">("commit");
  const [proposedReviewFocus, setProposedReviewFocus] = useState<{ before: string; after: string }>();
  const [pendingReviewCommit, setPendingReviewCommit] = useState<{
    content: string;
    findingIds: string[];
  }>();
  const proposedReviewFindingIdsRef = useRef<string[]>([]);
  const proposedReviewModeRef = useRef<"stage" | "commit">("commit");
  const contentRef = useRef(content);
  const draftRef = useRef(draft);
  const dirtyRef = useRef(false);
  const loadRequestRef = useRef(0);

  const dirty = untitled || draft !== content;

  useEffect(() => {
    contentRef.current = content;
    draftRef.current = draft;
    dirtyRef.current = isUntitledDraftPath(filePath) || draft !== content;
    // Write-through draft store: an entry exists exactly while the editor is
    // dirty. Saves and discards collapse draft onto content, clearing the
    // entry through this same effect.
    if (!draftStoreEligible) return;
    if (draft !== content) writeTextDraft(projectId, filePath, draft);
    else clearTextDraft(projectId, filePath);
  }, [content, draft, draftStoreEligible, filePath, projectId]);

  // A rename/move or an untitled Save As re-paths a mounted editor; carry any
  // stored draft along so the entry matches the path the tab now saves under.
  const previousPathRef = useRef({ projectId, filePath });
  useEffect(() => {
    const previous = previousPathRef.current;
    if (previous.projectId === projectId && previous.filePath === filePath) return;
    previousPathRef.current = { projectId, filePath };
    moveTextDraftKey(previous.projectId, previous.filePath, filePath);
  }, [filePath, projectId]);

  const replaceWithSavedContent = useCallback((next: string) => {
    contentRef.current = next;
    draftRef.current = next;
    dirtyRef.current = false;
    setContent(next);
    setDraft(next);
  }, []);

  const loadFromNetwork = useCallback(async ({
    background = false,
    replaceIfDraftEquals,
  }: { background?: boolean; replaceIfDraftEquals?: string } = {}) => {
    const request = ++loadRequestRef.current;
    if (!background) {
      setLoading(true);
      setError(undefined);
    }

    try {
      // Share views are session-independent and resolve the project by share
      // id; the slug-keyed action would be ambiguous when several owners
      // publish the same slug and path.
      const value = publicView.shareId
        ? await fetchShareFileText(publicView.shareId, filePath)
        : await getFileContent(projectId, filePath);
      // Tool writes can complete in quick succession. Only the latest
      // request may update the mounted editor or its conflict proposal.
      if (request !== loadRequestRef.current) return false;
      if (value === null) {
        setError("The file could not be read.");
        return false;
      }

      // The user could begin typing while the background request is in flight.
      // Never replace that newer local work with the agent's version — but a
      // value identical to the saved baseline is not a conflict, just a
      // revalidation of an unchanged file (e.g. after restoring a stored
      // draft), so there is nothing to propose.
      if (background && dirtyRef.current) {
        // Inline agent edits are based on the exact editor snapshot sent with
        // the turn. Apply the resulting file directly only if the user has not
        // typed anything else in the meantime; otherwise keep the normal
        // conflict/proposal path below.
        if (replaceIfDraftEquals !== undefined && draftRef.current === replaceIfDraftEquals) {
          const changed = value !== contentRef.current;
          setProposedContent(undefined);
          if (cacheable) writeCachedText(filePath, value);
          replaceWithSavedContent(value);
          if (changed) setEditorVersion((version) => version + 1);
          return true;
        }
        if (value !== contentRef.current) {
          setProposedContent(value);
        } else {
          setProposedContent(undefined);
          if (cacheable) writeCachedText(filePath, value);
        }
        return false;
      }

      setProposedContent(undefined);

      if (cacheable) writeCachedText(filePath, value);
      // First open after restoring an unsaved draft: the draft wins. Record
      // the fetched value as the saved baseline only — replacing the text
      // would wipe the restored edits. Live background reloads reconcile
      // conflicts through proposedContent instead (the branch above).
      if (!background && restoredDraftRef.current && value !== draftRef.current) {
        restoredDraftRef.current = false;
        contentRef.current = value;
        setContent(value);
        return true;
      }
      restoredDraftRef.current = false;
      const changed = value !== contentRef.current;
      replaceWithSavedContent(value);
      if (changed) setEditorVersion((version) => version + 1);
      return true;
    } catch {
      if (request === loadRequestRef.current) setError("The file could not be read.");
      return false;
    } finally {
      if (request === loadRequestRef.current) setLoading(false);
    }
  }, [cacheable, filePath, projectId, publicView.shareId, replaceWithSavedContent]);

  const load = useCallback(async ({
    background = false,
    replaceIfDraftEquals,
  }: { background?: boolean; replaceIfDraftEquals?: string } = {}) => {
    if (isUntitledDraftPath(filePath)) {
      if (restoredDraftRef.current) {
        // The restored draft is the only copy of this untitled work; a
        // remount must not reset it to an empty document.
        restoredDraftRef.current = false;
      } else {
        replaceWithSavedContent("");
      }
      setLoading(false);
      setError(undefined);
      return true;
    }

    // Cache-first open: render the remembered content synchronously and skip
    // the network. Stale entries (older than the revalidation window) refresh
    // in the background; fresh ones trust the event-driven invalidation.
    // Background reloads always go to the network.
    const cached = cacheable && !background ? readCachedText(filePath) : undefined;
    if (cached !== undefined) {
      if (restoredDraftRef.current && cached !== draftRef.current) {
        // The restored draft wins over the cached baseline; `content` was
        // already seeded from the same cache entry at mount.
        restoredDraftRef.current = false;
        setLoading(false);
        setError(undefined);
        if (cachedTextNeedsRevalidation(filePath)) {
          void loadFromNetwork({ background: true });
        }
        return true;
      }
      restoredDraftRef.current = false;
      replaceWithSavedContent(cached);
      setLoading(false);
      setError(undefined);
      if (cachedTextNeedsRevalidation(filePath)) {
        void loadFromNetwork({ background: true });
      }
      return true;
    }

    return loadFromNetwork({ background, replaceIfDraftEquals });
  }, [cacheable, filePath, loadFromNetwork, replaceWithSavedContent]);

  // Mount-only: switching files remounts the editor (FileViewer keys it per
  // open instance), and a rename or move changes the path without changing
  // the file's bytes — reloading on that path change would clobber unsaved
  // edits. External changes still arrive via the reload listener below.
  // The started-ref keeps this to one run per mount: React StrictMode (on by
  // default in Next dev) invokes effects twice, and a second invocation would
  // consume restoredDraftRef and replace a restored draft with the saved
  // content — exactly the "edits disappear when I switch back" symptom.
  const initialLoadRef = useRef(load);
  const initialLoadStartedRef = useRef(false);
  useEffect(() => {
    if (initialLoadStartedRef.current) return;
    initialLoadStartedRef.current = true;
    void initialLoadRef.current();
  }, []);

  useEffect(() => {
    if (!refreshOnExternalChange || isUntitledDraftPath(filePath)) return;

    const reload = (event: Event) => {
      const detail = (event as CustomEvent<{ path?: string; replaceIfDraftEquals?: string }>).detail;
      if (detail?.path !== filePath) return;

      void load({
        background: true,
        replaceIfDraftEquals: detail.replaceIfDraftEquals,
      }).finally(() => {
        window.dispatchEvent(
          new CustomEvent("beeblio:workspace-file-reloaded", { detail: { path: filePath } }),
        );
      });
    };

    window.addEventListener("beeblio:reload-workspace-file", reload);
    return () => window.removeEventListener("beeblio:reload-workspace-file", reload);
  }, [filePath, load, refreshOnExternalChange]);

  useEffect(() => {
    if (isUntitledDraftPath(filePath)) return;

    const applyKnownContent = (event: Event) => {
      const files = (event as CustomEvent<WorkspaceChangedDetail>).detail?.files;
      const changed = files?.find((candidate) => candidate.path === filePath);
      if (!changed) {
        // Agent turns intentionally send a pathless notification as a safety
        // net for mutations made by opaque tools such as bash. Reload the one
        // mounted text editor directly instead of relying solely on the
        // shell's signed-URL ETag probe, whose redirect/CORS failure is
        // deliberately non-fatal. Events with known files can ignore paths
        // not included in their exact mutation payload.
        if (!files) {
          void load({ background: true }).finally(() => {
            window.dispatchEvent(
              new CustomEvent("beeblio:workspace-file-reloaded", { detail: { path: filePath } }),
            );
          });
        }
        return;
      }

      if (dirtyRef.current) {
        if (changed.content !== contentRef.current) setProposedContent(changed.content);
        return;
      }

      const contentChanged = changed.content !== contentRef.current;
      setProposedContent(undefined);
      if (cacheable) writeCachedText(filePath, changed.content);
      replaceWithSavedContent(changed.content);
      if (contentChanged) setEditorVersion((version) => version + 1);
    };

    window.addEventListener(WORKSPACE_CHANGED_EVENT, applyKnownContent);
    return () => window.removeEventListener(WORKSPACE_CHANGED_EVENT, applyKnownContent);
  }, [cacheable, filePath, load, replaceWithSavedContent]);

  useEffect(() => {
    const proposeReview = (event: Event) => {
      const detail = (event as CustomEvent<DocumentReviewProposalDetail>).detail;
      if (detail?.filePath !== filePath || typeof detail.content !== "string") return;
      if (draftRef.current !== detail.baseContent) {
        toast.error("The document changed after this review. Run it again before applying edits.");
        return;
      }
      proposedReviewFindingIdsRef.current = detail.findingIds;
      proposedReviewModeRef.current = detail.mode ?? "commit";
      setProposedReviewMode(detail.mode ?? "commit");
      setProposedReviewFocus(detail.focus);
      if (detail.mode === "commit") {
        setPendingReviewCommit({ content: detail.content, findingIds: detail.findingIds });
        return;
      }
      setProposedContent(detail.content);
    };
    window.addEventListener(DOCUMENT_REVIEW_PROPOSAL_EVENT, proposeReview);
    return () => window.removeEventListener(DOCUMENT_REVIEW_PROPOSAL_EVENT, proposeReview);
  }, [filePath]);

  const save = useCallback(async (next = draft) => {
    // A share link never grants write access; without this guard a non-owner
    // editor would silently write into their own same-slug workspace.
    if (publicView.shareId) {
      toast.message("Shared files are read-only");
      return false;
    }
    setSaving(true);
    try {
      if (isUntitledDraftPath(filePath)) {
        const saved = await saveUntitledDraft(filePath, next);
        if (saved) {
          // Collapse draft onto content so the store entry clears and the
          // re-pathed tab is no longer dirty; the layout's Save As keeps this
          // editor mounted, so no edits are lost.
          replaceWithSavedContent(next);
          onSaved?.();
        }
        return saved;
      }
      const filename = filePath.split("/").at(-1) || "document.txt";
      const result = await uploadWorkspaceFile(
        projectId,
        filePath.split("/").slice(0, -1).join("/"),
        new File([next], filename, { type: "text/plain;charset=utf-8" }),
        { overwrite: true },
      );
      if (!result.success) throw new Error(result.error);
      if (cacheable) writeCachedText(filePath, next);
      replaceWithSavedContent(next);
      setProposedContent(undefined);
      if (filePath === PROJECT_BIBLIOGRAPHY_PATH) {
        announceWorkspaceChange([{ path: filePath, content: next }]);
      }
      toast.success("Saved");
      onSaved?.();
      return true;
    } catch {
      toast.error("Failed to save");
      return false;
    } finally {
      setSaving(false);
    }
  }, [draft, filePath, onSaved, projectId, publicView.shareId, replaceWithSavedContent, saveUntitledDraft]);

  useEffect(() => {
    if (!pendingReviewCommit) return;
    const commit = pendingReviewCommit;
    setPendingReviewCommit(undefined);
    void save(commit.content).then((saved) => {
      if (!saved) return;
      window.dispatchEvent(new CustomEvent<DocumentReviewAcceptedDetail>(DOCUMENT_REVIEW_ACCEPTED_EVENT, {
        detail: { filePath, findingIds: commit.findingIds, content: commit.content, mode: "commit" },
      }));
    });
  }, [filePath, pendingReviewCommit, save]);

  const discard = useCallback(() => {
    if (proposedContent !== undefined) {
      setProposedContent(undefined);
      void load();
      toast.message("Local changes discarded, loaded AI version");
      return;
    }
    draftRef.current = contentRef.current;
    dirtyRef.current = false;
    setDraft(contentRef.current);
    setEditorVersion((value) => value + 1);
    toast.message("Unsaved changes discarded");
  }, [proposedContent, load]);

  useEffect(() => {
    registerEditor({
      id: registrationId,
      path: filePath,
      dirty,
      save,
      discard,
      getContent: () => draftRef.current ?? null,
    });
  }, [content, discard, dirty, draft, filePath, registerEditor, registrationId, save]);

  useEffect(() => () => unregisterEditor(registrationId), [registrationId, unregisterEditor]);

  const acceptProposed = useCallback(async () => {
    if (proposedContent === undefined) return false;
    if (proposedReviewFindingIdsRef.current.length > 0 && proposedReviewModeRef.current === "stage") {
      window.dispatchEvent(new CustomEvent<DocumentReviewAcceptedDetail>(DOCUMENT_REVIEW_ACCEPTED_EVENT, {
        detail: { filePath, findingIds: proposedReviewFindingIdsRef.current, content: proposedContent, mode: "stage" },
      }));
      proposedReviewFindingIdsRef.current = [];
      proposedReviewModeRef.current = "commit";
      setProposedReviewMode("commit");
      setProposedReviewFocus(undefined);
      setProposedContent(undefined);
      toast.success("Change staged", { description: "The document has not been saved yet." });
      return true;
    }
    const saved = await save(proposedContent);
    if (!saved) return false;
    if (proposedReviewFindingIdsRef.current.length > 0) {
      window.dispatchEvent(new CustomEvent<DocumentReviewAcceptedDetail>(DOCUMENT_REVIEW_ACCEPTED_EVENT, {
        detail: { filePath, findingIds: proposedReviewFindingIdsRef.current, content: proposedContent, mode: "commit" },
      }));
      proposedReviewFindingIdsRef.current = [];
      proposedReviewModeRef.current = "commit";
      setProposedReviewMode("commit");
      setProposedReviewFocus(undefined);
    }
    return true;
  }, [filePath, proposedContent, save]);

  const rejectProposed = useCallback(() => {
    const findingIds = proposedReviewFindingIdsRef.current;
    const mode = proposedReviewModeRef.current;
    if (findingIds.length > 0 && mode === "stage") {
      window.dispatchEvent(new CustomEvent<DocumentReviewRejectedDetail>(DOCUMENT_REVIEW_REJECTED_EVENT, {
        detail: { filePath, findingIds, mode },
      }));
    }
    proposedReviewFindingIdsRef.current = [];
    proposedReviewModeRef.current = "commit";
    setProposedReviewMode("commit");
    setProposedReviewFocus(undefined);
    setProposedContent(undefined);
    toast.message(mode === "stage" ? "Change rejected" : "Apply cancelled");
  }, [filePath]);

  const review = proposedContent === undefined ? undefined : {
    onAccept: acceptProposed,
    onReject: rejectProposed,
    proposed: proposedContent,
    local: draft,
    mode: proposedReviewMode,
    focus: proposedReviewFocus,
  };

  return { content, draft, setDraft, editorVersion, loading, saving, error, dirty, save, discard, proposedContent, proposedReviewMode, proposedReviewFocus, acceptProposed, rejectProposed, review };
}
