import {
  isQuestionBlock,
  OTHER_KEY_SUFFIX,
  OTHER_VALUE,
  slugifyKey,
  SUBMITTED_AT_KEY,
  type FormBlock,
  type FormDefinition,
} from "./schema.ts";

/**
 * Single source of truth for how form answers map to response-file columns.
 * The generator (lib/forms/generate.ts) uses the same field-key helpers for
 * input names, and the submit endpoint (app/api/share/[shareId]/submit) uses
 * buildSubmissionRow to turn posted fields into CSV values — so the runtime,
 * the header, and the stored row can never drift apart.
 */

export type FormColumn = {
  key: string;
  blockId: string;
  type: FormBlock["type"];
};

export function otherFieldKey(blockId: string): string {
  return `${blockId}${OTHER_KEY_SUFFIX}`;
}

/** Unique field keys for a matrix block's rows (two rows may slug identically). */
export function matrixFieldKeys(block: Extract<FormBlock, { type: "matrix" }>): string[] {
  const keys: string[] = [];
  const taken = new Set<string>();
  for (const row of block.rows) {
    let key = `${block.id}__${slugifyKey(row)}`.slice(0, 64);
    let suffix = 2;
    while (taken.has(key)) {
      key = `${block.id}__${slugifyKey(row)}_${suffix}`.slice(0, 64);
      suffix += 1;
    }
    taken.add(key);
    keys.push(key);
  }
  return keys;
}

/** Ordered response columns: timestamp first, then every answerable block. */
export function formColumns(definition: FormDefinition): FormColumn[] {
  const columns: FormColumn[] = [
    { key: SUBMITTED_AT_KEY, blockId: "", type: "section" },
  ];
  for (const block of definition.blocks) {
    if (!isQuestionBlock(block)) continue;
    if (block.type === "matrix") {
      for (const key of matrixFieldKeys(block)) {
        columns.push({ key, blockId: block.id, type: block.type });
      }
      continue;
    }
    columns.push({ key: block.id, blockId: block.id, type: block.type });
  }
  return columns;
}

/** Posted fields as the runtime sends them (every name may repeat). */
export type ParsedFields = Record<string, string[]>;

/**
 * Converts posted form fields into keyed response values, resolving the
 * "Other" convention (radio/checkbox value __other__ + free-text field) and
 * joining multi-selects with "; ". Values for keys the form no longer defines
 * are preserved by the caller (header union), not here.
 */
export function buildSubmissionRow(
  definition: FormDefinition,
  fields: ParsedFields,
): Record<string, string> {
  const row: Record<string, string> = {
    [SUBMITTED_AT_KEY]: new Date().toISOString(),
  };
  for (const block of definition.blocks) {
    if (!isQuestionBlock(block)) continue;
    if (block.type === "matrix") {
      const keys = matrixFieldKeys(block);
      block.rows.forEach((_, index) => {
        row[keys[index]] = (fields[keys[index]] ?? [])[0] ?? "";
      });
      continue;
    }
    const values = fields[block.id] ?? [];
    const otherText = (fields[otherFieldKey(block.id)] ?? [])[0]?.trim() ?? "";
    if (block.type === "checkboxes") {
      const chosen = values.filter((value) => value !== OTHER_VALUE);
      if (values.includes(OTHER_VALUE) && otherText !== "") chosen.push(otherText);
      row[block.id] = chosen.join("; ");
    } else if (block.type === "multipleChoice") {
      const value = values[0] ?? "";
      row[block.id] = value === OTHER_VALUE ? otherText : value;
    } else {
      row[block.id] = values[0] ?? "";
    }
  }
  return row;
}
