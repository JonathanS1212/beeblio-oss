import { parseFormDefinition, FORM_DEFINITION_SCRIPT_ID, FORM_MARKER_PATTERN, type FormDefinition } from "./schema.ts";

/**
 * Extracts the canonical form definition from a generated `.form.html`
 * document. Used by the visual builder (edit round-trip) and the submit
 * endpoint (column resolution); both can rely on the definition surviving a
 * generate → parse cycle unchanged.
 */

export class FormParseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "FormParseError";
  }
}

const DEFINITION_SCRIPT_PATTERN = new RegExp(
  `<script[^>]*id=["']${FORM_DEFINITION_SCRIPT_ID}["'][^>]*>([\\s\\S]*?)</script>`,
  "i",
);

/** True when the HTML looks like a Beeblio form (cheap routing sniff). */
export function isFormHtml(html: string): boolean {
  return FORM_MARKER_PATTERN.test(html) || DEFINITION_SCRIPT_PATTERN.test(html);
}

export function parseFormHtml(html: string): FormDefinition {
  const match = html.match(DEFINITION_SCRIPT_PATTERN);
  if (!match) {
    throw new FormParseError("This HTML file has no embedded form definition.");
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(match[1]);
  } catch (error) {
    throw new FormParseError(
      `The embedded form definition is not valid JSON: ${error instanceof Error ? error.message : "unknown error"}`,
    );
  }

  try {
    return parseFormDefinition(parsed);
  } catch (error) {
    throw new FormParseError(
      error instanceof Error ? error.message : "The embedded form definition is invalid.",
    );
  }
}
