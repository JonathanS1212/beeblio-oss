import { z } from "zod";

/**
 * Beeblio survey form definition — the shared contract between the visual
 * builder (web), the agent's create_form tool, and the embedded form runtime.
 *
 * A form lives in the project workspace as a single self-contained
 * `*.form.html` file whose `<script type="application/json"
 * id="beeblio-form-definition">` block holds the canonical definition
 * serialized from this schema. See lib/forms/generate.ts.
 */

export const FORM_FILE_SUFFIX = ".form.html";
/** Forms and their responses always live here (directly, no subfolder), regardless of where they are created. */
export const FORMS_DIRECTORY = "2-Data";
export const FORM_MARKER_CONTENT = "v1";
/** Cheap sniff used by the share page to route forms to the respondent view. */
export const FORM_MARKER_PATTERN = /<meta\s+name=["']beeblio-form["']\s+content=["']v1["']/i;
export const FORM_DEFINITION_SCRIPT_ID = "beeblio-form-definition";

/** Column key reserved for the submission timestamp; block ids cannot use it. */
export const SUBMITTED_AT_KEY = "submitted_at";
/** Hidden anti-spam field name emitted by the runtime; never a real answer. */
export const HONEYPOT_KEY = "_beeblio_hp";
/** Value marking an "Other" choice; the free-text answer arrives separately. */
export const OTHER_VALUE = "__other__";
export const OTHER_KEY_SUFFIX = "__other";

export const BLOCK_TYPES = [
  "shortText",
  "longText",
  "email",
  "number",
  "date",
  "multipleChoice",
  "checkboxes",
  "dropdown",
  "linearScale",
  "rating",
  "matrix",
  "section",
  "statement",
] as const;

/**
 * Sibling CSV file that collects a form's submissions, e.g.
 * "2-Data/survey.form.html" → "2-Data/survey.responses.csv".
 */
export function responsesPathFor(formPath: string): string {
  if (formPath.toLowerCase().endsWith(FORM_FILE_SUFFIX)) {
    return `${formPath.slice(0, -FORM_FILE_SUFFIX.length)}.responses.csv`;
  }
  return `${formPath.replace(/\.html$/i, "")}.responses.csv`;
}

export type BlockType = (typeof BLOCK_TYPES)[number];

/** Builder palette metadata; labels double as the palette entry text. */
export const BLOCK_TYPE_META: Record<
  BlockType,
  { label: string; description: string }
> = {
  shortText: { label: "Short answer", description: "A single-line text answer" },
  longText: { label: "Paragraph", description: "A long, multi-line text answer" },
  email: { label: "Email", description: "An email address" },
  number: { label: "Number", description: "A numeric answer with optional min/max" },
  date: { label: "Date", description: "A date picker" },
  multipleChoice: { label: "Multiple choice", description: "One answer from radio options" },
  checkboxes: { label: "Checkboxes", description: "Any number of options" },
  dropdown: { label: "Dropdown", description: "One answer from a select list" },
  linearScale: { label: "Linear scale", description: "A Likert-style 1–N scale" },
  rating: { label: "Rating", description: "A 1–N star rating" },
  matrix: { label: "Multiple-choice grid", description: "One choice per grid row" },
  section: { label: "Section break", description: "Starts a new page of questions" },
  statement: { label: "Statement", description: "Display-only title and text" },
};

const BLOCK_ID_PATTERN = /^[a-z0-9][a-z0-9_]{0,63}$/;

const blockIdSchema = z
  .string()
  .regex(BLOCK_ID_PATTERN, "Block ids are lowercase slugs (letters, digits, underscores)");

const labelSchema = z.string().trim().min(1).max(2_000);
const helpSchema = z.string().trim().max(2_000);
const optionsSchema = z
  .array(z.string().trim().min(1).max(500))
  .min(1)
  .max(100);

const baseBlockFields = {
  id: blockIdSchema,
  label: labelSchema,
  help: helpSchema.optional(),
  required: z.boolean().optional(),
};

const scaleSchema = z
  .object({
    from: z.number().int().min(0).max(1),
    to: z.number().int().min(2).max(10),
    fromLabel: z.string().trim().max(200).optional(),
    toLabel: z.string().trim().max(200).optional(),
  })
  .strict()
  .refine((scale) => scale.to > scale.from, {
    message: "Scale `to` must be greater than `from`",
  });

export const blockSchema = z.discriminatedUnion("type", [
  z.object({ ...baseBlockFields, type: z.literal("shortText"), placeholder: z.string().trim().max(300).optional() }).strict(),
  z.object({ ...baseBlockFields, type: z.literal("longText"), placeholder: z.string().trim().max(300).optional() }).strict(),
  z.object({ ...baseBlockFields, type: z.literal("email") }).strict(),
  z
    .object({
      ...baseBlockFields,
      type: z.literal("number"),
      min: z.number().optional(),
      max: z.number().optional(),
    })
    .strict()
    .refine((block) => block.max === undefined || block.min === undefined || block.max >= block.min, {
      message: "Number `max` must be greater than or equal to `min`",
    }),
  z.object({ ...baseBlockFields, type: z.literal("date") }).strict(),
  z
    .object({
      ...baseBlockFields,
      type: z.literal("multipleChoice"),
      options: optionsSchema,
      otherOption: z.boolean().optional(),
    })
    .strict(),
  z
    .object({
      ...baseBlockFields,
      type: z.literal("checkboxes"),
      options: optionsSchema,
      otherOption: z.boolean().optional(),
    })
    .strict(),
  z.object({ ...baseBlockFields, type: z.literal("dropdown"), options: optionsSchema }).strict(),
  z.object({ ...baseBlockFields, type: z.literal("linearScale"), scale: scaleSchema }).strict(),
  z
    .object({
      ...baseBlockFields,
      type: z.literal("rating"),
      maxStars: z.number().int().min(3).max(10).optional(),
    })
    .strict(),
  z
    .object({
      ...baseBlockFields,
      type: z.literal("matrix"),
      rows: z.array(z.string().trim().min(1).max(500)).min(1).max(50),
      columns: z.array(z.string().trim().min(1).max(200)).min(2).max(10),
    })
    .strict(),
  z
    .object({
      id: blockIdSchema,
      type: z.literal("section"),
      title: labelSchema,
      description: z.string().trim().max(4_000).optional(),
    })
    .strict(),
  z
    .object({
      id: blockIdSchema,
      type: z.literal("statement"),
      title: labelSchema,
      body: z.string().trim().max(4_000).optional(),
    })
    .strict(),
]);

export const formSettingsSchema = z
  .object({
    confirmationMessage: z.string().trim().max(2_000).optional(),
  })
  .strict();

export const formDefinitionSchema = z
  .object({
    version: z.literal(1),
    title: z.string().trim().min(1).max(300),
    description: z.string().trim().max(4_000).optional(),
    settings: formSettingsSchema.optional(),
    blocks: z.array(blockSchema).min(1).max(200),
  })
  .strict();

export type FormBlock = z.infer<typeof blockSchema>;
export type FormDefinition = z.infer<typeof formDefinitionSchema>;
/** Blocks that carry answers (everything except section/statement). */
export type QuestionBlock = Exclude<FormBlock, { type: "section" } | { type: "statement" }>;

/** Question blocks carry answers; sections/statements structure the form. */
export function isQuestionBlock(block: FormBlock): block is QuestionBlock {
  return block.type !== "section" && block.type !== "statement";
}

export class FormSchemaError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "FormSchemaError";
  }
}

