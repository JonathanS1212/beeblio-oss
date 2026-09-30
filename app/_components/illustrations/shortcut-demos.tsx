"use client";

import { useEffect, useState, type ReactNode } from "react";
import {
  BookOpen,
  BookOpenText,
  FolderOpen,
  Search,
  type LucideIcon,
} from "lucide-react";

// The two chord illustrations shared by the in-app Shortcuts dialog and the
// marketing page's "Everywhere" section: physical keycaps plus a looping,
// pure-CSS miniature of the UI each chord opens (the Quick Open palette and
// the editor's "@" mention menu). Every exported root carries the .beeblio-sc
// scope class — the animation timeline in globals.css (.beeblio-sc-*) keys off
// it, so the demos animate wherever they're mounted.

// Mac shows ⌘, everything else Ctrl — detected after mount so the label
// never disagrees with the server-rendered HTML.
function useIsMac() {
  const [isMac, setIsMac] = useState(false);
  useEffect(() => {
    setIsMac(/Macintosh|Mac OS X/.test(navigator.userAgent));
  }, []);
  return isMac;
}

export function QuickOpenKeys() {
  const isMac = useIsMac();
  return (
    <div className="beeblio-sc flex shrink-0 items-center gap-1.5" aria-hidden="true">
      <kbd className="beeblio-keycap beeblio-sc-mod-key">{isMac ? "⌘" : "Ctrl"}</kbd>
      <span className="text-xs font-medium text-muted-foreground">+</span>
      <kbd className="beeblio-keycap beeblio-sc-p-key">P</kbd>
    </div>
  );
}

export function AtKey() {
  return (
    <div className="beeblio-sc flex shrink-0 items-center gap-1.5" aria-hidden="true">
      <kbd className="beeblio-keycap beeblio-sc-at-key">@</kbd>
    </div>
  );
}

// Miniature of the Quick Open palette: the query tiers mirror the real
// dialog — workspace files, the reference library, and online literature.
export function QuickOpenDemo({ className = "" }: { className?: string }) {
  return (
    <div className={`beeblio-sc beeblio-sc-stage ${className}`} aria-hidden="true">
      <div className="beeblio-sc-palette w-full max-w-[18.5rem]">
        <div className="flex items-center gap-1.5 border-b px-2.5 py-2">
          <Search className="size-3 shrink-0 text-muted-foreground" />
          <span className="text-[10px] text-foreground">attention</span>
          <span className="beeblio-sc-caret" />
        </div>
        <div className="p-1 pb-1.5">
          <div className="beeblio-sc-in-1">
            <DemoHeading>Your Workspace Files</DemoHeading>
            <DemoRow active>
              <span className="w-3.5 shrink-0 text-[8px] font-semibold uppercase text-primary">md</span>
              <span className="min-w-0 flex-1 truncate text-[10px] font-medium">attention-analysis.md</span>
              <span className="shrink-0 text-[8px] text-muted-foreground">2-Results</span>
            </DemoRow>
          </div>
          <div className="beeblio-sc-in-2">
            <DemoHeading icon={BookOpen}>Library</DemoHeading>
            <DemoRow>
              <BookOpen className="size-3 shrink-0 text-primary" />
              <span className="min-w-0 flex-1 truncate text-[10px] font-medium">Attention Is All You Need</span>
              <span className="shrink-0 font-mono text-[8px] text-muted-foreground">2017</span>
            </DemoRow>
          </div>
          <div className="beeblio-sc-in-3">
            <DemoHeading>Literature Search</DemoHeading>
            <DemoRow>
              <Search className="size-3 shrink-0" />
              <span className="min-w-0 flex-1 truncate text-[10px] font-medium">
                Search online literature for “attention”
              </span>
            </DemoRow>
          </div>
        </div>
      </div>
    </div>
  );
}

// Miniature of the editor's "@" mention menu over a white document page:
// the three tiers match MentionSearchMenu — literature, library, and files.
// The page and its menu use fixed light colors so the "document" reads the
// same in dark mode.
export function InlineSearchDemo({ className = "" }: { className?: string }) {
  return (
    <div className={`beeblio-sc beeblio-sc-stage beeblio-sc-stage--doc ${className}`} aria-hidden="true">
      <div className="w-full max-w-[19rem]">
        <p className="pb-1.5 text-center text-[11px] leading-5 text-slate-800">
          Prior work on{" "}
          <span className="beeblio-sc-at-char font-semibold text-blue-700">@</span>
          <span className="beeblio-sc-caret align-[-1px]" />
        </p>
        <div className="beeblio-sc-menu beeblio-sc-menu-doc mx-auto w-[calc(100%-5rem)]">
          <div className="beeblio-sc-in-1">
            <DemoHeading icon={BookOpenText} tone="doc">Search Literature</DemoHeading>
            <DemoRow active tone="doc">
              <Search className="size-3 shrink-0" />
              <span className="min-w-0 flex-1 truncate text-[10px] font-medium">
                Search literature for “retrieval”…
              </span>
            </DemoRow>
          </div>
          <div className="beeblio-sc-in-2">
            <DemoHeading icon={BookOpen} tone="doc">Search Library</DemoHeading>
            <DemoRow tone="doc">
              <BookOpen className="size-3 shrink-0 text-blue-700" />
              <span className="min-w-0 flex-1 truncate text-[10px] font-medium">Attention Is All You Need</span>
              <span className="shrink-0 text-[8px] text-slate-500">2017</span>
            </DemoRow>
          </div>
          <div className="beeblio-sc-in-3">
            <DemoHeading icon={FolderOpen} tone="doc">Insert File</DemoHeading>
            <DemoRow tone="doc">
              <span
                className="size-3.5 shrink-0 rounded-[3px] border border-slate-200 bg-gradient-to-br from-blue-500/25 to-blue-100"
                aria-hidden="true"
              />
              <span className="min-w-0 flex-1 truncate text-[10px] font-medium">attention-figure.png</span>
              <span className="shrink-0 text-[8px] text-slate-500">3-Figures</span>
            </DemoRow>
          </div>
        </div>
      </div>
    </div>
  );
}

function DemoHeading({
  icon: Icon,
  tone = "theme",
  children,
}: {
  icon?: LucideIcon;
  tone?: "theme" | "doc";
  children: ReactNode;
}) {
  return (
    <p
      className={`flex items-center gap-1 px-2 pb-0.5 pt-1.5 text-[9px] font-medium ${
        tone === "doc" ? "text-slate-500" : "text-muted-foreground"
      }`}
    >
      {Icon ? <Icon className="size-2.5 shrink-0" /> : null}
      {children}
    </p>
  );
}

function DemoRow({
  active = false,
  tone = "theme",
  children,
}: {
  active?: boolean;
  tone?: "theme" | "doc";
  children: ReactNode;
}) {
  const base = "flex items-center gap-1.5 rounded-md px-2 py-1.5";
  const background = tone === "doc"
    ? active ? "bg-slate-100" : ""
    : active ? "bg-accent/70" : "";
  return <div className={`${base} ${background}`}>{children}</div>;
}
