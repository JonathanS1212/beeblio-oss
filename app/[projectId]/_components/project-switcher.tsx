"use client";

import Link from "next/link";
import { useCallback, useState } from "react";
import { ChevronsUpDown, LayoutGrid, Loader2 } from "lucide-react";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { getProjects } from "@/app/actions";

export type SwitcherProject = { id: string; name: string; slug: string };

/**
 * Navigation header's project name as a workspace switcher: opens the user's
 * recent projects and navigates straight to one. The list is fetched on every
 * open while keeping the initial list from the project layout visible.
 */
export function ProjectSwitcher({
  projectId,
  projectName,
  initialProjects,
}: {
  projectId: string;
  projectName: string;
  initialProjects?: SwitcherProject[];
}) {
  const [projects, setProjects] = useState<SwitcherProject[] | undefined>(initialProjects);
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);

  const loadProjects = useCallback(async () => {
    setLoading(true);
    setFailed(false);
    try {
      const owned = await getProjects();
      setProjects(owned);
    } catch {
      setFailed(true);
    } finally {
      setLoading(false);
    }
  }, []);

  return (
    <DropdownMenu onOpenChange={(open) => { if (open) void loadProjects(); }}>
      <DropdownMenuTrigger
        aria-label="Switch project"
        className="flex min-w-0 flex-1 items-center gap-1 rounded-md px-1.5 py-1 text-left outline-none transition-colors hover:bg-accent/60 focus-visible:ring-[3px] focus-visible:ring-ring/20"
      >
        <span className="min-w-0 flex-1 truncate text-xs font-semibold">{projectName}</span>
        <ChevronsUpDown className="size-3.5 shrink-0 text-muted-foreground" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" sideOffset={6} className="w-60 max-h-[min(20rem,60vh)] overflow-y-auto">
        {projects === undefined && loading ? (
          <div className="flex items-center gap-2 px-2 py-1.5 text-xs text-muted-foreground">
            <Loader2 className="size-3.5 animate-spin" /> Loading Projects…
          </div>
        ) : null}
        {projects?.map((project) => {
          const active = project.slug === projectId;
          return (
            <DropdownMenuItem key={project.id} asChild className="text-xs">
              <Link
                href={`/${project.slug}`}
                aria-current={active ? "page" : undefined}
                className={active ? "cursor-pointer bg-accent/70 font-medium" : "cursor-pointer"}
              >
                <span className="min-w-0 flex-1 truncate">{project.name}</span>
              </Link>
            </DropdownMenuItem>
          );
        })}
        {!loading && !failed && projects?.length === 0 ? (
          <p className="px-2 py-1.5 text-xs text-muted-foreground">No projects yet.</p>
        ) : null}
        {failed && !projects ? (
          <p className="px-2 py-1.5 text-xs text-muted-foreground">Projects could not be loaded.</p>
        ) : null}
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild className="text-xs">
          <Link href="/workspace" className="cursor-pointer">
            <span className="flex size-4 shrink-0 items-center justify-center">
              <LayoutGrid className="size-4" />
            </span>
            All Projects
          </Link>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