const RESERVED_KEYS = new Set([SUBMITTED_AT_KEY, HONEYPOT_KEY]);

/**
 * Slugify arbitrary text into a valid block id / CSV column key:
 * "How satisfied are you?" → "how_satisfied_are_you".
 */
export function slugifyKey(text: string): string {
  const slug = text
    .toLocaleLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 64)
    .replace(/_+$/, "");
  return slug || "q";
}

function uniqueKey(candidate: string, taken: Set<string>): string {
  // slugifyKey already yields pattern-valid slugs; only reserved names need a
  // prefix to stay out of the runtime/CSV namespace.
  let key = RESERVED_KEYS.has(candidate) ? `q_${candidate}`.slice(0, 64) : candidate;
  let suffix = 2;
  while (taken.has(key)) {
    key = `${candidate}_${suffix}`.slice(0, 64);
    suffix += 1;
  }
  taken.add(key);
  return key;
}

function cleanText(value: unknown, max: number): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed === "" ? undefined : trimmed.slice(0, max);
}

function cleanTextList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const cleaned = value
    .map((entry) => (typeof entry === "string" ? entry.trim().slice(0, 500) : ""))
    .filter((entry) => entry !== "");
  return [...new Set(cleaned)];
}

/**
 * Lenient coercion from loosely-shaped input (agent JSON, hand edits) into the
 * canonical definition: ids are slugified and de-duplicated (deriving from the
 * label when absent), booleans/nudmers are coerced, blank strings dropped.
 * Throws FormSchemaError with a readable message when the input cannot produce
 * a valid definition.
 */
