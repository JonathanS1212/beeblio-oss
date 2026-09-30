import { defineTool } from "eve/tools";
import { z } from "zod";

import {
  applyExcalidrawOperations,
  digestScene,
  parseExcalidrawScene,
  serializeExcalidrawScene,
  type ExcalidrawOperation,
} from "../lib/excalidraw-scene";
import { resolveAuthenticatedWorkspace, toWorkspaceRelativePath } from "../workspace-paths";
import { readWorkspaceFile, writeWorkspaceFile, WorkspaceFileError } from "../workspace-files";

const elementSchema = z
  .object({
    id: z
      .string()
      .trim()
      .min(1)
      .max(64)
      .optional()
      .describe(
        "Short stable id (e.g. \"collect\", \"arrow-1\"). Referenced by arrows (from/to) and later edits. Auto-assigned when omitted.",
      ),
    type: z.enum(["rectangle", "ellipse", "diamond", "text", "arrow", "line"]).describe(
      "rectangle = process/box, ellipse = start/end, diamond = decision, text = free-floating " +
        "annotation, arrow = directed connection, line = undirected connector.",
    ),
    label: z
      .string()
      .max(500)
      .optional()
      .describe("Text inside a shape, on an arrow/line, or the text itself for type \"text\". \\n splits lines."),
    x: z.number().optional().describe("Canvas position. Omit to auto-stack unpositioned shapes in a column."),
    y: z.number().optional(),
    width: z.number().positive().optional().describe("Omit to auto-size from the label so text fits."),
    height: z.number().positive().optional(),
    from: z.string().trim().min(1).max(64).optional().describe("Arrow/line start: the id of a shape or text element."),
    to: z.string().trim().min(1).max(64).optional().describe("Arrow/line end: the id of a shape or text element."),
    points: z
      .array(z.tuple([z.number(), z.number()]))
      .min(1)
      .max(20)
      .optional()
      .describe("Absolute [x,y] waypoints for unbound arrows/lines (at least two), or routing midpoints."),
    color: z.string().max(32).optional().describe("Stroke color, e.g. \"#1971c2\"; also colors the label text."),
    fill: z.string().max(32).optional().describe("Shape background color, e.g. \"#a5d8ff\"; default transparent."),
    dashed: z.boolean().optional().describe("Dashed stroke for optional/weak relationships."),
    bidirectional: z.boolean().optional().describe("Give an arrow both arrowheads (default: end only)."),
    fontSize: z.number().int().min(8).max(96).optional().describe("Label font size (default 20)."),
  })
  .strict();

const updateSchema = z
  .object({
    id: z.string().trim().min(1).max(64).describe("Id of an existing element (see read_excalidraw digest)."),
    label: z.string().max(500).optional().describe("New label; re-measures and recenters it."),
    x: z.number().optional().describe("New absolute position; bound labels and attached arrows follow."),
    y: z.number().optional(),
    width: z.number().positive().optional(),
    height: z.number().positive().optional(),
    color: z.string().max(32).optional(),
    fill: z.string().max(32).optional(),
    dashed: z.boolean().optional(),
    fontSize: z.number().int().min(8).max(96).optional(),
  })
  .strict();

const operationSchema = z.discriminatedUnion("op", [
  z
    .object({
      op: z.literal("add_elements"),
      elements: z.array(elementSchema).min(1).max(120).describe("Elements to append. Shapes may be listed after the arrows that reference them."),
    })
    .strict(),
  z
    .object({
      op: z.literal("update_elements"),
      updates: z
        .array(updateSchema)
        .min(1)
        .max(120)
        .describe("Edits to existing elements; connectors cannot be moved directly — move the shapes they connect."),
    })
    .strict(),
  z
    .object({
      op: z.literal("delete_elements"),
      ids: z.array(z.string().trim().min(1).max(64)).min(1).max(120).describe("Ids to remove. A shape's label goes with it; arrows pointing at deleted shapes are unbound, not deleted."),
    })
    .strict(),
]);

const inputSchema = z
  .object({
    path: z
      .string()
      .trim()
      .min(3)
      .max(500)
      .describe("Diagram file inside /workspace ending in .excalidraw (or .excalidraw.json). Created when missing."),
    operations: z
      .array(operationSchema)
      .min(1)
      .max(40)
      .describe("Operations applied in order, atomically, to the diagram file."),
    unsavedContent: z
      .string()
      .max(4 * 1024 * 1024)
      .optional()
      .describe(
        "Pass workspace_context unsavedContent for this file when present, so edits apply to the " +
          "editor's authoritative snapshot instead of the stale disk copy.",
      ),
  })
  .strict();

function assertExcalidrawPath(relativePath: string): void {
  if (!relativePath.endsWith(".excalidraw") && !relativePath.endsWith(".excalidraw.json")) {
    throw new Error("The diagram path must end in .excalidraw (or .excalidraw.json)");
  }
}

export default defineTool({
  description:
    "Create or edit an Excalidraw whiteboard diagram (.excalidraw) inside /workspace. Describe " +
    "elements compactly — labeled shapes (rectangle/ellipse/diamond), free text, and arrows wired " +
    "by from/to element ids — and the full Excalidraw JSON (ids, seeds, bindings, bound labels, " +
    "arrow geometry) is generated automatically. Sizes are estimated from labels, positions may " +
    "be explicit or auto-stacked, and moving a shape redraws its attached arrows. Operations apply " +
    "atomically; read results with read_excalidraw for a compact digest of ids and positions. " +
    "Use this instead of write_file or edit_document for .excalidraw files.",
  inputSchema,
  async execute({ path: inputPath, operations, unsavedContent }, ctx) {
    const auth = ctx.session.auth.current;
    const { identity } = resolveAuthenticatedWorkspace({
      principalId: auth?.principalId,
      projectSlug: auth?.attributes?.projectSlug,
      sessionId: ctx.session.id,
    });
    const workspacePath = toWorkspaceRelativePath(inputPath);
    assertExcalidrawPath(workspacePath);

    let created = false;
    let source: string;
    if (unsavedContent !== undefined) {
      source = unsavedContent;
    } else {
      try {
        const { content } = await readWorkspaceFile(identity.userId, identity.projectSlug, workspacePath);
        source = content.toString("utf8");
      } catch (error) {
        if (error instanceof WorkspaceFileError && error.status === 404) {
          source = "";
          created = true;
        } else {
          throw error;
        }
      }
    }

    const parsed = parseExcalidrawScene(source);
    if ("error" in parsed) throw new Error(parsed.error);

    const { scene, applied } = applyExcalidrawOperations(
      parsed.scene,
      operations as ExcalidrawOperation[],
      Date.now(),
    );

    await writeWorkspaceFile(
      identity.userId,
      identity.projectSlug,
      workspacePath,
      Buffer.from(serializeExcalidrawScene(scene), "utf8"),
      { contentType: "application/json; charset=utf-8" },
    );

    const digest = digestScene(scene);
    return {
      path: `/workspace/${workspacePath}`,
      created,
      applied,
      elementCount: digest.elementCount,
      elements: digest.elements,
      warnings: digest.warnings,
    };
  },
});
