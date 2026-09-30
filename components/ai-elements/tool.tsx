"use client";

import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { cn } from "@/lib/utils";
import type { DynamicToolUIPart, ToolUIPart } from "ai";
import {
  AudioLinesIcon,
  BarChart3Icon,
  BookOpenIcon,
  BotIcon,
  CheckIcon,
  ChevronDownIcon,
  CircleHelpIcon,
  CircleSlashIcon,
  ClockIcon,
  CopyIcon,
  FileTextIcon,
  FolderIcon,
  GlobeIcon,
  ImageIcon,
  ListTodoIcon,
  LoaderCircleIcon,
  PencilIcon,
  RotateCcwIcon,
  SearchIcon,
  SquareIcon,
  WrenchIcon,
  TerminalIcon,
  type LucideIcon,
} from "lucide-react";
import type { ComponentProps, ReactNode } from "react";
import { isValidElement } from "react";

import { CodeBlock } from "./code-block";

export type ToolProps = ComponentProps<typeof Collapsible>;

export const Tool = ({ className, ...props }: ToolProps) => (
  <Collapsible
    className={cn("group not-prose mb-2 w-full", className)}
    {...props}
  />
);

export type ToolPart = ToolUIPart | DynamicToolUIPart;

/** Terminal presentation for tool parts whose turn ended before the tool
 *  produced output (user stop, lost stream) — not a real AI SDK part state. */
export type ToolStatus = ToolPart["state"] | "stopped";

export type ToolHeaderProps = {
  /** Final display label; omit to derive and title-case from the tool name. */
  title?: string;
  /** Muted context shown after the label (e.g. a file name or query). */
  detail?: string;
  /** Per-tool icon; overrides the name-based activity heuristics. */
  icon?: LucideIcon;
  statusLabel?: string;
  compact?: boolean;
  className?: string;
} & (
  | { type: ToolUIPart["type"]; state: ToolStatus; toolName?: never }
  | {
      type: DynamicToolUIPart["type"];
      state: ToolStatus;
      toolName: string;
    }
);

const statusLabels: Record<ToolStatus, string> = {
  "approval-requested": "Awaiting Approval",
  "approval-responded": "Responded",
  "input-available": "Running",
  "input-streaming": "Pending",
  "output-available": "Completed",
  "output-denied": "Denied",
  "output-error": "Failed",
  stopped: "Stopped",
};

const statusIcons: Record<ToolStatus, ReactNode> = {
  "approval-requested": <ClockIcon className="size-4 text-yellow-600" />,
  "approval-responded": <CheckIcon className="size-3.5 text-primary" />,
  "input-available": <LoaderCircleIcon className="size-3.5 animate-spin" />,
  "input-streaming": <LoaderCircleIcon className="size-3.5 animate-spin" />,
  "output-available": <CheckIcon className="size-3.5 text-primary" />,
  "output-denied": <CircleSlashIcon className="size-3.5 text-muted-foreground" />,
  "output-error": <RotateCcwIcon className="size-3.5" />,
  stopped: <SquareIcon className="size-3.5 text-muted-foreground" />,
};

export const getStatusBadge = (status: ToolStatus, statusLabel = statusLabels[status]) => (
  <span
    aria-label={statusLabel}
    className="flex size-5 shrink-0 items-center justify-center text-muted-foreground"
    role="img"
    title={statusLabel}
  >
    {statusIcons[status]}
  </span>
);

export const ToolHeader = ({
  className,
  title,
  detail,
  icon: Icon,
  statusLabel,
  compact = false,
  type,
  state,
  toolName,
  ...props
}: ToolHeaderProps) => {
  const derivedName = type === "dynamic-tool" ? toolName : type.split("-").slice(1).join("-");
  const activityName = title ?? formatActivityName(derivedName);

  return (
    <CollapsibleTrigger
      className={cn(
        "flex w-full items-center justify-between text-left",
        compact ? "min-h-7 gap-2 py-0.5 text-xs text-muted-foreground" : "gap-3 py-1.5",
        className,
      )}
      {...props}
    >
      <div className="flex min-w-0 items-center gap-2">
        <span className={cn(
          "flex shrink-0 items-center justify-center text-muted-foreground",
          compact ? "size-3.5" : "size-6 rounded-full bg-muted",
        )}>
          {Icon ? <Icon className="size-3.5" /> : <ActivityIcon name={derivedName} />}
        </span>
        <span className={cn("truncate", compact ? "text-xs text-muted-foreground" : "text-sm text-foreground/85")}>
          {activityName}
          {detail ? <span className="text-muted-foreground">{` ${detail}`}</span> : null}
        </span>
        {getStatusBadge(state, statusLabel)}
        {statusLabel ? <span className="shrink-0 text-xs text-muted-foreground">{statusLabel}</span> : null}
      </div>
      <ChevronDownIcon className={cn(
        "text-muted-foreground transition-transform group-data-[state=open]:rotate-180",
        compact ? "size-3.5" : "size-4",
      )} />
    </CollapsibleTrigger>
  );
};

export type ToolContentProps = ComponentProps<typeof CollapsibleContent>;

export const ToolContent = ({ className, ...props }: ToolContentProps) => (
  <CollapsibleContent
    className={cn(
      "ml-3 space-y-3 border-l pl-5 pt-2 pb-3 text-popover-foreground outline-none data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:slide-out-to-top-2 data-[state=open]:animate-in data-[state=open]:slide-in-from-top-2",
      className,
    )}
    {...props}
  />
);

export type ToolInputProps = ComponentProps<"div"> & {
  input: ToolPart["input"];
};

