import { defineTool } from "eve/tools";
import { z } from "zod";

import { formatWorkspaceGlobResult } from "../lib/workspace-glob";
import { globWorkspaceFiles } from "../workspace-files";
import {
  resolveAuthenticatedWorkspace,
  toWorkspaceRelativePath,
} from "../workspace-paths";

const DEFAULT_LIMIT = 100;

const inputSchema = z
  .object({
    limit: z
      .number()
      .int()
      .min(1)
      .max(1_000)
      .describe("Maximum number of results to return. Defaults to 100.")
      .optional(),
    path: z
      .string()
      .describe(
        "The directory to search in. Defaults to /workspace and must be inside it.",
      )
      .optional(),
    pattern: z
      .string()
      .min(1)
      .describe(
        'Glob pattern relative to the search directory, such as "**/*.md" or "3-Analysis/**/*.py".',
      ),
  })
  .strict();

const outputSchema = z
  .object({
    content: z.string(),
    count: z.number().int().nonnegative(),
    path: z.string(),
    truncated: z.boolean(),
  })
  .strict();

export default defineTool({
  description: `Find project files by glob pattern directly in the linked project folder without running a shell command.

Usage:
- Paths are scoped to the current project under /workspace.
- pattern is relative to path, for example "**/*.md", "*.csv", or "3-Analysis/**/*.py".
- Omit path to search the whole project; set path to a folder to narrow the search.
- Use this instead of bash with ls, find, tree, or rg --files for ordinary file discovery.`,
  inputSchema,
  outputSchema,
  label: {
    start: ({ pattern }) => `Find ${pattern}`,
  },
  async execute(input, ctx) {
    const auth = ctx.session.auth.current;
    const { identity } = resolveAuthenticatedWorkspace({
      principalId: auth?.principalId,
      projectSlug: auth?.attributes?.projectSlug,
      sessionId: ctx.session.id,
    });
    const requestedPath = input.path?.trim() || "/workspace";
    const workspacePath = requestedPath === "/workspace" || requestedPath === "/workspace/"
      ? ""
      : toWorkspaceRelativePath(requestedPath);
    const canonicalPath = workspacePath ? `/workspace/${workspacePath}` : "/workspace";
    const result = await globWorkspaceFiles(
      identity.userId,
      identity.projectSlug,
      workspacePath,
      input.pattern,
      input.limit ?? DEFAULT_LIMIT,
    );

    return formatWorkspaceGlobResult(
      result.entries.map((entry) => `/workspace/${entry.path}`),
      { path: canonicalPath, truncated: result.truncated },
    );
  },
});