export function parseFormDefinition(input: unknown): FormDefinition {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    throw new FormSchemaError("The form definition must be a JSON object.");
  }
  const raw = input as Record<string, unknown>;

  const title = cleanText(raw.title, 300);
  if (!title) throw new FormSchemaError("The form needs a non-empty title.");

  const rawBlocks = Array.isArray(raw.blocks) ? raw.blocks : [];
  if (rawBlocks.length === 0) {
    throw new FormSchemaError("The form needs at least one block (question, section, or statement).");
  }
  if (rawBlocks.length > 200) {
    throw new FormSchemaError("The form has too many blocks (maximum 200).");
  }

  const takenIds = new Set<string>();
  const rawSettings = (raw.settings ?? {}) as Record<string, unknown>;
  const settings: FormDefinition["settings"] = {};
  const confirmationMessage = cleanText(rawSettings.confirmationMessage, 2_000);
  if (confirmationMessage) settings.confirmationMessage = confirmationMessage;

  const description = cleanText(raw.description, 4_000);

  const blocks: unknown[] = [];
  for (const [index, entry] of rawBlocks.entries()) {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
      throw new FormSchemaError(`Block ${index + 1} must be an object.`);
    }
    const block = entry as Record<string, unknown>;
    const type = typeof block.type === "string" ? block.type : "";
    if (!(BLOCK_TYPES as readonly string[]).includes(type)) {
      throw new FormSchemaError(
        `Block ${index + 1} has an unknown type "${type}". Valid types: ${BLOCK_TYPES.join(", ")}.`,
      );
    }

    // Sections and statements carry a title instead of a label; everything
    // else must have a question label to slug an id from.
    const nameSource =
      type === "section" || type === "statement"
        ? cleanText(block.title, 2_000)
        : cleanText(block.label, 2_000);
    if (!nameSource) {
      throw new FormSchemaError(`Block ${index + 1} (type ${type}) needs a non-empty ${type === "section" || type === "statement" ? "title" : "label"}.`);
    }

    const id = uniqueKey(
      typeof block.id === "string" && block.id.trim() !== ""
        ? slugifyKey(block.id)
        : slugifyKey(nameSource),
      takenIds,
    );

    const help = cleanText(block.help, 2_000);
    const required = block.required === true ? true : undefined;

    if (type === "section") {
      blocks.push({
        id,
        type,
        title: nameSource,
        ...(cleanText(block.description, 4_000) ? { description: cleanText(block.description, 4_000) } : {}),
      });
      continue;
    }
    if (type === "statement") {
      blocks.push({
        id,
        type,
        title: nameSource,
        ...(cleanText(block.body, 4_000) ? { body: cleanText(block.body, 4_000) } : {}),
      });
      continue;
    }

    const base = {
      id,
      type,
      label: nameSource,
      ...(help ? { help } : {}),
      ...(required ? { required: true } : {}),
    };

    switch (type) {
      case "shortText":
      case "longText": {
        const placeholder = cleanText(block.placeholder, 300);
        blocks.push({ ...base, ...(placeholder ? { placeholder } : {}) });
        break;
      }
      case "email": {
        blocks.push({ ...base });
        break;
      }
      case "number": {
        const min = typeof block.min === "number" && Number.isFinite(block.min) ? block.min : undefined;
        const max = typeof block.max === "number" && Number.isFinite(block.max) ? block.max : undefined;
        if (min !== undefined && max !== undefined && max < min) {
          throw new FormSchemaError(`Block "${nameSource}": number max must be ≥ min.`);
        }
        blocks.push({ ...base, ...(min !== undefined ? { min } : {}), ...(max !== undefined ? { max } : {}) });
        break;
      }
      case "date": {
        blocks.push({ ...base });
        break;
      }
      case "multipleChoice":
      case "checkboxes": {
        const options = cleanTextList(block.options);
        if (options.length === 0) {
          throw new FormSchemaError(`Block "${nameSource}" needs at least one non-empty option.`);
        }
        blocks.push({ ...base, options, ...(block.otherOption === true ? { otherOption: true } : {}) });
        break;
      }
      case "dropdown": {
        const options = cleanTextList(block.options);
        if (options.length === 0) {
          throw new FormSchemaError(`Block "${nameSource}" needs at least one non-empty option.`);
        }
        blocks.push({ ...base, options });
        break;
      }
      case "linearScale": {
        const rawScale = (block.scale ?? {}) as Record<string, unknown>;
        const from = rawScale.from === 0 ? 0 : typeof rawScale.from === "number" ? rawScale.from : 1;
        const to = typeof rawScale.to === "number" ? rawScale.to : 5;
        if (to <= from || to > 10 || from < 0 || from > 1) {
          throw new FormSchemaError(
            `Block "${nameSource}": linearScale must go from 0 or 1 up to at most 10 (got ${from}–${to}).`,
          );
        }
        const fromLabel = cleanText(rawScale.fromLabel, 200);
        const toLabel = cleanText(rawScale.toLabel, 200);
        blocks.push({
          ...base,
          scale: {
            from,
            to,
            ...(fromLabel ? { fromLabel } : {}),
            ...(toLabel ? { toLabel } : {}),
          },
        });
        break;
      }
      case "rating": {
        const rawStars = typeof block.maxStars === "number" ? Math.round(block.maxStars) : 5;
        const maxStars = Math.min(10, Math.max(3, rawStars));
        blocks.push({ ...base, ...(maxStars !== 5 ? { maxStars } : {}) });
        break;
      }
      case "matrix": {
        const rows = cleanTextList(block.rows);
        const columns = cleanTextList(block.columns);
        if (rows.length === 0 || columns.length < 2) {
          throw new FormSchemaError(
            `Block "${nameSource}": matrix needs at least one row and two columns.`,
          );
        }
        blocks.push({
          ...base,
          rows: rows.slice(0, 50),
          columns: columns.slice(0, 10),
        });
        break;
      }
    }
  }

  const candidate = {
    version: 1,
    title,
    ...(description ? { description } : {}),
    ...(Object.keys(settings).length > 0 ? { settings } : {}),
    blocks,
  } as unknown;

  const result = formDefinitionSchema.safeParse(candidate);
  if (!result.success) {
    const issue = result.error.issues[0];
    const path = issue?.path.length > 0 ? ` at ${issue.path.join(".")}` : "";
    throw new FormSchemaError(`Invalid form definition${path}: ${issue?.message ?? "unknown error"}`);
  }
  return result.data;
}

