"use client";

import {
  AtKey,
  AddSelectionDemo,
  AddSelectionKeys,
  InlineSearchDemo,
  QuickOpenDemo,
  QuickOpenKeys,
} from "@/app/_components/illustrations/shortcut-demos";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

// The rail's Shortcuts item teaches the workspace shortcuts.
// The keycaps and looping miniatures come from shortcut-demos.tsx, shared
// with the marketing page's "Everywhere" section; the animation timeline
// lives in globals.css (.beeblio-sc-*).
export function ShortcutsDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto sm:max-w-5xl">
        <DialogHeader>
          <DialogTitle>Keyboard Shortcuts</DialogTitle>
          {/* <DialogDescription>
            Two shortcuts do most of the heavy lifting in the workspace.
          </DialogDescription> */}
        </DialogHeader>

        <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
          <section className="rounded-xl border bg-card/60 p-3.5">
            <div className="flex items-center gap-3">
              <QuickOpenKeys />
              <div className="min-w-0">
                <h3 className="text-sm font-semibold">Quick Open</h3>
                <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">
                  Search workspace files, your reference library, or online literature from anywhere.
                </p>
              </div>
            </div>
            <QuickOpenDemo className="mt-3.5" />
          </section>

          <section className="rounded-xl border bg-card/60 p-3.5">
            <div className="flex items-center gap-3">
              <AtKey />
              <div className="min-w-0">
                <h3 className="text-sm font-semibold">Inline Search &amp; Cite</h3>
                <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">
                  Type @ in a document to search literature, library citations, and files — then insert them inline.
                </p>
              </div>
            </div>
            <InlineSearchDemo className="mt-3.5" />
          </section>

          <section className="rounded-xl border bg-card/60 p-3.5">
            <div className="flex items-center gap-3">
              <AddSelectionKeys />
              <div className="min-w-0">
                <h3 className="text-sm font-semibold">Add Selection to Chat</h3>
                <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">
                  Select a passage in a document, then attach it as context in the agent chat.
                </p>
              </div>
            </div>
            <AddSelectionDemo className="mt-3.5" />
          </section>
        </div>
      </DialogContent>
    </Dialog>
  );
}
