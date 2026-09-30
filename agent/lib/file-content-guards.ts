export type StrippedDisplayPrefixes = {
  /** Content with display-prefix runs removed, ready to write to disk. */
  cleaned: string;
  /** How many lines had a prefix removed. */
  strippedLineCount: number;
  /** One-line description of what was removed, surfaced in the tool output. */
  description: string;
};

export type StrippedMermaidFences = {
  cleaned: string;
  strippedLineCount: number;
  description: string;
};

const STANDALONE_MERMAID_FENCE = /^\s*(?:`{3,}|~{3,})(?:\s*mermaid)?\s*$/i;

/**
 * Removes Markdown fence lines accidentally written into a standalone Mermaid
 * source file. Mermaid files are embedded in a fence by the editor, so keeping
 * either a complete or unmatched fence here produces nested/partial blocks.
 */
export function stripStandaloneMermaidFences(
  content: string,
): StrippedMermaidFences | undefined {
  if (content.includes("\0")) return undefined;

  const lines = content.split("\n");
  const cleanedLines = lines.filter(
    (line) => !STANDALONE_MERMAID_FENCE.test(line),
  );
  const strippedLineCount = lines.length - cleanedLines.length;
  if (strippedLineCount === 0) return undefined;

  return {
    cleaned: cleanedLines.join("\n"),
    strippedLineCount,
    description:
      `stripped ${strippedLineCount} Markdown fence line(s) from standalone ` +
      "Mermaid source",
  };
}

/**
 * A run of consecutive lines must be at least this long before its prefixes
 * are stripped. Shorter runs (a stray "1: ", "2: ") are indistinguishable
 * from content the user may have wanted, so they are left alone.
 */
const MIN_RUN_LENGTH = 3;

type PrefixKind = "readFile" | "numberedTab" | "grep";

interface LineMatch {
  /** The line number carried by the prefix. */
  number: number;
  /** Length of the prefix to remove, including any trailing space/tab. */
  prefixLength: number;
  /** For the grep format: the file-path segment before the line number. */
  source?: string;
}

const READ_FILE_PREFIX = /^(\d{1,6}):(?:[ \t\r]|$)/;
const NUMBERED_TAB_PREFIX = /^[ ]{0,8}(\d{1,6})\t/;
// grep/ripgrep output has no space after the second colon; the path segment
// keeps it distinct from prose.
const GREP_PREFIX = /^([^\s:]{1,256}):(\d{1,6}):/;

function matchReadFile(line: string): LineMatch | undefined {
  const match = READ_FILE_PREFIX.exec(line);
  return match ? { number: Number(match[1]), prefixLength: match[0].length } : undefined;
}

function matchNumberedTab(line: string): LineMatch | undefined {
  const match = NUMBERED_TAB_PREFIX.exec(line);
  return match ? { number: Number(match[1]), prefixLength: match[0].length } : undefined;
}

function matchGrep(line: string): LineMatch | undefined {
  const match = GREP_PREFIX.exec(line);
  return match
    ? {
        number: Number(match[2]),
        prefixLength: match[0].length,
        source: match[1],
      }
    : undefined;
}

const MATCHERS: Record<PrefixKind, (line: string) => LineMatch | undefined> = {
  readFile: matchReadFile,
  numberedTab: matchNumberedTab,
  grep: matchGrep,
};

const KIND_LABEL: Record<PrefixKind, string> = {
  readFile: "read_file `<line number>: ` prefixes",
  numberedTab: "`cat -n`/`nl` line-number tabs",
  grep: "grep/ripgrep `path:<line number>:` prefixes",
};

/**
 * Removes tool-display line-number prefixes the model copied into file
 * content, so they never reach the user's workspace.
 *
 * Covered formats (the ways the agent can see line-numbered file content):
 * - eve `read_file`: every line as `<line number>: <content>`
 * - `cat -n` / `nl` via bash: `<line number>\t<content>`
 * - grep / ripgrep: `<path>:<line number>:<content>`
 *
 * A prefix is stripped only when it belongs to a run of at least
 * {@link MIN_RUN_LENGTH} consecutive lines whose numbers increase by exactly
 * one — the shape tool output actually has. Verbatim copies, partial copies
 * (some lines rewritten clean, numbering continuing across the edit), and
 * copies with renumbering splits are all cleaned; isolated numbered lines
 * that could be intentional content are preserved.
 */
export function stripCopiedDisplayLinePrefixes(
  content: string,
): StrippedDisplayPrefixes | undefined {
  // Line numbers are meaningless in binary-ish content, and a NUL byte makes
  // the text unusable anyway; leave it alone rather than guess.
  if (content.includes("\0")) return undefined;

  const lines = content.split("\n");
  let strippedLineCount = 0;
  const kinds = new Set<PrefixKind>();

  for (const kind of Object.keys(MATCHERS) as PrefixKind[]) {
    const match = MATCHERS[kind];

    // Pass 1 — convict on contiguous runs of at least MIN_RUN_LENGTH lines
    // whose numbers increase by exactly one.
    let minStripped: number | undefined;
    let maxStripped: number | undefined;
    let index = 0;
    while (index < lines.length) {
      const first = match(lines[index] ?? "");
      if (!first) {
        index += 1;
        continue;
      }

      let end = index + 1;
      while (end < lines.length) {
        const next = match(lines[end] ?? "");
        if (!next || next.number !== first.number + (end - index)) break;
        if (kind === "grep" && next.source !== first.source) break;
        end += 1;
      }

      if (end - index >= MIN_RUN_LENGTH) {
        for (let line = index; line < end; line += 1) {
          const current = match(lines[line] ?? "");
          if (current) {
            lines[line] = lines[line]!.slice(current.prefixLength);
            strippedLineCount += 1;
          }
        }
        kinds.add(kind);
        minStripped = Math.min(minStripped ?? first.number, first.number);
        maxStripped = Math.max(maxStripped ?? first.number, first.number + (end - index) - 1);
      }
      index = end;
    }

    // Pass 2 — once the file is convicted, short fragments that continue the
    // same numbering (a two-line tail after an inserted paragraph) are display
    // metadata too. Small slack above the range covers lines the model kept
    // numbered past the last stripped run.
    if (minStripped === undefined || maxStripped === undefined) continue;
    const ceiling = maxStripped + 2;
    for (let line = 0; line < lines.length; line += 1) {
      const current = match(lines[line] ?? "");
      if (!current || current.number < minStripped || current.number > ceiling) {
        continue;
      }
      lines[line] = lines[line]!.slice(current.prefixLength);
      strippedLineCount += 1;
    }
  }

  if (strippedLineCount === 0) return undefined;

  const kindList = [...kinds].map((kind) => KIND_LABEL[kind]).join(", ");
  return {
    cleaned: lines.join("\n"),
    strippedLineCount,
    description:
      `stripped ${strippedLineCount} copied line-number prefixes ` +
      `(${kindList}) that are tool display metadata, not file content`,
  };
}
