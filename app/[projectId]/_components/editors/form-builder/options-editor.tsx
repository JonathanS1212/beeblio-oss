"use client";

import { Plus, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

import { FLAT_FIELD, GHOST_BUTTON } from "./styles";

/**
 * Editable list of row/column/option strings (dropdown options, matrix rows
 * and columns). Kept tolerant of in-progress typing: empty entries are
 * preserved locally and only rejected when the form is saved (normalization
 * pass).
 */
export function OptionsEditor({
  title,
  options,
  onChange,
  addLabel = "Add option",
  emptyPlaceholder = "Option",
}: {
  title?: string;
  options: string[];
  onChange: (next: string[]) => void;
  addLabel?: string;
  emptyPlaceholder?: string;
}) {
  const update = (index: number, value: string) =>
    onChange(options.map((option, i) => (i === index ? value : option)));

  const remove = (index: number) => onChange(options.filter((_, i) => i !== index));

  return (
    <div className="space-y-0.5">
      {title ? (
        <span className="text-xs font-medium text-muted-foreground">{title}</span>
      ) : null}
      {options.map((option, index) => (
        <div
          key={index}
          className="group/entry flex items-center gap-1.5 rounded-lg px-1 py-0.5 hover:bg-accent/30"
        >
          <Input
            value={option}
            onChange={(event) => update(index, event.target.value)}
            placeholder={`${emptyPlaceholder} ${index + 1}`}
            className={cn(FLAT_FIELD, "h-8 flex-1 text-sm")}
            aria-label={`${emptyPlaceholder} ${index + 1}`}
          />
          <Button
            variant="ghost"
            size="icon-xs"
            className="shrink-0 text-muted-foreground/70 opacity-0 transition-opacity group-hover/entry:opacity-100 hover:text-destructive focus-visible:opacity-100"
            onClick={() => remove(index)}
            disabled={options.length <= 1}
            aria-label={`Remove ${emptyPlaceholder.toLowerCase()} ${index + 1}`}
          >
            <X />
          </Button>
        </div>
      ))}
      <Button
        variant="ghost"
        className={GHOST_BUTTON}
        onClick={() => onChange([...options, `${emptyPlaceholder} ${options.length + 1}`])}
      >
        <Plus className="size-3" />
        {addLabel}
      </Button>
    </div>
  );
}
