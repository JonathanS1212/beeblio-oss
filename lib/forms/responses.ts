import {
  readAgentWorkspaceFile,
  writeAgentWorkspaceFile,
} from "@/lib/workspace-files";
import { buildSubmissionRow, formColumns, type ParsedFields } from "./columns";
import { csvRow, parseCsv } from "./csv";
import { responsesPathFor, type FormDefinition } from "./schema";

export { responsesPathFor };

/**
 * Server-side response persistence: appends one submission to the CSV file
 * next to the form. The header is the union of the file's existing columns
 * and the form's current columns, so editing a form mid-collection (adding
 * questions) appends new columns and leaves old rows blank-padded instead of
 * corrupting the file. Writes are serialized per responses file in-process
 * (read-modify-write through the agent workspace API has no append).
 */

const pathLocks = new Map<string, Promise<unknown>>();

/** Serializes read-modify-write cycles per responses file. */
async function withPathLock<T>(key: string, operation: () => Promise<T>): Promise<T> {
  const previous = pathLocks.get(key) ?? Promise.resolve();
  const next = previous.then(operation, operation);
  pathLocks.set(key, next);
  try {
    return await next;
  } finally {
    if (pathLocks.get(key) === next) pathLocks.delete(key);
  }
}

export async function appendFormResponse(
  ownerUserId: string,
  projectSlug: string,
  formPath: string,
  definition: FormDefinition,
  fields: ParsedFields,
): Promise<{ responsesPath: string; totalResponses: number }> {
  const responsesPath = responsesPathFor(formPath);
  const lockKey = `${ownerUserId}/${projectSlug}/${responsesPath}`;

  return withPathLock(lockKey, async () => {
    let header: string[] = [];
    let dataRows: string[][] = [];

    try {
      const response = await readAgentWorkspaceFile(ownerUserId, projectSlug, responsesPath);
      const existing = await response.text();
      const rows = parseCsv(existing);
      if (rows.length > 0) header = rows[0];
      dataRows = rows.slice(1);
    } catch {
      // Missing file: first submission creates it below.
    }

    const currentKeys = formColumns(definition).map((column) => column.key);
    const merged = [...header.filter((key) => key !== "")];
    for (const key of currentKeys) {
      if (!merged.includes(key)) merged.push(key);
    }

    const submission = buildSubmissionRow(definition, fields);
    const padded = dataRows.map((row) => {
      const copy = [...row];
      while (copy.length < merged.length) copy.push("");
      return copy;
    });
    padded.push(merged.map((key) => submission[key] ?? ""));

    let csv = csvRow(merged);
    for (const row of padded) csv += csvRow(row);
    await writeAgentWorkspaceFile(ownerUserId, projectSlug, responsesPath, csv);

    return { responsesPath, totalResponses: padded.length };
  });
}
