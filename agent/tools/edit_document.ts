import { createHash } from "node:crypto";

import { defineTool } from "eve/tools";
import { z } from "zod";

import { resolveAuthenticatedWorkspace, toWorkspaceRelativePath } from "../workspace-paths";
import { assertValidMermaidFlowcharts } from "../lib/mermaid-validation";
import { readWorkspaceFile, writeWorkspaceFile } from "../workspace-files";
import { PROJECT_BIBLIOGRAPHY_PATH } from "../../lib/project-bibliography";

const inputSchema = z.object({
  filePath: z.string().min(1).max(500).describe("Text file inside /workspace."),
  action: z.enum(["replace_exact", "insert_between"]).describe(
    "Use replace_exact to replace one passage, or insert_between to insert at unique anchors.",
  ),
  oldText: z.string().min(1).max(100_000).optional().describe(
    "For replace_exact: the exact passage to replace. It must occur exactly once.",
  ),
  newText: z.string().max(100_000).optional().describe(
    "For replace_exact: the replacement passage. May be empty to delete the passage.",
  ),
  before: z.string().min(1).max(2_000).optional().describe(
    "For insert_between: exact text immediately before the insertion point.",
  ),
  after: z.string().min(1).max(2_000).optional().describe(
    "For insert_between: exact text immediately after the insertion point.",
  ),
  text: z.string().min(1).max(100_000).optional().describe(
    "For insert_between: text to insert.",
  ),
}).strict().superRefine((value, ctx) => {
  if (value.action === "replace_exact") {
    if (value.oldText === undefined) {
      ctx.addIssue({ code: "custom", path: ["oldText"], message: "oldText is required for replace_exact" });
    }
    if (value.newText === undefined) {
      ctx.addIssue({ code: "custom", path: ["newText"], message: "newText is required for replace_exact" });
    }
    return;
  }
  if (value.text === undefined) {
    ctx.addIssue({ code: "custom", path: ["text"], message: "text is required for insert_between" });
  }
  if (value.before === undefined && value.after === undefined) {
    ctx.addIssue({ code: "custom", path: ["before"], message: "before or after is required for insert_between" });
  }
});

type EditDocumentInput = z.infer<typeof inputSchema>;

const forbiddenSuffixes = [".matrix", ".form.html", ".excalidraw", ".excalidraw.json"];

function occurrences(source: string, needle: string): number[] {
  const positions: number[] = [];
  for (let from = 0; from <= source.length - needle.length;) {
    const index = source.indexOf(needle, from);
    if (index < 0) break;
    positions.push(index);
    from = index + Math.max(needle.length, 1);
  }
  return positions;
}

export function applyDocumentEdit(source: string, input: EditDocumentInput): string {
  if (input.action === "replace_exact") {
    const oldText = input.oldText!;
    const matches = occurrences(source, oldText);
    if (matches.length !== 1) {
      throw new Error(`Exact replacement requires one match; found ${matches.length}. Re-read the file and do not guess.`);
    }
    const start = matches[0];
    return source.slice(0, start) + input.newText! + source.slice(start + oldText.length);
  }

  const beforeMatches = input.before ? occurrences(source, input.before) : [0];
  const afterMatches = input.after ? occurrences(source, input.after) : [source.length];
  const candidates: number[] = [];
  for (const beforeStart of beforeMatches) {
    const insertionAt = input.before ? beforeStart + input.before.length : 0;
    for (const afterStart of afterMatches) {
      if (afterStart >= insertionAt) candidates.push(insertionAt);
    }
  }
  const unique = [...new Set(candidates)];
  if (unique.length !== 1) {
    throw new Error(`Insertion anchors identify ${unique.length} possible locations. Re-read the file and do not guess.`);
  }
  return source.slice(0, unique[0]) + input.text! + source.slice(unique[0]);
}

export default defineTool({
  description:
    "Safely edit one exact passage or insert at uniquely matching anchors in an existing text document. " +
    "All parameters are top-level: set action to replace_exact with oldText/newText, or set action to " +
    "insert_between with text and at least one of before/after. Do not pass an operation object. " +
    "The operation fails on missing or ambiguous anchors and preserves all unrelated content. Prefer this " +
    "for on-disk contextual-selection and insert-at-caret edits. Do not use it when workspace_context supplies " +
    "unsavedContent; use that complete snapshot with write_file instead. Not valid for .matrix, .form.html, " +
    "or .excalidraw files, or for the project bibliography references.bib (use update_bibliography).",
  inputSchema,
  async execute(input, ctx) {
    const { filePath } = input;
    if (forbiddenSuffixes.some((suffix) => filePath.toLowerCase().endsWith(suffix))) {
      throw new Error("Use the format-specific tool for .matrix, .form.html, and .excalidraw files.");
    }
    const auth = ctx.session.auth.current;
    const { identity } = resolveAuthenticatedWorkspace({
      principalId: auth?.principalId,
      projectSlug: auth?.attributes?.projectSlug,
      sessionId: ctx.session.id,
    });
    const workspacePath = toWorkspaceRelativePath(filePath);
    if (workspacePath === PROJECT_BIBLIOGRAPHY_PATH) {
      throw new Error("references.bib is the project bibliography database; use update_bibliography to add, edit, or remove entries so citation keys stay valid");
    }
    const { content, generation } = await readWorkspaceFile(
      identity.userId,
      identity.projectSlug,
      workspacePath,
    );
    const source = content.toString("utf8");
    const beforeSha256 = createHash("sha256").update(source).digest("hex");
    const next = applyDocumentEdit(source, input);
    assertValidMermaidFlowcharts(filePath, next);
    if (next === source) {
      return { path: `/workspace/${workspacePath}`, changed: false, beforeSha256, afterSha256: beforeSha256 };
    }
    await writeWorkspaceFile(
      identity.userId,
      identity.projectSlug,
      workspacePath,
      Buffer.from(next, "utf8"),
      { ifGenerationMatch: generation },
    );
    return {
      path: `/workspace/${workspacePath}`,
      changed: true,
      beforeSha256,
      afterSha256: createHash("sha256").update(next).digest("hex"),
    };
  },
});
