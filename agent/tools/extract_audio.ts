import { defineTool } from "eve/tools";
import { z } from "zod";
import path from "node:path";

import { isBlaxelBatchEnabled, runBlaxelBatchCommand } from "../lib/blaxel-batch-runner";
import {
  resolveAuthenticatedWorkspace,
  toWorkspaceRelativePath,
} from "../workspace-paths";

function shellQuote(value: string): string {
  return `'${value.replaceAll("'", `'\\''`)}'`;
}

export default defineTool({
  description:
    "Extract MP3 audio from a workspace video using FFmpeg in a disposable Blaxel Job. " +
    "The output must be a new file under /workspace/2-Data/derived, /workspace/3-Analysis, or /workspace/4-Reports.",
  inputSchema: z.object({
    inputPath: z.string().describe("The absolute path to the video file (e.g., /workspace/interview_01.mp4)."),
    outputPath: z.string().describe("A new MP3 path in a generated-output area (e.g., /workspace/3-Analysis/audio.mp3)."),
  }),
  outputSchema: z.object({
    success: z.literal(true),
    message: z.string(),
    bytes: z.number().int().positive(),
  }),
  async execute({ inputPath, outputPath }, ctx) {
    if (!isBlaxelBatchEnabled()) {
      throw new Error("Blaxel Batch audio processing is disabled; set BLAXEL_BATCH_ENABLED=true");
    }
    const auth = ctx.session.auth.current;
    const { identity } = resolveAuthenticatedWorkspace({
      principalId: auth?.principalId,
      projectSlug: auth?.attributes?.projectSlug,
      sessionId: ctx.session.id,
    });
    const inputRelative = toWorkspaceRelativePath(inputPath);
    const outputRelative = toWorkspaceRelativePath(outputPath);
    const actualInputPath = `/workspace/${inputRelative}`;
    const actualOutputPath = `/workspace/${outputRelative}`;
    if (path.extname(actualOutputPath).toLowerCase() !== ".mp3") {
      throw new Error("Audio outputPath must end in .mp3");
    }
    if (![
      "2-Data/derived/",
      "3-Analysis/",
      "4-Reports/",
    ].some((prefix) => outputRelative.startsWith(prefix))) {
      throw new Error("Audio outputPath must be under /workspace/2-Data/derived, /workspace/3-Analysis, or /workspace/4-Reports");
    }
    const command = [
      `test -f ${shellQuote(actualInputPath)}`,
      `test ! -e ${shellQuote(actualOutputPath)}`,
      `mkdir -p ${shellQuote(path.posix.dirname(actualOutputPath))}`,
      `ffmpeg -nostdin -hide_banner -loglevel error -i ${shellQuote(actualInputPath)} -vn -codec:a libmp3lame ${shellQuote(actualOutputPath)}`,
      `stat -c %s ${shellQuote(actualOutputPath)}`,
    ].join(" && ");
    const result = await runBlaxelBatchCommand({
      ctx,
      identity,
      command,
      timeoutMs: 10 * 60_000,
    });
    const bytes = Number(result.stdout.trim().split(/\s+/).at(-1));
    if (!Number.isSafeInteger(bytes) || bytes <= 0) {
      throw new Error("Audio processor produced an empty file");
    }
    return { success: true as const, message: `Audio extracted successfully to ${actualOutputPath}`, bytes };
  },
});
