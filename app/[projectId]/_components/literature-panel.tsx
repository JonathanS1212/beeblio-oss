"use client";

import { useEffect, useState } from "react";
import { BookOpenText, Search } from "lucide-react";

import { PROJECT_BIBLIOGRAPHY_NAME, PROJECT_BIBLIOGRAPHY_PATH } from "@/lib/project-bibliography";
import { cn } from "@/lib/utils";
import type { FileEntry } from "../file-actions";
import { LiteratureSearch } from "./literature-search";
import { ResearchArtifactBrowser } from "./research-artifact-browser";

const LITERATURE_TABS = [
  { id: "search", label: "Search", icon: Search },
  { id: "library", label: "Library", icon: BookOpenText },
] as const;

export type LiteratureTab = (typeof LITERATURE_TABS)[number]["id"];

const literatureTabIds = new Set<LiteratureTab>(LITERATURE_TABS.map(({ id }) => id));

function rememberedLiteratureTab(projectId: string): LiteratureTab {
  try {
    const value = window.localStorage.getItem(`beeblio:${projectId}:literature-tab`);
    return value && literatureTabIds.has(value as LiteratureTab) ? (value as LiteratureTab) : "search";
  } catch {
    return "search";
  }
}

/**
 * The Literature rail panel: scholarly search and the project's reference
 * library (reference files plus literature matrices), sharing one navigation
 * slot.
 */
export function LiteraturePanel({
  projectId,
  initialFiles,
  initialRootTreeChildren,
  initialAllFiles,
  activeFilePath,
  onOpenFile,
  onOpenFileWithCue,
  searchRequest,
  onSearchRequestConsumed,
}: {
  projectId: string;
  initialFiles: FileEntry[];
  initialRootTreeChildren: Record<string, FileEntry[]>;
  initialAllFiles?: FileEntry[];
  activeFilePath?: string;
  onOpenFile: (file: FileEntry, pinned?: boolean) => void;
  onOpenFileWithCue?: (file: FileEntry, pinned?: boolean) => void;
  searchRequest?: { query: string } | null;
  onSearchRequestConsumed?: () => void;
}) {
  const [tab, setTab] = useState<LiteratureTab>("search");

  useEffect(() => {
    setTab(rememberedLiteratureTab(projectId));
  }, [projectId]);

  // Requests handed over from the editor's "@" menu always target the search
  // tab, even when the panel last sat on Library or Matrix.
  useEffect(() => {
    if (searchRequest?.query) setTab("search");
  }, [searchRequest]);

  useEffect(() => {
    try {
      window.localStorage.setItem(`beeblio:${projectId}:literature-tab`, tab);
    } catch {
      // Tab memory is best-effort.
    }
  }, [projectId, tab]);

  const selectTab = (next: LiteratureTab) => {
    setTab(next);
    if (next === "library") {
      // Match the old Reference Manager rail item: the library view centers
      // on the project bibliography database.
      const opener = onOpenFileWithCue ?? onOpenFile;
      opener(
        {
          name: PROJECT_BIBLIOGRAPHY_NAME,
          path: PROJECT_BIBLIOGRAPHY_PATH,
          isDir: false,
          size: 0,
        },
        false,
      );
    }
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex h-10 shrink-0 items-center gap-1 border-b px-2" role="tablist" aria-label="Literature views">
        {LITERATURE_TABS.map(({ id, label, icon: Icon }) => {
          const active = tab === id;
          return (
            <button
              key={id}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => selectTab(id)}
              className={cn(
                "flex h-7 flex-1 items-center justify-center gap-1.5 rounded-lg px-2 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                active && "bg-accent text-accent-foreground",
              )}
            >
              <Icon className="size-3.5" />
              {label}
            </button>
          );
        })}
      </div>
      <div className="flex min-h-0 flex-1 flex-col">
        {tab === "search" ? (
          <LiteratureSearch projectId={projectId} searchRequest={searchRequest} onSearchRequestConsumed={onSearchRequestConsumed} />
        ) : (
          <ResearchArtifactBrowser
            view="references"
            projectId={projectId}
            initialFiles={initialFiles}
            initialRootTreeChildren={initialRootTreeChildren}
            initialAllFiles={initialAllFiles}
            activeFilePath={activeFilePath}
            onOpenFile={onOpenFile}
          />
        )}
      </div>
    </div>
  );
}
