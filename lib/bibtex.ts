export type BibtexEntry = {
  type: string;
  key: string;
  fields: Record<string, string>;
  rawFields: Record<string, string>;
  fieldOrder: string[];
  start: number;
  end: number;
};

export type BibtexEntryUpdate = Pick<BibtexEntry, "type" | "key" | "fields">;

const NON_REFERENCE_TYPES = new Set(["comment", "preamble", "string"]);

export function parseBibtexEntries(source: string): BibtexEntry[] {
  const entries: BibtexEntry[] = [];
  let cursor = 0;

  while (cursor < source.length) {
    const start = source.indexOf("@", cursor);
    if (start === -1) break;

    let position = start + 1;
    while (/\s/.test(source[position] || "")) position += 1;
    const typeStart = position;
    while (/[\w-]/.test(source[position] || "")) position += 1;
    const type = source.slice(typeStart, position).trim();
    while (/\s/.test(source[position] || "")) position += 1;

    const opening = source[position];
    if (!type || (opening !== "{" && opening !== "(")) {
      cursor = start + 1;
      continue;
    }

    const closing = opening === "{" ? "}" : ")";
    const end = findEntryEnd(source, position, opening, closing);
    if (end === -1) break;

    const comma = findTopLevelComma(source, position + 1, end, opening, closing);
    if (comma !== -1 && !NON_REFERENCE_TYPES.has(type.toLowerCase())) {
      const key = source.slice(position + 1, comma).trim();
      const parsedFields = parseFields(source.slice(comma + 1, end));
      if (key) {
        entries.push({
          type,
          key,
          fields: parsedFields.fields,
          rawFields: parsedFields.rawFields,
          fieldOrder: parsedFields.order,
          start,
          end: end + 1,
        });
      }
    }

    cursor = end + 1;
  }

  return entries;
}

export function replaceBibtexEntry(
  source: string,
  entry: BibtexEntry,
  update: BibtexEntryUpdate,
) {
  const orderedFields = [
    ...entry.fieldOrder.filter((field) => Object.hasOwn(update.fields, field)),
    ...Object.keys(update.fields).filter((field) => !entry.fieldOrder.includes(field)),
  ];
  const lines = orderedFields
    .filter((field) => update.fields[field].trim())
    .map((field) => {
      const value = update.fields[field].trim();
      const unchangedRawValue = value === entry.fields[field]?.trim()
        ? entry.rawFields[field]
        : undefined;
      return `  ${field} = ${unchangedRawValue || `{${value}}`},`;
    });
  const replacement = `@${update.type.trim()}{${update.key.trim()},${lines.length ? `\n${lines.join("\n")}\n` : "\n"}}`;
  return `${source.slice(0, entry.start)}${replacement}${source.slice(entry.end)}`;
}

export function removeBibtexEntry(source: string, entry: BibtexEntry) {
  const remaining = `${source.slice(0, entry.start)}${source.slice(entry.end)}`
    .replace(/^[\t ]+$/gm, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  return remaining ? `${remaining}\n` : "";
}

/**
 * Joins author names into a BibTeX `author` value. Keeps " and " unambiguous
 * as the separator by rewriting any "and" inside a name to "&".
 */
export function joinBibtexAuthors(authors: readonly string[]) {
  return authors
    .map((author) => author.replace(/\s+and\s+/gi, " & "))
    .filter(Boolean)
    .join(" and ");
}

/**
 * Splits a BibTeX `author` value into individual names on " and " or ";",
 * ignoring separators that sit inside braces ("{Barnes and Noble}").
 */
export function splitBibtexAuthors(value: string) {
  const depths = new Array<number>(value.length);
  let depth = 0;
  for (let index = 0; index < value.length; index += 1) {
    if (value[index] === "{") depth += 1;
    else if (value[index] === "}") depth = Math.max(0, depth - 1);
    depths[index] = depth;
  }
  const parts: string[] = [];
  const separator = /\s+and\s+|\s*;\s*/gi;
  let start = 0;
  let match: RegExpExecArray | null;
  while ((match = separator.exec(value))) {
    if (depths[match.index] > 0) continue;
    parts.push(value.slice(start, match.index));
    start = match.index + match[0].length;
  }
  parts.push(value.slice(start));
  return parts.map((part) => part.replace(/[{}]/g, "").trim()).filter(Boolean);
}

function findEntryEnd(
  source: string,
  openingIndex: number,
  opening: string,
  closing: string,
) {
  let depth = 1;
  let escaped = false;
  for (let index = openingIndex + 1; index < source.length; index += 1) {
    const character = source[index];
    if (escaped) {
      escaped = false;
      continue;
    }
    if (character === "\\") {
      escaped = true;
      continue;
    }
    if (character === opening) depth += 1;
    else if (character === closing) {
      depth -= 1;
      if (depth === 0) return index;
    }
  }
  return -1;
}

function findTopLevelComma(
  source: string,
  start: number,
  end: number,
  opening: string,
  closing: string,
) {
  let depth = 0;
  let quoted = false;
  let escaped = false;
  for (let index = start; index < end; index += 1) {
    const character = source[index];
    if (escaped) {
      escaped = false;
      continue;
    }
    if (character === "\\") {
      escaped = true;
      continue;
    }
    if (character === '"') quoted = !quoted;
    if (quoted) continue;
    if (character === opening) depth += 1;
    else if (character === closing && depth > 0) depth -= 1;
    else if (character === "," && depth === 0) return index;
  }
  return -1;
}

function parseFields(body: string) {
  const fields: Record<string, string> = {};
  const rawFields: Record<string, string> = {};
  const order: string[] = [];
  let cursor = 0;

  while (cursor < body.length) {
    while (/[\s,]/.test(body[cursor] || "")) cursor += 1;
    const nameStart = cursor;
    while (/[\w:-]/.test(body[cursor] || "")) cursor += 1;
    const name = body.slice(nameStart, cursor).toLowerCase();
    while (/\s/.test(body[cursor] || "")) cursor += 1;
    if (!name || body[cursor] !== "=") {
      cursor += 1;
      continue;
    }

    cursor += 1;
    while (/\s/.test(body[cursor] || "")) cursor += 1;
    const rawValueStart = cursor;
    const opening = body[cursor];
    let value = "";

    if (opening === "{" || opening === '"') {
      const closing = opening === "{" ? "}" : '"';
      const valueStart = ++cursor;
      let depth = opening === "{" ? 1 : 0;
      let escaped = false;
      while (cursor < body.length) {
        const character = body[cursor];
        if (escaped) {
          escaped = false;
          cursor += 1;
          continue;
        }
        if (character === "\\") {
          escaped = true;
          cursor += 1;
          continue;
        }
        if (opening === "{" && character === "{") depth += 1;
        else if (character === closing) {
          if (opening === "{") {
            depth -= 1;
            if (depth === 0) break;
          } else {
            break;
          }
        }
        cursor += 1;
      }
      value = body.slice(valueStart, cursor).trim();
      if (body[cursor] === closing) cursor += 1;
    } else {
      const valueStart = cursor;
      while (cursor < body.length && body[cursor] !== "," && body[cursor] !== "\n") cursor += 1;
      value = body.slice(valueStart, cursor).trim();
    }

    fields[name] = value;
    rawFields[name] = body.slice(rawValueStart, cursor).trim();
    if (!order.includes(name)) order.push(name);
  }

  return { fields, rawFields, order };
}
