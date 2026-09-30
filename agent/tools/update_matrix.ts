import { defineTool } from "eve/tools";
import { z } from "zod";
import {
  addMatrixColumn,
  addMatrixPapers,
  createSeedMatrix,
  DEFAULT_MATRIX_PATH,
  MATRIX_EXTENSION,
  parseMatrix,
  removeMatrixColumn,
  removeMatrixRows,
  serializeMatrix,
  setMatrixCells,
  type LiteratureMatrix,
  type MatrixCitationEntry,
} from "../../lib/literature-matrix";
import {
  resolveAuthenticatedWorkspace,
  toWorkspaceRelativePath,
} from "../workspace-paths";
import { readWorkspaceFile, writeWorkspaceFile, WorkspaceFileError } from "../workspace-files";

const PROJECT_BIBLIOGRAPHY = "1-References/references.bib";

const paperSchema = z.object({
  citationKey: z
    .string()
    .trim()
    .min(1)
    .max(300)
    .describe(
      "The BibTeX citation key of the paper in /workspace/1-References/references.bib. " +
      "Add missing citations with update_bibliography first, then use the key it returned.",
    ),
  doi: z.string().trim().max(500).optional(),
  title: z.string().trim().max(2_000).optional(),
  year: z.number().int().min(1500).max(2200).optional(),
});

const operationSchema = z.discriminatedUnion("op", [
  z.object({
    op: z.literal("add_papers"),
    papers: z.array(paperSchema).min(1).max(50).describe("Papers to append as matrix rows."),
  }),
  z.object({
    op: z.literal("add_column"),
    label: z.string().trim().min(1).max(120).describe("Short column heading, e.g. 'Sample size'."),
    description: z
      .string()
      .trim()
      .max(1_000)
      .optional()
      .describe("What the column compares across studies; guides future fills."),
    position: z.number().int().min(0).optional(),
  }),
  z.object({
    op: z.literal("set_cells"),
    updates: z
      .array(
        z.object({
          citationKey: z.string().trim().min(1).max(300),
          columnId: z.string().trim().min(1).max(64),
          value: z.string().max(20_000),
        }),
      )
      .min(1)
      .max(500),
  }),
  z.object({
    op: z.literal("remove_rows"),
    citationKeys: z.array(z.string().trim().min(1).max(300)).min(1).max(100),
  }),
  z.object({
    op: z.literal("remove_column"),
    columnId: z.string().trim().min(1).max(64),
  }),
]);

const updateMatrixInputSchema = z
  .object({
    path: z
      .string()
      .trim()
      .min(3)
      .max(500)
      .optional()
      .describe(
        `Matrix file inside /workspace. Defaults to ${DEFAULT_MATRIX_PATH}, which is created on first use.`,
      ),
    operations: z
      .array(operationSchema)
      .min(1)
      .max(40)
      .describe("Operations applied in order, atomically, to the matrix file."),
  })
  .strict();

type UpdateMatrixInput = z.infer<typeof updateMatrixInputSchema>;

type OperationSummary = {
  papersAdded: number;
  papersSkipped: string[];
  columnsAdded: Array<{ id: string; label: string }>;
  cellsUpdated: number;
  rowsRemoved: number;
  columnsRemoved: number;
  unknownRows: string[];
  unknownColumns: string[];
  derivedColumnWrites: string[];
};

function applyOperations(matrix: LiteratureMatrix, operations: UpdateMatrixInput["operations"], summary: OperationSummary): LiteratureMatrix {
  let current = matrix;
  for (const operation of operations) {
    if (operation.op === "add_papers") {
      const entries: MatrixCitationEntry[] = operation.papers.map((paper) => ({
        citationKey: paper.citationKey,
        doi: paper.doi,
        title: paper.title,
        year: paper.year,
      }));
      const result = addMatrixPapers(current, entries);
      current = result.matrix;
      summary.papersAdded += result.added.length;
      summary.papersSkipped.push(...result.duplicates.map((paper) => paper.citationKey));
    } else if (operation.op === "add_column") {
      const result = addMatrixColumn(current, {
        label: operation.label,
        description: operation.description,
        origin: "agent",
        position: operation.position,
      });
      current = result.matrix;
      summary.columnsAdded.push({ id: result.column.id, label: result.column.label });
    } else if (operation.op === "set_cells") {
      const result = setMatrixCells(current, operation.updates);
      current = result.matrix;
      summary.cellsUpdated += result.applied;
      summary.unknownRows.push(...result.unknownRows);
      summary.unknownColumns.push(...result.unknownColumns);
      summary.derivedColumnWrites.push(...result.derivedColumns);
    } else if (operation.op === "remove_rows") {
      const result = removeMatrixRows(current, operation.citationKeys);
      current = result.matrix;
      summary.rowsRemoved += result.removed.length;
    } else if (operation.op === "remove_column") {
      current = removeMatrixColumn(current, operation.columnId).matrix;
      summary.columnsRemoved += 1;
    }
  }
  return current;
}

