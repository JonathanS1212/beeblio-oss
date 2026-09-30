/**
 * Minimal RFC-4180 CSV helpers for form response files. Values may contain
 * commas, quotes, and newlines (free-text answers), so every cell is quoted
 * when needed and quotes are doubled.
 */

export function csvEscape(value: string): string {
  if (/[",\r\n]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

export function csvRow(values: readonly string[]): string {
  return `${values.map(csvEscape).join(",")}\n`;
}

/** Parses one CSV line (the header row) back into keys. */
export function parseCsvLine(line: string): string[] {
  return parseCsvRow(line, 0).values;
}

/** Parses a whole CSV file into rows of cells (quoted commas/newlines honored). */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let position = 0;
  while (position < text.length) {
    const { values, next } = parseCsvRow(text, position);
    rows.push(values);
    position = next;
  }
  // A trailing newline yields one empty row; drop it.
  const last = rows[rows.length - 1];
  if (last && last.length === 1 && last[0] === "") rows.pop();
  return rows;
}

function parseCsvRow(text: string, start: number): { values: string[]; next: number } {
  const values: string[] = [];
  let current = "";
  let inQuotes = false;
  let index = start;
  for (; index < text.length; index++) {
    const char = text[index];
    if (inQuotes) {
      if (char === '"') {
        if (text[index + 1] === '"') {
          current += '"';
          index += 1;
        } else {
          inQuotes = false;
        }
      } else {
        current += char;
      }
      continue;
    }
    if (char === '"') {
      inQuotes = true;
    } else if (char === ",") {
      values.push(current);
      current = "";
    } else if (char === "\n" || char === "\r") {
      if (char === "\r" && text[index + 1] === "\n") index += 1;
      break;
    } else {
      current += char;
    }
  }
  values.push(current);
  return { values, next: index >= text.length ? text.length : index + 1 };
}
