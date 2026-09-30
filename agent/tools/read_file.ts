import { defineTool } from "eve/tools";
import { z } from "zod";

import { readWorkspaceFile } from "../workspace-files";
import {
  resolveAuthenticatedWorkspace,
  toWorkspaceRelativePath,
} from "../workspace-paths";
import { formatTextFileRead } from "../lib/text-file-read";

const readFileInputSchema = z
  .object({
    filePath: z.string(),
    limit: z.number().int().positive().optional(),
    offset: z.number().int().positive().optional(),
  })
  .strict();

const readFileOutputSchema = z
  .object({
    content: z.string(),
    generation: z.string(),
    nextOffset: z.number().int().positive().optional(),
    path: z.string(),
    totalLines: z.number().int().nonnegative(),
    truncated: z.boolean(),
  })
  .strict();

export default defineTool({
  description: `Read a text file from the current project directly from the linked project folder without running a shell command.

Usage:
- Relative paths resolve from /workspace and cannot escape it.
- By default, returns up to 2000 lines from the start of the file.
- offset is the 1-based line number to start from.
- Each returned line is prefixed as "<line number>: "; the prefix is display metadata, not file content.
- The result includes generation. When replacing this existing file with write_file, pass it unchanged as expectedGeneration so concurrent edits cannot be overwritten.`,
  inputSchema: readFileInputSchema,
  outputSchema: readFileOutputSchema,
  async execute(input, ctx) {
    const auth = ctx.session.auth.current;
    const { identity } = resolveAuthenticatedWorkspace({
      principalId: auth?.principalId,
      projectSlug: auth?.attributes?.projectSlug,
      sessionId: ctx.session.id,
    });
    const workspacePath = toWorkspaceRelativePath(input.filePath);
    const path = `/workspace/${workspacePath}`;
    const { content, generation } = await readWorkspaceFile(
      identity.userId,
      identity.projectSlug,
      workspacePath,
    );
    return formatTextFileRead(content.toString("utf8"), {
      generation,
      path,
      limit: input.limit,
      offset: input.offset,
    });
  },
});
