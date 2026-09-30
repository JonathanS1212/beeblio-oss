const DEFAULT_LINE_LIMIT = 2_000;
const MAX_OUTPUT_BYTES = 51_200;
const MAX_LINE_LENGTH = 2_000;
const LINE_TRUNCATION_SUFFIX = " [truncated]";

export type TextFileReadResult = {
  content: string;
  generation: string;
  nextOffset?: number;
  path: string;
  totalLines: number;
  truncated: boolean;
};

function capLineLength(line: string): string {
  return line.length <= MAX_LINE_LENGTH
    ? line
    : `${line.slice(0, MAX_LINE_LENGTH)}${LINE_TRUNCATION_SUFFIX}`;
}

/** Applies Eve's normal line numbering and output budgets to GCS text. */
export function formatTextFileRead(
  source: string,
  options: {
    generation: string;
    path: string;
    limit?: number;
    offset?: number;
  },
): TextFileReadResult {
  const offset = options.offset ?? 1;
  const limit = options.limit ?? DEFAULT_LINE_LIMIT;
  if (offset < 1) throw new Error(`offset must be >= 1. Received: ${offset}.`);
  if (source.includes("\0")) {
    throw new Error(
      `File "${options.path}" contains NUL bytes and appears to be a binary file. read_file only supports text files.`,
    );
  }

  const lines = source.split("\n");
  const totalLines = lines.length > 0 && lines.at(-1) === "" ? lines.length - 1 : lines.length;
  if (totalLines === 0) {
    if (offset > 1) {
      throw new Error(
        `offset ${offset} is past the end of the file (0 lines). Use the default offset to read an empty file.`,
      );
    }
    return {
      content: "",
      generation: options.generation,
      path: options.path,
      totalLines: 0,
      truncated: false,
    };
  }
  if (offset > totalLines) {
    throw new Error(`offset ${offset} is past the end of the file (${totalLines} lines).`);
  }

  const selected = lines.slice(offset - 1, Math.min(offset - 1 + limit, totalLines));
  const output: string[] = [];
  let outputBytes = 0;
  let hitByteLimit = false;
  for (let index = 0; index < selected.length; index++) {
    const numbered = `${offset + index}: ${capLineLength(selected[index] ?? "")}`;
    const lineBytes = Buffer.byteLength(numbered, "utf8") + 1;
    if (outputBytes + lineBytes > MAX_OUTPUT_BYTES && output.length > 0) {
      hitByteLimit = true;
      break;
    }
    output.push(numbered);
    outputBytes += lineBytes;
  }

  const lastLine = offset + output.length - 1;
  const truncated = lastLine < totalLines || hitByteLimit;
  return {
    content: output.join("\n"),
    generation: options.generation,
    ...(truncated ? { nextOffset: lastLine + 1 } : {}),
    path: options.path,
    totalLines,
    truncated,
  };
}
