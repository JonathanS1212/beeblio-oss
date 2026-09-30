"use client";

import { useEffect, useMemo, useState } from "react";

import { DataGrid, type GridRows } from "./data-grid";
import { EditorShell } from "./editor-shell";
import { EditorError, EditorLoading } from "./editor-states";
import type { WorkspaceEditorProps } from "./types";
import { useTextFile } from "./use-text-file";

export function CsvEditor({ projectId, file, sourceUrl, onSaved }: WorkspaceEditorProps) {
  const text = useTextFile(projectId, file.path, onSaved);
  const [rows, setRows] = useState<GridRows>([]);

  useEffect(() => { if (!text.loading && !text.error) setRows(parseCsv(text.draft)); }, [text.loading, text.error, text.content, text.editorVersion]);

  const updateRows = (next: GridRows) => { setRows(next); text.setDraft(serializeCsv(next)); };

  const columnCount = useMemo(() => rows.reduce((max, row) => Math.max(max, row.length), 0), [rows]);

  return (
    <EditorShell
      path={file.path}
      sourceUrl={sourceUrl}
      dirty={text.dirty}
      status={!text.loading && !text.error ? (
        <span className="text-xs text-muted-foreground">
          {/* CSV ·  */}
          {rows.length.toLocaleString()} Rows{columnCount > 0 ? ` · ${columnCount.toLocaleString()} Columns` : ""}
        </span>
      ) : undefined}
      discard={{ onDiscard: text.discard, disabled: text.saving }}
      save={{ onClick: () => text.save(serializeCsv(rows)), saving: text.saving }}
      review={text.review}
    >
      {text.loading ? <EditorLoading name={file.name} size={file.size} /> : text.error ? <EditorError message={text.error} /> : <DataGrid rows={rows} onChange={updateRows} />}
    </EditorShell>
  );
}

export function parseCsv(input: string): GridRows {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  for (let i = 0; i < input.length; i++) {
    const char = input[i];
    if (quoted) {
      if (char === '"' && input[i + 1] === '"') { cell += '"'; i++; }
      else if (char === '"') quoted = false;
      else cell += char;
    } else if (char === '"') quoted = true;
    else if (char === ",") { row.push(cell); cell = ""; }
    else if (char === "\n") { row.push(cell); rows.push(row); row = []; cell = ""; }
    else if (char !== "\r") cell += char;
  }
  if (cell.length > 0 || row.length > 0) { row.push(cell); rows.push(row); }
  return rows.length > 0 ? rows : [[""]];
}

export function serializeCsv(rows: GridRows) {
  return rows.map((row) => row.map((cell) => /[",\n\r]/.test(cell) ? `"${cell.replaceAll('"', '""')}"` : cell).join(",")).join("\n");
}