export const ToolInput = ({ className, input, ...props }: ToolInputProps) => (
  <div className={cn("space-y-1.5 overflow-hidden", className)} {...props}>
    <h4 className="font-medium text-[10px] text-muted-foreground uppercase tracking-[0.08em]">
      Parameters
    </h4>
    <div className="bg-muted/30">
      <CodeBlock
        className="rounded-lg border-border/70 [&_code]:text-[11px] [&_pre]:p-3 [&_pre]:text-[11px] [&_pre]:leading-4"
        code={JSON.stringify(input, null, 2)}
        language="json"
      />
    </div>
  </div>
);

export type ToolOutputProps = ComponentProps<"div"> & {
  output: ToolPart["output"];
  errorText: ToolPart["errorText"];
  label?: string;
};

export const ToolOutput = ({ className, output, errorText, label, ...props }: ToolOutputProps) => {
  if (!(output || errorText)) {
    return null;
  }

  let Output = <div className="p-2 text-[11px] leading-4">{output as ReactNode}</div>;

  if (typeof output === "object" && !isValidElement(output)) {
    Output = (
      <CodeBlock
        className="rounded-lg border-border/70 [&_code]:text-[11px] [&_pre]:p-3 [&_pre]:text-[11px] [&_pre]:leading-4"
        code={JSON.stringify(output, null, 2)}
        language="json"
      />
    );
  } else if (typeof output === "string") {
    Output = (
      <CodeBlock
        className="rounded-lg border-border/70 [&_code]:text-[11px] [&_pre]:p-3 [&_pre]:text-[11px] [&_pre]:leading-4"
        code={output}
        language="json"
      />
    );
  }

  return (
    <div className={cn("space-y-1.5", className)} {...props}>
      <h4 className="font-medium text-[10px] text-muted-foreground uppercase tracking-[0.08em]">
        {label ?? (errorText ? "Attempt details" : "Result")}
      </h4>
      <div
        className={cn(
          "overflow-x-auto rounded-md text-xs [&_table]:w-full",
          "bg-muted/40 text-foreground",
        )}
      >
        {errorText && <div className="p-2 text-muted-foreground">{errorText}</div>}
        {Output}
      </div>
    </div>
  );
};

export function ToolActivity({
  detail,
  icon: Icon,
  state,
  statusLabel,
  title,
  toolName,
}: {
  /** Final display label; omit to title-case the raw tool name. */
  title?: string;
  /** Muted context shown after the label (e.g. a file name or query). */
  detail?: string;
  /** Per-tool icon shown before the label; the status badge moves to the
   *  trailing edge, mirroring the full ToolHeader layout. */
  icon?: LucideIcon;
  state: ToolStatus;
  /** Accessible status override for activities whose tool state has a more
   * specific user-facing meaning, such as a question awaiting a response. */
  statusLabel?: string;
  toolName?: string;
}) {
  const activityName = title ?? (toolName ? formatActivityName(toolName) : "Working");
  const activityStatus = statusLabel ?? statusLabels[state];
  return (
    <div
      aria-label={`${activityName}: ${activityStatus}`}
      className="flex min-h-7 items-center gap-2 py-0.5 text-xs text-muted-foreground"
      role="status"
    >
      {Icon ? (
        <Icon aria-hidden="true" className="size-3.5 shrink-0" />
      ) : (
        <ActivityIcon name={toolName ?? ""} />
      )}
      <span className="truncate">
        {activityName}
        {detail ? <span className="opacity-60">{` ${detail}`}</span> : null}
      </span>
      <span
        aria-label={activityStatus}
        className="flex size-5 shrink-0 items-center justify-center"
        role="img"
        title={activityStatus}
      >
        {statusIcons[state]}
      </span>
      {statusLabel ? <span className="shrink-0 text-xs">{statusLabel}</span> : null}
    </div>
  );
}

function formatActivityName(name: string): string {
  const normalized = name
    .replace(/^tool-/, "")
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/[_-]+/g, " ")
    .trim();
  if (!normalized) return "Using a tool";
  return normalized
    .split(/\s+/)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(" ");
}

function ActivityIcon({ name }: { name: string }) {
  const normalized = name.toLowerCase();
  const className = "size-3.5";

  if (/glob|grep|search|find|literature/.test(normalized)) {
    return <SearchIcon className={className} />;
  }
  if (/bash|shell|command|exec|node/.test(normalized)) {
    return <TerminalIcon className={className} />;
  }
  if (/web|scrape|fetch|url/.test(normalized)) {
    return <GlobeIcon className={className} />;
  }
  if (/folder|directory/.test(normalized)) {
    return <FolderIcon className={className} />;
  }
  if (/copy/.test(normalized)) {
    return <CopyIcon className={className} />;
  }
  if (/chart|plot|graph/.test(normalized)) {
    return <BarChart3Icon className={className} />;
  }
  if (/image|picture|photo/.test(normalized)) {
    return <ImageIcon className={className} />;
  }
  if (/audio|sound|transcri/.test(normalized)) {
    return <AudioLinesIcon className={className} />;
  }
  if (/paper|book|citation|bibliograph/.test(normalized)) {
    return <BookOpenIcon className={className} />;
  }
  if (/todo|task|plan/.test(normalized)) {
    return <ListTodoIcon className={className} />;
  }
  if (/question|ask/.test(normalized)) {
    return <CircleHelpIcon className={className} />;
  }
  if (/agent|delegate/.test(normalized)) {
    return <BotIcon className={className} />;
  }
  if (/write|create|edit|save|export/.test(normalized)) {
    return <PencilIcon className={className} />;
  }
  if (/read|file|pdf|document/.test(normalized)) {
    return <FileTextIcon className={className} />;
  }
  return <WrenchIcon className={className} />;
}
