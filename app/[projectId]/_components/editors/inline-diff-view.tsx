"use client";

import { useEffect, useRef, useState, type Ref, type RefObject } from "react";
import { Check, Loader2, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import type { DocumentDefaultSettings } from "@/lib/project-settings";
import { changedSequenceIndexes } from "@/lib/sequence-diff";
import { MarkdownWysiwyg } from "./markdown-wysiwyg";

/** Render both snapshots through the real editor. Injecting diff HTML into raw
 * Markdown corrupts formatting and custom nodes such as citations. */
export function InlineDiffView({
  projectId, filePath, local, proposed, documentDefaults, mode = "commit", focus, onAccept, onReject,
}: {
  projectId?: string;
  filePath?: string;
  local: string;
  proposed: string;
  documentDefaults?: DocumentDefaultSettings;
  mode?: "stage" | "commit";
  focus?: { before: string; after: string };
  onAccept: () => boolean | Promise<boolean>;
  onReject: () => void;
}) {
  const [accepting, setAccepting] = useState(false);
  const currentRef = useRef<HTMLElement>(null);
  const proposedRef = useRef<HTMLElement>(null);
  useRenderedBlockHighlights(currentRef, proposedRef, local, proposed, focus);
  const isMarkdown = Boolean(filePath && (
    !filePath.includes(".") || filePath.endsWith(".md") ||
    filePath.endsWith(".markdown") || filePath.endsWith(".mmd")
  ));
  // Two complete Tiptap trees plus DOM-signature diffing is prohibitively
  // expensive for long papers. Source snapshots keep review responsive.
  const useRichComparison = isMarkdown && local.length + proposed.length <= 160_000;

  return (
    <div className="relative flex h-full flex-col bg-background">
      <div className="absolute bottom-5 left-1/2 z-40 flex -translate-x-1/2 items-center gap-2 rounded-full border border-border/80 bg-card/95 px-3.5 py-1.5 shadow-lg backdrop-blur-md">
        <span className="mr-1 text-xs font-medium text-muted-foreground">{mode === "stage" ? "Stage Review" : "Apply Review"}</span>
        <Button variant="ghost" size="sm" className="h-7 text-xs text-muted-foreground hover:bg-muted/80 hover:text-foreground" onClick={onReject} disabled={accepting}>
          <X className="mr-1 size-3.5" />Reject
        </Button>
        <span className="h-4 w-px bg-border" />
        <Button
          variant="default"
          size="sm"
          className="h-7 bg-emerald-600 text-xs font-medium text-white hover:bg-emerald-700"
          disabled={accepting}
          onClick={() => {
            setAccepting(true);
            void Promise.resolve(onAccept()).finally(() => setAccepting(false));
          }}
        >
          {accepting ? <Loader2 className="mr-1 size-3.5 animate-spin" /> : <Check className="mr-1 size-3.5" />}
          {accepting ? (mode === "stage" ? "Staging…" : "Saving…") : (mode === "stage" ? "Accept to Stage" : "Apply Changes")}
        </Button>
      </div>

      {useRichComparison && projectId && filePath ? (
        <div className="grid min-h-0 flex-1 grid-rows-2 divide-y overflow-hidden">
          <ReviewDocument ref={currentRef} label="Current · removed or changed passages" projectId={projectId} filePath={filePath} markdown={local} documentDefaults={documentDefaults} />
          <ReviewDocument ref={proposedRef} label="Proposed · added or changed passages" projectId={projectId} filePath={filePath} markdown={proposed} documentDefaults={documentDefaults} proposed />
        </div>
      ) : (
        <div className="grid min-h-0 flex-1 grid-rows-2 divide-y overflow-hidden">
          <PlainSnapshot label="Current" value={local} />
          <PlainSnapshot label="Proposed" value={proposed} proposed />
        </div>
      )}
    </div>
  );
}

function ReviewDocument({ ref, label, proposed = false, ...editorProps }: {
  ref: Ref<HTMLElement>;
  label: string;
  proposed?: boolean;
  projectId: string;
  filePath: string;
  markdown: string;
  documentDefaults?: DocumentDefaultSettings;
}) {
  return (
    <section ref={ref} className="relative min-h-0 overflow-hidden">
      <SnapshotLabel label={label} proposed={proposed} />
      <MarkdownWysiwyg {...editorProps} onChange={() => {}} editable={false} />
    </section>
  );
}

function useRenderedBlockHighlights(
  currentRef: RefObject<HTMLElement | null>,
  proposedRef: RefObject<HTMLElement | null>,
  local: string,
  proposed: string,
  focus?: { before: string; after: string },
) {
  useEffect(() => {
    let frame: number | undefined;
    let revealed = false;
    const render = () => {
      frame = undefined;
      const currentBlocks = renderedBlocks(currentRef.current);
      const proposedBlocks = renderedBlocks(proposedRef.current);
      if (!currentBlocks.length && !proposedBlocks.length) return;
      const changed = changedSequenceIndexes(
        currentBlocks.map(blockSignature),
        proposedBlocks.map(blockSignature),
      );
      currentBlocks.forEach((block, index) => block.classList.toggle("beeblio-review-changed-current", changed.before.has(index)));
      proposedBlocks.forEach((block, index) => block.classList.toggle("beeblio-review-changed-proposed", changed.after.has(index)));
      if (!revealed && (changed.after.size > 0 || changed.before.size > 0)) {
        revealed = true;
        const currentTarget = focusedBlock(currentBlocks, focus?.before)
          ?? currentBlocks[Math.min(...changed.before)];
        const proposedTarget = focusedBlock(proposedBlocks, focus?.after)
          ?? proposedBlocks[Math.min(...changed.after)];
        requestAnimationFrame(() => {
          currentTarget?.scrollIntoView({ block: "center", behavior: "smooth" });
          proposedTarget?.scrollIntoView({ block: "center", behavior: "smooth" });
        });
      }
    };
    const schedule = () => {
      if (frame !== undefined) cancelAnimationFrame(frame);
      frame = requestAnimationFrame(render);
    };
    const observer = new MutationObserver(schedule);
    if (currentRef.current) observer.observe(currentRef.current, { childList: true, characterData: true, subtree: true });
    if (proposedRef.current) observer.observe(proposedRef.current, { childList: true, characterData: true, subtree: true });
    schedule();
    return () => {
      observer.disconnect();
      if (frame !== undefined) cancelAnimationFrame(frame);
    };
  }, [currentRef, focus, local, proposed, proposedRef]);
}

function focusedBlock(blocks: readonly HTMLElement[], source: string | undefined) {
  if (!source) return undefined;
  const needle = source
    .replace(/\[@[^\]]+\](?:\{[^}\n]+\})?/g, "")
    .replace(/[*_~`#>]+/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 120);
  if (!needle) return undefined;
  return blocks.find((block) => (block.textContent ?? "").replace(/\s+/g, " ").includes(needle));
}

function renderedBlocks(root: HTMLElement | null): HTMLElement[] {
  const editor = root?.querySelector<HTMLElement>(".beeblio-tiptap-page");
  return editor ? Array.from(editor.children).filter((node): node is HTMLElement => node instanceof HTMLElement) : [];
}

function blockSignature(block: HTMLElement): string {
  const clone = block.cloneNode(true) as HTMLElement;
  clone.classList.remove("beeblio-review-changed-current", "beeblio-review-changed-proposed");
  clone.querySelectorAll(".beeblio-review-changed-current, .beeblio-review-changed-proposed")
    .forEach((node) => node.classList.remove("beeblio-review-changed-current", "beeblio-review-changed-proposed"));
  return clone.outerHTML;
}

function PlainSnapshot({ label, value, proposed = false }: { label: string; value: string; proposed?: boolean }) {
  return (
    <section className="relative min-h-0 overflow-auto p-6 pt-12 font-mono text-sm leading-relaxed">
      <SnapshotLabel label={label} proposed={proposed} />
      <div className="mx-auto max-w-4xl whitespace-pre-wrap">{value}</div>
    </section>
  );
}

function SnapshotLabel({ label, proposed }: { label: string; proposed: boolean }) {
  return (
    <div className="absolute left-3 top-3 z-30 rounded-full border bg-card/95 px-2.5 py-1 text-[11px] font-semibold shadow-sm backdrop-blur-sm">
      <span className={proposed ? "text-emerald-700 dark:text-emerald-400" : "text-muted-foreground"}>{label}</span>
    </div>
  );
}
