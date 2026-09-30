"use client";

import { Plus, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

import { FLAT_FIELD, GHOST_BUTTON } from "./styles";

/**
 * Edits the options of a multiple-choice / checkbox question as the rendered
 * list itself: a disabled radio/checkbox marker beside each editable option,
 * mirroring how respondents will see it.
 */
export function ChoiceOptionsEditor({
  kind,
  options,
  onOptionsChange,
  otherOption,
  onOtherChange,
}: {
  kind: "radio" | "checkbox";
  options: string[];
  onOptionsChange: (next: string[]) => void;
  otherOption: boolean;
  onOtherChange: (enabled: boolean) => void;
}) {
  const Marker = () => (
    <input type={kind} disabled aria-hidden="true" className="size-4 shrink-0 accent-primary" />
  );

  return (
    <div className="space-y-0.5">
      {options.map((option, index) => (
        <div
          key={index}
          className="group/option flex items-center gap-2.5 rounded-lg px-1 py-0.5 hover:bg-accent/30"
        >
          <Marker />
          <Input
            value={option}
            onChange={(event) =>
              onOptionsChange(options.map((entry, i) => (i === index ? event.target.value : entry)))
            }
            placeholder={`Option ${index + 1}`}
            aria-label={`Option ${index + 1}`}
            className={cn(FLAT_FIELD, "h-8 flex-1 text-sm")}
          />
          <Button
            variant="ghost"
            size="icon-xs"
            className="shrink-0 text-muted-foreground/70 opacity-0 transition-opacity group-hover/option:opacity-100 hover:text-destructive focus-visible:opacity-100"
            onClick={() => onOptionsChange(options.filter((_, i) => i !== index))}
            disabled={options.length <= 1}
            aria-label={`Remove option ${index + 1}`}
          >
            <X />
          </Button>
        </div>
      ))}

      {otherOption ? (
        <div className="group/other flex items-center gap-2.5 rounded-lg px-1 py-0.5 hover:bg-accent/30">
          <Marker />
          <span className="shrink-0 text-sm font-medium">Other:</span>
          <Input
            readOnly
            tabIndex={-1}
            aria-hidden="true"
            placeholder="Respondent's own answer"
            className={cn(FLAT_FIELD, "h-8 flex-1 cursor-default text-sm")}
          />
          <Button
            variant="ghost"
            size="icon-xs"
            className="shrink-0 text-muted-foreground/70 opacity-0 transition-opacity group-hover/other:opacity-100 hover:text-destructive focus-visible:opacity-100"
            onClick={() => onOtherChange(false)}
            aria-label="Remove Other option"
          >
            <X />
          </Button>
        </div>
      ) : null}

      <div className="flex flex-wrap items-center gap-3 px-1 pt-1">
        <Marker />
        <Button
          variant="ghost"
          className={GHOST_BUTTON}
          onClick={() => onOptionsChange([...options, `Option ${options.length + 1}`])}
        >
          <Plus className="size-3" />
          Add option
        </Button>
        {!otherOption ? (
          <Button
            variant="ghost"
            className={cn(GHOST_BUTTON, "gap-0 rounded-lg")}
            onClick={() => onOtherChange(true)}
          >
            Add “Other…”
          </Button>
        ) : null}
      </div>
    </div>
  );
}
