import { defineTool } from "eve/tools";
import { z } from "zod";
import {
  resolveAuthenticatedWorkspace,
  toWorkspaceRelativePath,
} from "../workspace-paths";
import { writeWorkspaceFile, WorkspaceFileError } from "../workspace-files";
import { PROJECT_BIBLIOGRAPHY_PATH } from "../../lib/project-bibliography";
import {
  stripCopiedDisplayLinePrefixes,
  stripStandaloneMermaidFences,
} from "../lib/file-content-guards";
import { assertValidMermaidFlowcharts } from "../lib/mermaid-validation";
import { ensureBlankLineAfterTables } from "../../lib/markdown-repair";

const writeFileInputSchema = z
  .object({
    content: z.string().describe("Complete replacement file contents."),
    filePath: z
      .string()
      .describe(
        "The path to the file to write. Relative paths resolve from /workspace.",
      ),
    expectedGeneration: z
      .string()
      .regex(/^\d+$/)
      .optional()
      .describe(
        "For an existing file, the generation returned by read_file. Omit only when creating a new file.",
      ),
  })
  .strict();

const MARKDOWN_EXTENSIONS = new Set([".md", ".markdown"]);
const MERMAID_EXTENSIONS = new Set([".mmd", ".mermaid"]);
const MAX_WRITE_BYTES = 2 * 1024 * 1024;

function extensionOf(filePath: string): string {
  const dot = filePath.lastIndexOf(".");
  return dot > 0 ? filePath.slice(dot).toLowerCase() : "";
}

function isMarkdownPath(filePath: string): boolean {
  return MARKDOWN_EXTENSIONS.has(extensionOf(filePath));
}

export function isExcalidrawPath(filePath: string): boolean {
  const lower = filePath.toLowerCase();
  return lower.endsWith(".excalidraw") || lower.endsWith(".excalidraw.json");
}

export default defineTool({
  description: `Write a complete text file directly to durable GCS storage without starting the sandbox.

Project path behavior:
- Relative file paths are resolved automatically from /workspace.
- For example, "research_report.md" writes "/workspace/research_report.md".
- Relative paths cannot escape /workspace.
- Before replacing an existing file, call read_file and pass its generation as expectedGeneration.
- Omit expectedGeneration only when creating a new file. Creation fails safely if that path already exists.

Content requirements:
- Pass the raw replacement file contents only.
- NEVER copy the "<line number>: " prefixes shown by read_file into content;
  those prefixes are display metadata and are not part of the source file.
- In markdown, leave a blank line between a table and the paragraph after it.
- For standalone .mmd/.mermaid files, pass raw Mermaid syntax only. Do not
  include Markdown opening, closing, partial, or extra backtick/tilde fences.
- For .excalidraw diagrams, use update_excalidraw instead; raw Excalidraw
  JSON is rejected.
- The project bibliography (1-References/references.bib) is managed by
  update_bibliography; write_file is rejected there.

If copied line-number prefixes are detected anyway, they are stripped
automatically and reported in the result notice.`,
  inputSchema: writeFileInputSchema,
  async execute(input, ctx) {
    const workspacePath = toWorkspaceRelativePath(input.filePath);
    const resolvedPath = `/workspace/${workspacePath}`;
    if (Buffer.byteLength(input.content, "utf8") > MAX_WRITE_BYTES) {
      throw new Error(`write_file content exceeds ${MAX_WRITE_BYTES} bytes`);
    }
    if (resolvedPath === "/workspace/2-Data" || resolvedPath.startsWith("/workspace/2-Data/")) {
      throw new Error("write_file cannot modify the data provenance area; use a format-specific tool or a saved analysis script with a new /workspace/2-Data/derived path");
    }
    if (workspacePath === PROJECT_BIBLIOGRAPHY_PATH) {
      throw new Error("references.bib is the project bibliography database; use update_bibliography to add, edit, or remove entries so citation keys stay valid");
    }
    if (resolvedPath.endsWith(".matrix") || resolvedPath.endsWith(".form.html")) {
      throw new Error("Use update_matrix for .matrix files and create_form for .form.html files");
    }
    if (isExcalidrawPath(resolvedPath)) {
      throw new Error("Use update_excalidraw for .excalidraw files; never write Excalidraw JSON by hand");
    }
    let content = input.content;
    const notices: string[] = [];

    const stripped = stripCopiedDisplayLinePrefixes(content);
    if (stripped) {
      content = stripped.cleaned;
      notices.push(stripped.description);
    }

    if (isMarkdownPath(input.filePath)) {
      const repaired = ensureBlankLineAfterTables(content);
      if (repaired.insertedCount > 0) {
        content = repaired.repaired;
        notices.push(
          `inserted ${repaired.insertedCount} blank line(s) after tables so ` +
            `the following paragraphs are not absorbed as table rows`,
        );
      }
    }

    if (MERMAID_EXTENSIONS.has(extensionOf(input.filePath))) {
      const strippedFences = stripStandaloneMermaidFences(content);
      if (strippedFences) {
        content = strippedFences.cleaned;
        notices.push(strippedFences.description);
      }
    }

    assertValidMermaidFlowcharts(input.filePath, content);

    const auth = ctx.session.auth.current;
    const { identity } = resolveAuthenticatedWorkspace({
      principalId: auth?.principalId,
      projectSlug: auth?.attributes?.projectSlug,
      sessionId: ctx.session.id,
    });

    let result: { existed: boolean; path: string };
    try {
      const write = await writeWorkspaceFile(
        identity.userId,
        identity.projectSlug,
        workspacePath,
        Buffer.from(content, "utf8"),
        {
          ifGenerationMatch: input.expectedGeneration ?? 0,
        },
      );
      result = { existed: write.existed, path: resolvedPath };
    } catch (error) {
      if (
        error instanceof WorkspaceFileError &&
        error.code === "workspace_generation_mismatch" &&
        input.expectedGeneration === undefined
      ) {
        throw new Error(
          `You must read file ${resolvedPath} before overwriting it. Use read_file first, then pass its generation as expectedGeneration.`,
        );
      }
      throw error;
    }

    return notices.length > 0
      ? { ...result, notice: notices.join("; ") }
      : result;
  },
});
