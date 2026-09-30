/**
 * Shared class treatments for the Build canvas. FLAT_FIELD makes an editing
 * field look like rendered form text (transparent, borderless) until hovered
 * or focused. The preview styles render the answer widget with minimal chrome
 * — an underline for single-line answers, a soft ghost fill for boxes — so the
 * card reads like the respondent-facing form instead of a stack of inputs.
 *
 * The `!` important markers are load-bearing: in the compiled Tailwind
 * stylesheet `.border-input` is emitted after `.border-transparent`, so a
 * plain override loses the cascade and a hairline border stays visible at
 * rest (most visible in light mode).
 *
 * The `-mx-2` + `px-2` pair is also deliberate: the field's TEXT aligns with
 * the surrounding rendered text at the column edge, while the negative margin
 * leaves room for hover/focus chrome to draw around the text.
 */
export const FLAT_FIELD =
  "h-auto -mx-2 rounded-md border-transparent! bg-transparent! px-2 py-1.5 shadow-none! dark:bg-transparent!";

/**
 * Rendered-text fields (question title, helper text, form/section/statement
 * text): no outline even on hover/focus — they already display as the final
 * form text, so the caret is the only editing cue.
 */
export const BARE_FIELD =
  "-mx-2 border-transparent! bg-transparent! px-2 py-1.5 shadow-none! hover:border-transparent! focus-visible:border-transparent! focus-visible:bg-transparent! focus-visible:ring-0! dark:bg-transparent! dark:focus-visible:bg-transparent!";

/** Single-line answer preview: just an underline, like a blank to fill in. */
export const ANSWER_UNDERLINE =
  "h-9 rounded-none border-0 border-b border-input bg-transparent! px-0 shadow-none! dark:bg-transparent! focus-visible:bg-transparent! focus-visible:ring-0! dark:focus-visible:bg-transparent!";

/** Boxed answer preview (paragraph, dropdown): borderless soft fill. */
export const ANSWER_GHOST =
  "rounded-lg border-transparent! bg-muted/40 shadow-none! dark:bg-muted/25 focus-visible:bg-muted/50 dark:focus-visible:bg-muted/25";

/**
 * Config value selects (scale bounds, star count) as quiet ghost chips.
 * Auto-width (the trigger's own w-fit) so the number is never clipped.
 */
export const GHOST_SELECT =
  "h-7 gap-1 border-transparent! bg-muted/40 px-2.5 font-medium shadow-none hover:border-primary/25! dark:bg-muted/25 dark:hover:bg-muted/40";

/** Config value inputs (number min/max) as the same quiet ghost chips. */
export const GHOST_INPUT =
  "h-7 border-transparent! bg-muted/40 px-2.5 text-xs shadow-none! hover:border-primary/25! dark:bg-muted/25 dark:hover:bg-muted/40";

/** Add-action buttons (+ option, + other, + row, + column) as ghost chips too. */
export const GHOST_BUTTON =
  "h-7 gap-1 rounded-lg bg-muted/40 px-2.5 text-xs font-medium text-muted-foreground shadow-none hover:bg-muted/60 hover:text-muted-foreground dark:bg-muted/25 dark:hover:bg-muted/40";

