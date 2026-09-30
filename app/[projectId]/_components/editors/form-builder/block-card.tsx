"use client";

import {
  ArrowDown,
  ArrowUp,
  ChevronDown,
  Copy,
  Heading,
  SeparatorHorizontal,
  Trash2,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { BLOCK_TYPE_META, type FormBlock, type QuestionBlock } from "@/lib/forms/schema";
import { cn } from "@/lib/utils";

import { ChoiceOptionsEditor } from "./choice-options-editor";
import { OptionsEditor } from "./options-editor";
import {
  ANSWER_GHOST,
  ANSWER_UNDERLINE,
  BARE_FIELD,
  FLAT_FIELD,
  GHOST_INPUT,
  GHOST_SELECT,
} from "./styles";

/**
 * One editable block in the builder canvas. The card body mirrors the
 * respondent-facing form (question text, helper text, and the actual widget
 * preview), while editing controls live in a footer bar — so Build looks as
 * close to Preview as possible. Edits are raw and immediate (no per-keystroke
 * normalization); validation happens when the form is saved, so typing spaces
 * or clearing a field mid-edit never fights the user.
 */
export function BlockCard({
  block,
  questionNumber,
  isFirst,
  isLast,
  onChange,
  onDelete,
  onMove,
  onDuplicate,
}: {
  block: FormBlock;
  questionNumber: number | null;
  isFirst: boolean;
  isLast: boolean;
  onChange: (next: FormBlock) => void;
  onDelete: () => void;
  onMove: (direction: -1 | 1) => void;
  onDuplicate: () => void;
}) {
  const patch = (fields: Partial<FormBlock>) => onChange({ ...block, ...fields } as FormBlock);

  const isQuestion = block.type !== "section" && block.type !== "statement";
  const typeLabel = BLOCK_TYPE_META[block.type].label;
  const displayName = isQuestion ? block.label : block.title;

  return (
    <div className="rounded-xl border bg-card px-4 py-4 shadow-sm sm:px-6 sm:py-5">
      {block.type === "section" ? (
        <div className="space-y-1">
          <KindBadge icon={SeparatorHorizontal} label="Section break — starts a new page" />
          <Input
            value={block.title}
            onChange={(event) => patch({ title: event.target.value })}
            placeholder="Section title"
            aria-label="Section title"
            className={cn(BARE_FIELD, "text-lg font-semibold md:text-lg")}
          />
          <Textarea
            value={block.description ?? ""}
            onChange={(event) => patch({ description: event.target.value || undefined })}
            placeholder="Section description (optional)"
            aria-label="Section description"
            className={cn(BARE_FIELD, "min-h-8 text-[15px] text-muted-foreground md:text-[15px]")}
          />
        </div>
      ) : block.type === "statement" ? (
        <div className="space-y-1">
          <KindBadge icon={Heading} label="Statement" />
          <Input
            value={block.title}
            onChange={(event) => patch({ title: event.target.value })}
            placeholder="Statement title"
            aria-label="Statement title"
            className={cn(BARE_FIELD, "text-lg font-semibold md:text-lg")}
          />
          <Textarea
            value={block.body ?? ""}
            onChange={(event) => patch({ body: event.target.value || undefined })}
            placeholder="Statement text (optional)"
            aria-label="Statement text"
            className={cn(BARE_FIELD, "min-h-14 text-[13px] text-muted-foreground md:text-[13px]")}
          />
        </div>
      ) : (
        <QuestionBody block={block} patch={patch} />
      )}

      <div className="mt-3 flex items-center gap-2 pt-1">
        <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground/80">
          {isQuestion && questionNumber !== null ? `${questionNumber} · ` : ""}
          {typeLabel}
        </span>
        <div className="ml-auto flex items-center gap-1.5">
          {isQuestion ? (
            <label className="flex cursor-pointer items-center gap-1.5 text-[11px] text-muted-foreground">
              Required
              <Switch
                checked={block.required === true}
                onCheckedChange={(checked) => patch({ required: checked || undefined })}
                aria-label={`Mark ${displayName} as required`}
              />
            </label>
          ) : null}
          <div className="flex items-center gap-0.5">
            <Button variant="ghost" size="icon-xs" className="text-muted-foreground" disabled={isFirst} onClick={() => onMove(-1)} aria-label="Move up"><ArrowUp /></Button>
            <Button variant="ghost" size="icon-xs" className="text-muted-foreground" disabled={isLast} onClick={() => onMove(1)} aria-label="Move down"><ArrowDown /></Button>
            <Button variant="ghost" size="icon-xs" className="text-muted-foreground" onClick={onDuplicate} aria-label="Duplicate block"><Copy /></Button>
            <Button variant="ghost" size="icon-xs" className="text-muted-foreground hover:text-destructive" onClick={onDelete} aria-label="Delete block"><Trash2 /></Button>
          </div>
        </div>
      </div>
    </div>
  );
}

function KindBadge({ icon: Icon, label }: { icon: typeof Heading; label: string }) {
  return (
    <div className="flex items-center gap-1.5 text-muted-foreground/80">
      <Icon className="size-3.5" />
      <span className="text-[10px] font-medium uppercase tracking-wider">{label}</span>
    </div>
  );
}

/** Compact labeled row for secondary settings (placeholder, min/max, stars, …).
 * `stacked` puts the label above the field(s) for full-width inputs. */
function SettingRow({
  label,
  stacked = false,
  children,
}: {
  label: string;
  stacked?: boolean;
  children: React.ReactNode;
}) {
  if (stacked) {
    return (
      <div className="space-y-1">
        <span className="block text-xs text-muted-foreground">{label}</span>
        {children}
      </div>
    );
  }
  return (
    <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
      <span className="shrink-0">{label}</span>
      {children}
    </div>
  );
}

function QuestionBody({
  block,
  patch,
}: {
  block: QuestionBlock;
  patch: (fields: Partial<FormBlock>) => void;
}) {
  return (
    <div>
      <Input
        value={block.label}
        onChange={(event) => patch({ label: event.target.value })}
        placeholder="Question"
        aria-label="Question"
        className={cn(BARE_FIELD, "pb-0.5 text-[15px] font-semibold md:text-[15px]")}
      />
      <Input
        value={block.help ?? ""}
        onChange={(event) => patch({ help: event.target.value || undefined })}
        placeholder="Helper text (optional)"
        aria-label="Helper text"
        className={cn(
          BARE_FIELD,
          "mt-1.5 h-7 text-[13px] text-muted-foreground md:text-[13px]",
        )}
      />

      <div className="mt-3.5 space-y-2.5">
        {(block.type === "shortText" || block.type === "longText") && (
          <>
            {block.type === "longText" ? (
              <Textarea
                readOnly
                tabIndex={-1}
                aria-hidden="true"
                placeholder={block.placeholder || "Long answer text"}
                className={cn(ANSWER_GHOST, "min-h-24 cursor-default resize-none")}
              />
            ) : (
              <Input
                readOnly
                tabIndex={-1}
                aria-hidden="true"
                placeholder={block.placeholder || "Short answer text"}
                className={cn(ANSWER_UNDERLINE, "cursor-default")}
              />
            )}
            <SettingRow label="Placeholder" stacked>
              <Input
                value={block.placeholder ?? ""}
                onChange={(event) => patch({ placeholder: event.target.value || undefined })}
                placeholder="Ghost text inside the answer box (optional)"
                aria-label="Answer placeholder"
                className={cn(FLAT_FIELD, "h-7 text-xs")}
              />
            </SettingRow>
          </>
        )}

        {block.type === "email" && (
          <Input
            readOnly
            tabIndex={-1}
            aria-hidden="true"
            type="email"
            placeholder="name@example.com"
            className={cn(ANSWER_UNDERLINE, "cursor-default")}
          />
        )}

        {block.type === "number" && (
          <>
            <Input
              readOnly
              tabIndex={-1}
              aria-hidden="true"
              type="number"
              className={cn(ANSWER_UNDERLINE, "cursor-default")}
            />
            <SettingRow label="Range">
              <Input
                type="number"
                value={block.min ?? ""}
                onChange={(event) =>
                  patch({ min: event.target.value === "" ? undefined : Number(event.target.value) })
                }
                placeholder="Min"
                aria-label="Minimum value"
                className={cn(GHOST_INPUT, "w-20")}
              />
              <span aria-hidden="true">–</span>
              <Input
                type="number"
                value={block.max ?? ""}
                onChange={(event) =>
                  patch({ max: event.target.value === "" ? undefined : Number(event.target.value) })
                }
                placeholder="Max"
                aria-label="Maximum value"
                className={cn(GHOST_INPUT, "w-20")}
              />
            </SettingRow>
          </>
        )}

        {block.type === "date" && (
          <Input
            readOnly
            tabIndex={-1}
            aria-hidden="true"
            type="date"
            className={cn(ANSWER_UNDERLINE, "cursor-default")}
          />
        )}

        {(block.type === "multipleChoice" || block.type === "checkboxes") && (
          <ChoiceOptionsEditor
            kind={block.type === "multipleChoice" ? "radio" : "checkbox"}
            options={block.options}
            onOptionsChange={(options) => patch({ options })}
            otherOption={block.otherOption === true}
            onOtherChange={(enabled) => patch({ otherOption: enabled || undefined })}
          />
        )}

        {block.type === "dropdown" && (
          <>
            <div
              aria-hidden="true"
              className="flex h-10 w-full items-center rounded-lg bg-muted/40 px-3.5 pr-3.5 text-sm text-muted-foreground dark:bg-muted/25"
            >
              <span className="truncate">Select an option</span>
              <ChevronDown className="ml-auto size-4 opacity-60" />
            </div>
            <OptionsEditor
              options={block.options}
              onChange={(options) => patch({ options })}
            />
          </>
        )}

        {block.type === "linearScale" && (
          <>
            <div aria-hidden="true" className="flex flex-wrap items-center justify-center gap-1.5 py-0.5">
              {Array.from(
                { length: block.scale.to - block.scale.from + 1 },
                (_, index) => block.scale.from + index,
              ).map((value) => (
                <span
                  key={value}
                  className="inline-flex min-w-10 items-center justify-center rounded-lg border px-2.5 py-2 text-sm font-medium"
                >
                  {value}
                </span>
              ))}
            </div>
            <div className="flex flex-col gap-1 sm:flex-row sm:justify-between">
              <Input
                value={block.scale.fromLabel ?? ""}
                onChange={(event) =>
                  patch({ scale: { ...block.scale, fromLabel: event.target.value || undefined } })
                }
                placeholder="Start label (e.g. Strongly disagree)"
                aria-label="Scale start label"
                className={cn(FLAT_FIELD, "h-7 text-xs text-muted-foreground sm:max-w-[45%]")}
              />
              <Input
                value={block.scale.toLabel ?? ""}
                onChange={(event) =>
                  patch({ scale: { ...block.scale, toLabel: event.target.value || undefined } })
                }
                placeholder="End label (e.g. Strongly Agree)"
                aria-label="Scale end label"
                className={cn(
                  FLAT_FIELD,
                  "h-7 text-right text-xs text-muted-foreground sm:max-w-[45%]",
                )}
              />
            </div>
            <SettingRow label="Scale">
              <Select
                value={String(block.scale.from)}
                onValueChange={(value) => patch({ scale: { ...block.scale, from: Number(value) } })}
              >
                <SelectTrigger aria-label="Scale start" className={GHOST_SELECT}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="0">0</SelectItem>
                  <SelectItem value="1">1</SelectItem>
                </SelectContent>
              </Select>
              <span aria-hidden="true">to</span>
              <Select
                value={String(block.scale.to)}
                onValueChange={(value) => patch({ scale: { ...block.scale, to: Number(value) } })}
              >
                <SelectTrigger aria-label="Scale end" className={GHOST_SELECT}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {[2, 3, 4, 5, 6, 7, 8, 9, 10].map((value) => (
                    <SelectItem key={value} value={String(value)}>{value}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </SettingRow>
          </>
        )}

        {block.type === "rating" && (
          <>
            <div aria-hidden="true" className="flex flex-wrap gap-1 py-1">
              {Array.from({ length: block.maxStars ?? 5 }, (_, index) => (
                <span key={index} className="text-[26px] leading-none text-border">
                  ★
                </span>
              ))}
            </div>
            <SettingRow label="Stars">
              <Select
                value={String(block.maxStars ?? 5)}
                onValueChange={(value) =>
                  patch({ maxStars: Number(value) === 5 ? undefined : (Number(value) as 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10) })
                }
              >
                <SelectTrigger aria-label="Number of stars" className={GHOST_SELECT}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {[3, 4, 5, 6, 7, 8, 9, 10].map((value) => (
                    <SelectItem key={value} value={String(value)}>{value}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </SettingRow>
          </>
        )}

        {block.type === "matrix" && (
          <>
            <div aria-hidden="true" className="overflow-x-auto">
              <table className="w-full min-w-[420px] border-collapse text-sm">
                <thead>
                  <tr>
                    <th className="w-28" />
                    {block.columns.map((column) => (
                      <th
                        key={column}
                        className="border-b border-border/50 px-2.5 pb-2 text-center text-xs font-normal text-muted-foreground"
                      >
                        {column}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {block.rows.map((row) => (
                    <tr key={row}>
                      <td className="border-b border-border/50 px-2.5 py-2.5 align-top font-medium">
                        {row}
                      </td>
                      {block.columns.map((column) => (
                        <td key={column} className="border-b border-border/50 px-2.5 py-2.5">
                          <div className="flex justify-center">
                            <input type="radio" disabled className="size-4 accent-primary" />
                          </div>
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="grid gap-3 md:grid-cols-2">
              <OptionsEditor
                title="Rows"
                options={block.rows}
                onChange={(rows) => patch({ rows })}
                addLabel="Add row"
                emptyPlaceholder="Row"
              />
              <OptionsEditor
                title="Columns"
                options={block.columns}
                onChange={(columns) => patch({ columns })}
                addLabel="Add column"
                emptyPlaceholder="Column"
              />
            </div>
          </>
        )}
      </div>
    </div>
  );
}
