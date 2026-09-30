import { defineTool } from "eve/tools";
import { z } from "zod";
import {
  resolveAuthenticatedWorkspace,
  toWorkspaceRelativePath,
} from "../workspace-paths";
import { copyWorkspacePath, listWorkspaceFiles } from "../workspace-files";

export default defineTool({
  description:
    "Copy a file or directory inside the current project workspace. Use this instead of shell cp for /workspace. The destination must not already exist.",
  inputSchema: z.object({
    sourcePath: z
      .string()
      .min(1)
      .describe("Source path inside /workspace."),
    destinationPath: z
      .string()
      .min(1)
      .describe("New destination path inside /workspace."),
  }),
  async execute({ sourcePath, destinationPath }, ctx) {
    const auth = ctx.session.auth.current;
    const { identity } = resolveAuthenticatedWorkspace({
      principalId: auth?.principalId,
      projectSlug: auth?.attributes?.projectSlug,
      sessionId: ctx.session.id,
    });
    const source = toWorkspaceRelativePath(sourcePath);
    const destination = toWorkspaceRelativePath(destinationPath);
    if (source === destination) {
      throw new Error("Source and destination must be different");
    }
    const parent = source.includes("/") ? source.slice(0, source.lastIndexOf("/")) : "";
    const sourceEntry = (await listWorkspaceFiles(identity.userId, identity.projectSlug, parent))
      .find((entry) => entry.path === source);
    if (!sourceEntry) throw new Error("Source does not exist");
    await copyWorkspacePath(identity.userId, identity.projectSlug, source, destination);

    return {
      success: true,
      sourcePath: `/workspace/${source}`,
      destinationPath: `/workspace/${destination}`,
      type: sourceEntry.isDir ? "directory" : "file",
    };
  },
});
