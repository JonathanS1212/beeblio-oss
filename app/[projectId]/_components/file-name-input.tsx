"use client";

import { cn } from "@/lib/utils";

/**
 * Splits a file name into its editable stem and fixed extension. A leading
 * dot (".gitignore") is part of the name, not an extension.
 */
export function splitFileName(name: string) {
  const dot = name.lastIndexOf(".");
  return dot > 0
    ? { stem: name.slice(0, dot), extension: name.slice(dot) }
    : { stem: name, extension: "" };
}

/**
 * Name field that locks the file type in place: the stem is editable while
 * the extension rides along as a read-only suffix, so renames and saves
 * can't change what kind of file it is. Mirrors the shared Input's styling
 * (components/ui/input.tsx) with the focus state lifted onto the wrapper so
 * it spans both halves of the field.
 */
export function FileNameInput({
  value,
  onChange,
  onEnter,
  extension,
  autoFocus,
  ariaLabel,
  placeholder,
  disabled,
}: {
  value: string;
  onChange: (value: string) => void;
  /** Pressed only when provided; inside a <form>, omit it and let the form submit. */
  onEnter?: () => void;
  /** Includes the leading dot; empty for extension-less names. */
  extension: string;
  autoFocus?: boolean;
  ariaLabel?: string;
  placeholder?: string;
  disabled?: boolean;
}) {
  return (
    <div
      className={cn(
        "flex h-10 w-full items-stretch rounded-xl border border-input bg-card/75 shadow-[inset_0_1px_0_rgb(255_255_255/0.5),0_1px_2px_rgb(18_35_48/0.035)] transition-[border-color,box-shadow] hover:border-primary/25 focus-within:border-ring focus-within:bg-card focus-within:ring-[3px] focus-within:ring-ring/15 dark:bg-input/30",
        disabled && "pointer-events-none opacity-50",
      )}
    >
      <input
        value={value}
        onChange={(event) => onChange(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Enter" && onEnter) {
            event.preventDefault();
            onEnter();
          }
        }}
        autoFocus={autoFocus}
        aria-label={ariaLabel}
        placeholder={placeholder}
        disabled={disabled}
        className="h-full w-full min-w-0 bg-transparent px-3.5 text-base outline-none placeholder:text-muted-foreground/75 disabled:cursor-not-allowed md:text-sm"
      />
      {extension ? (
        <span
          className={cn(
            "flex shrink-0 select-none items-center whitespace-nowrap border-l border-input/70 bg-muted/50 px-3 text-sm text-muted-foreground dark:bg-muted/30",
          )}
          title="File type"
        >
          {extension}
        </span>
      ) : null}
    </div>
  );
}
