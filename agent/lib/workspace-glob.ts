const MAX_MODEL_OUTPUT_BYTES = 64_000;

export type WorkspaceGlobResult = {
  content: string;
  count: number;
  path: string;
  truncated: boolean;
};

export function formatWorkspaceGlobResult(
  workspacePaths: readonly string[],
  options: { path: string; truncated: boolean; maxOutputBytes?: number },
): WorkspaceGlobResult {
  const maxOutputBytes = options.maxOutputBytes ?? MAX_MODEL_OUTPUT_BYTES;
  const lines: string[] = [];
  let outputBytes = 0;
  let outputTruncated = options.truncated;

  for (const workspacePath of workspacePaths) {
    const lineBytes = Buffer.byteLength(workspacePath, "utf8") + 1;
    if (outputBytes + lineBytes > maxOutputBytes && lines.length > 0) {
      outputTruncated = true;
      break;
    }
    lines.push(workspacePath);
    outputBytes += lineBytes;
  }

  if (lines.length === 0) {
    return {
      content: "No files found",
      count: 0,
      path: options.path,
      truncated: false,
    };
  }

  const count = lines.length;
  if (outputTruncated) {
    lines.push("");
    lines.push(
      `(Results truncated: showing first ${lines.length - 1} results out of more. Use a more specific path or pattern to narrow results.)`,
    );
  }

  return {
    content: lines.join("\n"),
    count,
    path: options.path,
    truncated: outputTruncated,
  };
}
