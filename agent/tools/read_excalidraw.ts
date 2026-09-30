import { defineTool } from "eve/tools";
import { z } from "zod";

import { digestScene, parseExcalidrawScene } from "../lib/excalidraw-scene";
import { resolveAuthenticatedWorkspace, toWorkspaceRelativePath } from "../workspace-paths";
import { readWorkspaceFile } from "../workspace-files";

const inputSchema = z
  .object({
    filePath: z.string().min(1).max(500).describe(".excalidraw file inside /workspace."),
    content: z
      .string()
      .max(4 * 1024 * 1024)
      .optional()
      .describe(
        "Optional: pass workspace_context unsavedContent for this file to read the editor's " +
          "authoritative snapshot instead of the stale disk copy.",
      ),
  })
  .strict();

export default defineTool({
  description:
    "Read an .excalidraw whiteboard diagram as a compact digest: element ids, types, labels, " +
    "positions, sizes, and arrow from/to connections — without loading the verbose raw JSON " +
    "into context. Use this instead of read_file for .excalidraw and .excalidraw.json files. " +
    "The digest ids are exactly what update_excalidraw operations reference.",
  inputSchema,
  async execute({ filePath, content }, ctx) {
    const auth = ctx.session.auth.current;
    const { identity } = resolveAuthenticatedWorkspace({
      principalId: auth?.principalId,
      projectSlug: auth?.attributes?.projectSlug,
      sessionId: ctx.session.id,
    });
    const workspacePath = toWorkspaceRelativePath(filePath);

    let source: string;
    if (content !== undefined) {
      source = content;
    } else {
      const { content: bytes } = await readWorkspaceFile(identity.userId, identity.projectSlug, workspacePath);
      source = bytes.toString("utf8");
    }

    const parsed = parseExcalidrawScene(source);
    if ("error" in parsed) throw new Error(parsed.error);
    const digest = digestScene(parsed.scene);
    return {
      path: `/workspace/${workspacePath}`,
      ...digest,
    };
  },
});
