/**
 * Repairs markdown constructs that break rendering or silently corrupt
 * documents when parsed and re-serialized by the visual editor.
 */
export type TableRepair = {
  repaired: string;
  /** How many blank lines were inserted. */
  insertedCount: number;
};

const FENCE_LINE = /^ {0,3}(`{3,}|~{3,})([^\n]*)$/;

const TABLE_DELIMITER = /^[ \t|:]*-[ \t|:-]*$/;

/**
 * True when the line can only be a GFM table delimiter row (and the row above
 * it is a plausible header). `---` alone is a thematic break or setext
 * underline; it only acts as a delimiter under a `|`-containing header row.
 */
function isTableDelimiter(line: string, previousLine: string | undefined): boolean {
  return (
    TABLE_DELIMITER.test(line) &&
    line.includes("-") &&
    previousLine !== undefined &&
    previousLine.includes("|")
  );
}

/**
 * GFM tables absorb every non-blank line that follows them as a table row —
 * including plain prose paragraphs. Models frequently emit tables without a
 * trailing blank line, so the paragraph after the table is eaten: it renders
 * inside the table, and the first user edit + save in the visual editor
 * writes it back as literal `| row | | |` cells, destroying the prose.
 *
 * This inserts a blank line between a table block and the first non-blank,
 * non-`|` line after it, which is what the author meant and what every
 * renderer then displays. Fenced code blocks are skipped.
 */
export function ensureBlankLineAfterTables(markdown: string): TableRepair {
  if (!markdown.includes("|") || !markdown.includes("-")) {
    return { repaired: markdown, insertedCount: 0 };
  }

  const lines = markdown.split("\n");
  const output: string[] = [];
  let insertedCount = 0;
  let fence: { marker: string; length: number } | null = null;

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index] ?? "";

    const fenceMatch = FENCE_LINE.exec(line);
    if (fence) {
      output.push(line);
      // Only a bare fence of the same marker (at least as long) closes the
      // block; ```python inside an open ``` block is content, not a closer.
      if (
        fenceMatch &&
        fenceMatch[2]!.trim() === "" &&
        fenceMatch[1]![0] === fence.marker &&
        fenceMatch[1]!.length >= fence.length
      ) {
        fence = null;
      }
      continue;
    }

    if (fenceMatch) {
      fence = { marker: fenceMatch[1]![0]!, length: fenceMatch[1]!.length };
      output.push(line);
      continue;
    }

    if (!isTableDelimiter(line, lines[index - 1])) {
      output.push(line);
      continue;
    }

    // Copy the header, delimiter, and any following `|` rows; then, if the
    // next line is non-blank prose (no pipe), it was about to be absorbed as
    // a row — separate it with a blank line.
    output.push(line);
    let cursor = index + 1;
    while (cursor < lines.length) {
      const candidate = lines[cursor] ?? "";
      if (candidate.trim() === "" || !candidate.includes("|")) break;
      output.push(candidate);
      cursor += 1;
    }
    if (cursor < lines.length && (lines[cursor] ?? "").trim() !== "") {
      output.push("");
      insertedCount += 1;
    }
    index = cursor - 1;
  }

  return {
    repaired: insertedCount > 0 ? output.join("\n") : markdown,
    insertedCount,
  };
}
