"use client";

import { useEffect, useRef, useState } from "react";
import { Check, Copy, Mail, Monitor, Moon, Settings, Sun, User } from "lucide-react";
import { useTheme } from "next-themes";
import { toast } from "sonner";

import { authClient } from "@/lib/auth/client";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ProjectSettingsDialog } from "@/app/[projectId]/_components/project-settings-dialog";
import type { ProjectSettings } from "@/lib/project-settings";

const CONTACT_EMAIL = "mail@raihankalla.id";

/**
 * projectId is passed only by the project rail layout, so the per-project
 * settings entry appears there and not in the workspace header.
 * initialSettings (layout-provided) lets the dialog open without refetching.
 * The project route pins the light theme, so its menu hides the switcher —
 * the choice still applies on every other route's menu.
 * user seeds the trigger with the server-resolved identity so the avatar
 * paints with the page; the client session replaces it once it resolves.
 */
export function UserMenu({
  user: initialUser,
  projectId,
  initialSettings,
  projectName,
  projectDescription,
  resolvedDefaultFile,
  showThemeSwitcher = true,
}: {
  user?: { name?: string | null; email: string; image?: string | null };
  projectId?: string;
  initialSettings?: ProjectSettings;
  projectName?: string;
  projectDescription?: string;
  resolvedDefaultFile?: string;
  showThemeSwitcher?: boolean;
}) {
  const { data: session, isPending } = authClient.useSession();
  const { setTheme, theme } = useTheme();
  const [emailCopied, setEmailCopied] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const copyTimeoutRef = useRef<number>(0);

  useEffect(() => () => window.clearTimeout(copyTimeoutRef.current), []);

  const copyContactEmail = async () => {
    if (typeof window === "undefined" || !navigator.clipboard?.writeText) return;
    try {
      await navigator.clipboard.writeText(CONTACT_EMAIL);
      setEmailCopied(true);
      toast.success(`Copied ${CONTACT_EMAIL}`);
      window.clearTimeout(copyTimeoutRef.current);
      copyTimeoutRef.current = window.setTimeout(() => setEmailCopied(false), 2000);
    } catch {
      // The browser can deny clipboard access; leave the button unchanged.
    }
  };

  const user = session?.user ?? initialUser;

  if (!user) {
    // A settled session with no user means signed out: nothing to show. While
    // the session is still resolving (no server seed), hold the trigger's
    // exact geometry so the header/rail never shifts when the menu appears.
    if (!isPending) return null;
    return (
      <div
        aria-hidden="true"
        className="workspace-rail-secondary flex size-9 items-center justify-center rounded-lg"
      >
        <span className="size-7 animate-pulse rounded-full bg-muted" />
      </div>
    );
  }

  const name = user.name || user.email;
  const initial = name ? name.charAt(0).toUpperCase() : <User className="h-4 w-4" />;
  const ThemeIcon = theme === "dark" ? Moon : theme === "system" ? Monitor : Sun;

  return (
    <>
      <DropdownMenu>
      <DropdownMenuTrigger aria-label="Open workspace menu" className="workspace-rail-secondary flex size-9 items-center justify-center gap-2 rounded-lg text-xs font-medium text-muted-foreground outline-none ring-0 transition-colors hover:bg-accent/70 hover:text-accent-foreground focus-visible:ring-[3px] focus-visible:ring-ring/20">
          <Avatar className="size-7 cursor-pointer border border-border/80 shadow-[0_2px_8px_-4px_rgb(18_35_48/0.3)] transition-transform hover:-translate-y-0.5 active:translate-y-0">
            <AvatarImage src={user.image || ""} alt={name} />
            <AvatarFallback className="bg-primary/10 text-primary">{initial}</AvatarFallback>
          </Avatar>
          <span className="workspace-rail-label hidden min-w-0 truncate text-xs font-medium">{name}</span>
        </DropdownMenuTrigger>
        <DropdownMenuContent
          side="right"
          align="end"
          sideOffset={10}
          collisionPadding={12}
          className="w-56 animate-in slide-in-from-top-2"
        >
          {projectId ? (
            <DropdownMenuItem
              className="cursor-pointer"
              onSelect={() => setSettingsOpen(true)}
            >
              <Settings className="h-4 w-4" />
              <span>Project Settings</span>
            </DropdownMenuItem>
          ) : null}
          {showThemeSwitcher ? (
            <>
              <DropdownMenuSeparator />
              <div className="flex min-h-10 items-center gap-2 px-2.5 py-1.5" role="group" aria-label="Theme">
              <span className="flex min-w-0 flex-1 items-center gap-2 text-sm">
                <ThemeIcon className="size-4 text-muted-foreground" />
                Theme
              </span>
              <div className="flex items-center rounded-lg bg-muted/70 p-0.5">
                {[
                  { value: "light", label: "Light", Icon: Sun },
                  { value: "dark", label: "Dark", Icon: Moon },
                  { value: "system", label: "System", Icon: Monitor },
                ].map(({ value, label, Icon }) => (
                  <button
                    key={value}
                    type="button"
                    aria-label={label}
                    aria-pressed={theme === value}
                    title={label}
                    onClick={(event) => {
                      event.stopPropagation();
                      setTheme(value);
                    }}
                    className="flex size-7 items-center justify-center rounded-md text-muted-foreground hover:bg-card hover:text-foreground aria-pressed:bg-card aria-pressed:text-primary aria-pressed:shadow-sm"
                  >
                    <Icon className="size-3.5" />
                  </button>
                ))}
              </div>
              </div>
            </>
          ) : null}
          <DropdownMenuSeparator />
          <div className="flex min-h-10 items-center gap-2 px-2.5 py-1.5" role="group" aria-label="Contact">
            <a
              href={`mailto:${CONTACT_EMAIL}`}
              className="flex min-w-0 flex-1 items-center gap-2 rounded-md text-sm outline-none focus-visible:ring-[3px] focus-visible:ring-ring/20"
            >
              <Mail className="size-4 shrink-0 text-muted-foreground" />
              Contact
            </a>
            <button
              type="button"
              aria-label={emailCopied ? "Copied" : "Copy email address"}
              title={emailCopied ? "Copied" : `Copy ${CONTACT_EMAIL}`}
              onClick={(event) => {
                event.stopPropagation();
                copyContactEmail();
              }}
              className={`flex size-7 shrink-0 items-center justify-center rounded-md hover:bg-card hover:text-foreground ${emailCopied ? "text-primary" : "text-muted-foreground"}`}
            >
              {emailCopied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
            </button>
          </div>
        </DropdownMenuContent>
      </DropdownMenu>
      {projectId ? (
        <ProjectSettingsDialog
          projectId={projectId}
          open={settingsOpen}
          onOpenChange={setSettingsOpen}
          initialSettings={initialSettings}
          initialName={projectName}
          initialDescription={projectDescription}
          resolvedDefaultFile={resolvedDefaultFile}
        />
      ) : null}
    </>
  );
}