/** A blank builder-ready definition with a single starter question. */
export function createBlankDefinition(title: string): FormDefinition {
  return parseFormDefinition({
    version: 1,
    title,
    blocks: [{ type: "shortText", label: "Your first question" }],
    settings: { confirmationMessage: "Thanks — your response was recorded." },
  });
}

/** Default block payload for the builder's palette, with a fresh unique id. */
export function createBlock(type: BlockType, takenIds: Set<string>): FormBlock {
  const labelByType: Record<BlockType, string> = {
    shortText: "Short answer question",
    longText: "Paragraph question",
    email: "Email address",
    number: "Number question",
    date: "Date question",
    multipleChoice: "Multiple choice question",
    checkboxes: "Checkbox question",
    dropdown: "Dropdown question",
    linearScale: "Linear scale question",
    rating: "Rating question",
    matrix: "Grid question",
    section: "New section",
    statement: "Statement",
  };
  const draft: Record<string, unknown> = { type };
  if (type === "section" || type === "statement") {
    draft.title = labelByType[type];
  } else {
    draft.label = labelByType[type];
  }
  switch (type) {
    case "multipleChoice":
    case "checkboxes":
      draft.options = ["Option 1", "Option 2"];
      break;
    case "dropdown":
      draft.options = ["Option 1", "Option 2", "Option 3"];
      break;
    case "linearScale":
      draft.scale = { from: 1, to: 5, fromLabel: "Strongly Disagree", toLabel: "Strongly Agree" };
      break;
    case "matrix":
      draft.rows = ["Row 1", "Row 2"];
      draft.columns = ["Column 1", "Column 2"];
      break;
  }
  const label = (draft.label ?? draft.title) as string;
  draft.id = uniqueKey(slugifyKey(label), takenIds);
  const normalized = parseFormDefinition({ version: 1, title: "Untitled form", blocks: [draft] });
  return normalized.blocks[0];
}