async function readBibliographyKeys(
  userId: string,
  projectSlug: string,
): Promise<Set<string> | undefined> {
  try {
    const { content } = await readWorkspaceFile(userId, projectSlug, PROJECT_BIBLIOGRAPHY);
    const source = content.toString("utf8");
    const keys = new Set<string>();
    for (const match of source.matchAll(/@[a-zA-Z][\w-]*\s*\{\s*([^,\s]+)\s*,/g)) {
      keys.add(match[1]);
    }
    return keys;
  } catch {
    return undefined;
  }
}

export default defineTool({
  description:
    "Create or update a literature matrix (.matrix comparison table) inside /workspace. " +
    "Rows are papers keyed by their references.bib citation key; columns are derived bibliography " +
    "fields (year, authors, venue, publisher, doi, type) or custom comparison columns. " +
    "Operations are applied atomically and the file stays valid JSON. " +
    "Use this instead of write_file for .matrix files. Returns the new column ids for add_column " +
    "so you can immediately set_cells with them.",
  inputSchema: updateMatrixInputSchema,
  async execute({ path: inputPath, operations }, ctx) {
    const auth = ctx.session.auth.current;
    const { identity } = resolveAuthenticatedWorkspace({
      principalId: auth?.principalId,
      projectSlug: auth?.attributes?.projectSlug,
      sessionId: ctx.session.id,
    });

    const relativePath = inputPath ?? DEFAULT_MATRIX_PATH;
    if (!relativePath.endsWith(`.${MATRIX_EXTENSION}`)) {
      throw new Error("The matrix path must end in .matrix");
    }
    const workspacePath = toWorkspaceRelativePath(relativePath);

    let created = false;
    let matrix: LiteratureMatrix;
    try {
      const { content } = await readWorkspaceFile(identity.userId, identity.projectSlug, workspacePath);
      matrix = parseMatrix(content.toString("utf8"));
    } catch (error) {
      if (error instanceof WorkspaceFileError && error.status === 404) {
        matrix = createSeedMatrix();
        created = true;
      } else if (error instanceof Error && error.message.startsWith("Invalid matrix file:")) {
        throw error;
      } else {
        throw new Error(`Could not read ${relativePath}: ${error instanceof Error ? error.message : error}`);
      }
    }

    const summary: OperationSummary = {
      papersAdded: 0,
      papersSkipped: [],
      columnsAdded: [],
      cellsUpdated: 0,
      rowsRemoved: 0,
      columnsRemoved: 0,
      unknownRows: [],
      unknownColumns: [],
      derivedColumnWrites: [],
    };
    const next = applyOperations(matrix, operations, summary);

    await writeWorkspaceFile(
      identity.userId,
      identity.projectSlug,
      workspacePath,
      Buffer.from(serializeMatrix(next), "utf8"),
      { contentType: "application/json" },
    );

    // Rows must reference citations that exist in the project bibliography so
    // derived columns resolve; surface drift instead of failing silently.
    const warnings: string[] = [];
    const bibliographyKeys = await readBibliographyKeys(identity.userId, identity.projectSlug);
    if (bibliographyKeys) {
      const unlinked = next.rows
        .filter((row) => !bibliographyKeys.has(row.citationKey))
        .map((row) => row.citationKey);
      if (unlinked.length > 0) {
        warnings.push(
          `Citation keys not found in ${PROJECT_BIBLIOGRAPHY}: ${unlinked.slice(0, 10).join(", ")}${unlinked.length > 10 ? "…" : ""}. ` +
          "Add those citations with update_bibliography (add_papers or add_entries) so the derived columns resolve.",
        );
      }
    }
    if (summary.derivedColumnWrites.length > 0) {
      warnings.push(
        `Ignored writes to derived columns (${[...new Set(summary.derivedColumnWrites)].join(", ")}); ` +
        "they are computed from the bibliography and cannot be set.",
      );
    }

    return {
      path: `/workspace/${workspacePath}`,
      created,
      rowCount: next.rows.length,
      columnIds: next.columns.map((column) => column.id),
      summary: {
        papersAdded: summary.papersAdded,
        papersSkipped: [...new Set(summary.papersSkipped)],
        columnsAdded: summary.columnsAdded,
        cellsUpdated: summary.cellsUpdated,
        rowsRemoved: summary.rowsRemoved,
        columnsRemoved: summary.columnsRemoved,
        unknownRows: [...new Set(summary.unknownRows)],
        unknownColumns: [...new Set(summary.unknownColumns)],
      },
      warnings,
    };
  },
});
