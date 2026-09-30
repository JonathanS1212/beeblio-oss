import { defineTool } from "eve/tools";
import { z } from "zod";
import {
  resolveAuthenticatedWorkspace,
  toWorkspaceRelativePath,
} from "../workspace-paths";
import { createWorkspaceDirectory, listWorkspaceFiles } from "../workspace-files";

export default defineTool({
  description:
    "Create a directory, including missing parent directories, inside the current project workspace. Use this instead of shell mkdir for /workspace.",
  inputSchema: z.object({
    path: z.string().min(1).describe("Directory path inside /workspace."),
  }),
  async execute({ path: workspacePath }, ctx) {
    const auth = ctx.session.auth.current;
    const { identity } = resolveAuthenticatedWorkspace({
      principalId: auth?.principalId,
      projectSlug: auth?.attributes?.projectSlug,
      sessionId: ctx.session.id,
    });
    const destination = toWorkspaceRelativePath(workspacePath);
    const parts = destination.split("/");
    let current = "";
    let created = false;
    for (const part of parts) {
      const parent = current;
      current = current ? `${current}/${part}` : part;
      const exists = (await listWorkspaceFiles(identity.userId, identity.projectSlug, parent))
        .some((entry) => entry.path === current && entry.isDir);
      if (!exists) {
        await createWorkspaceDirectory(identity.userId, identity.projectSlug, current);
        created = true;
      }
    }

    return {
      success: true,
      created,
      path: `/workspace/${destination}`,
    };
  },
});
