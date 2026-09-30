"use client";

import { useEffect, useState } from "react";
import { PencilSparkles } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import {
  COMPLETION_SETTINGS_CHANGED_EVENT,
  DEFAULT_COMPLETION_SETTINGS,
  parseProjectSettings,
  type ProjectSettings,
} from "@/lib/project-settings";
import { getProjectSettings } from "../settings-actions";
import { ProjectSettingsDialog } from "./project-settings-dialog";
import { notifyUpcomingFeature } from "./upcoming-feature";

/**
 * The editor's live view of the project settings (entry point without the
 * layout's props). Fetched on mount and re-fetched whenever the settings
 * dialog saves.
 */
export function useProjectSettings(projectId: string) {
  const [settings, setSettings] = useState<ProjectSettings>(parseProjectSettings(undefined));

  useEffect(() => {
    let cancelled = false;
    const load = () => {
      getProjectSettings(projectId)
        .then((loaded) => {
          if (!cancelled) setSettings(loaded);
        })
        .catch(() => undefined);
    };
    load();
    window.addEventListener(COMPLETION_SETTINGS_CHANGED_EVENT, load);
    return () => {
      cancelled = true;
      window.removeEventListener(COMPLETION_SETTINGS_CHANGED_EVENT, load);
    };
  }, [projectId]);

  return settings;
}

/**
 * Header toolbar toggle for sentence auto-completion, in the download /
 * share / save row. Lit while completion is enabled; clicking opens the
 * project settings dialog on its Completion section.
 */
export function AutoCompletionButton({
  projectId,
  settings,
}: {
  projectId: string;
  settings: ProjectSettings;
}) {
  const completion = settings.completion ?? DEFAULT_COMPLETION_SETTINGS;
  const [open, setOpen] = useState(false);
  return (
    <>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            size="sm"
            variant={completion.enabled ? "secondary" : "ghost"}
            className={
              completion.enabled
                ? "text-primary"
                : "text-muted-foreground hover:text-foreground"
            }
            // onClick={() => notifyUpcomingFeature("AI Completion")}
            onClick={() => setOpen(true)}
            aria-pressed={completion.enabled}
            aria-label="Auto completion settings"
          >
            <PencilSparkles className="size-3.5" />
            <span className="hidden sm:inline">AI Completion</span>
          </Button>
        </TooltipTrigger>
        <TooltipContent>
          {completion.enabled
            ? "AI Completion is On"
            : "AI Completion is Off"}
        </TooltipContent>
      </Tooltip>
      <ProjectSettingsDialog
        projectId={projectId}
        open={open}
        onOpenChange={setOpen}
        initialSettings={settings}
        initialTab="completion"
      />
    </>
  );
}
