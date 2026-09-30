"use client";

import { useMemo, useRef, useState, type KeyboardEvent } from "react";
import { ArrowDownAZ, Plus, Search } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export type GridRows = string[][];

export function DataGrid({ rows, onChange }: { rows: GridRows; onChange: (rows: GridRows) => void }) {
  const [filter, setFilter] = useState("");
  const [sortColumn, setSortColumn] = useState<number>();
  const [activeCell, setActiveCell] = useState({ row: 0, column: 0 });
  const gridRef = useRef<HTMLDivElement>(null);
  const headers = rows[0] ?? [];
  const width = rows.reduce((maximum, row) => Math.max(maximum, row.length), 1);

  const visibleRows = useMemo(() => {
    let entries = rows.slice(1).map((row, index) => ({ row, index: index + 1 }));
    if (filter) entries = entries.filter(({ row }) => row.some((cell) => cell.toLowerCase().includes(filter.toLowerCase())));
    if (sortColumn !== undefined) entries = entries.toSorted((a, b) => (a.row[sortColumn] ?? "").localeCompare(b.row[sortColumn] ?? "", undefined, { numeric: true }));
    return entries.slice(0, 2000);
  }, [filter, rows, sortColumn]);

  const updateCell = (rowIndex: number, columnIndex: number, value: string) => {
    const next = rows.map((row) => [...row]);
    while (next.length <= rowIndex) next.push([]);
    while (next[rowIndex].length < width) next[rowIndex].push("");
    next[rowIndex][columnIndex] = value;
    onChange(next);
  };

  const focusCell = (row: number, column: number) => {
    const nextRow = Math.max(0, Math.min(row, rows.length - 1));
    const nextColumn = Math.max(0, Math.min(column, width - 1));
    setActiveCell({ row: nextRow, column: nextColumn });
    requestAnimationFrame(() => {
      gridRef.current
        ?.querySelector<HTMLInputElement>(`[data-grid-cell="${nextRow}:${nextColumn}"]`)
        ?.focus();
    });
  };

  const moveWithKeyboard = (event: KeyboardEvent<HTMLInputElement>, row: number, column: number) => {
    if (event.key === "ArrowUp") focusCell(row - 1, column);
    else if (event.key === "ArrowDown" || event.key === "Enter") focusCell(row + 1, column);
    else if (event.key === "ArrowLeft" && event.currentTarget.selectionStart === 0) focusCell(row, column - 1);
    else if (event.key === "ArrowRight" && event.currentTarget.selectionStart === event.currentTarget.value.length) focusCell(row, column + 1);
    else return;
    event.preventDefault();
  };

  const activeValue = rows[activeCell.row]?.[activeCell.column] ?? "";

  return (
    <div ref={gridRef} className="flex h-full min-h-0 flex-col">
      <div className="flex h-10 shrink-0 items-center gap-2 border-b bg-card px-2">
        <div className="relative min-w-36 max-w-64 flex-1"><Search className="absolute left-2 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" /><Input value={filter} onChange={(e) => setFilter(e.target.value)} placeholder="Filter rows" className="h-7 pl-7 text-xs" /></div>
        <span className="text-[10px] text-muted-foreground">{rows.length > 0 ? rows.length - 1 : 0} rows · {width} columns</span>
        <Button size="xs" variant="ghost" onClick={() => onChange(rows.map((row) => [...row, ""]))}><Plus />Column</Button>
        <Button size="xs" variant="ghost" onClick={() => onChange([...rows, Array(width).fill("")])}><Plus />Row</Button>
      </div>
      <div className="flex h-9 shrink-0 items-center border-b bg-card px-2 text-xs">
        <span className="w-14 shrink-0 rounded border bg-muted/40 px-2 py-1 text-center font-medium">
          {columnName(activeCell.column)}{activeCell.row + 1}
        </span>
        <span className="px-2 font-serif italic text-muted-foreground">fx</span>
        <input
          aria-label="Cell value"
          className="min-w-0 flex-1 bg-transparent px-2 outline-none focus:ring-1 focus:ring-inset focus:ring-primary"
          value={activeValue}
          onChange={(event) => updateCell(activeCell.row, activeCell.column, event.target.value)}
        />
      </div>
      <div className="min-h-0 flex-1 overflow-auto bg-card">
        <table className="w-max min-w-full border-separate border-spacing-0 text-xs">
          <thead className="sticky top-0 z-20 bg-muted">
            <tr><th className="sticky left-0 z-30 w-11 border-b border-r bg-muted px-2 py-2 text-right font-normal text-muted-foreground">#</th>{Array.from({ length: width }, (_, column) => <th key={column} className="min-w-36 border-b border-r p-0 text-left font-medium"><div className="flex items-center"><input aria-label={`Column ${columnName(column)} header`} className="h-8 min-w-0 flex-1 bg-transparent px-2 font-medium outline-none focus:bg-accent/50" value={headers[column] ?? ""} placeholder={columnName(column)} onChange={(event) => updateCell(0, column, event.target.value)} /><button className="flex size-7 shrink-0 items-center justify-center text-muted-foreground hover:text-foreground" aria-label={`Sort by ${headers[column] || columnName(column)}`} onClick={() => setSortColumn(sortColumn === column ? undefined : column)}>{sortColumn === column ? <ArrowDownAZ className="size-3" /> : <span className="text-[9px]">A↕</span>}</button></div></th>)}</tr>
          </thead>
          <tbody>
            {visibleRows.map(({ row, index }) => <tr key={index} className="hover:bg-muted/30"><th className="sticky left-0 z-10 border-b border-r bg-muted/80 px-2 text-right font-normal text-muted-foreground">{index + 1}</th>{Array.from({ length: width }, (_, column) => <td key={column} className="border-b border-r p-0"><input data-grid-cell={`${index}:${column}`} aria-label={`Row ${index + 1}, ${headers[column] || columnName(column)}`} className="h-8 w-full min-w-36 bg-transparent px-2 outline-none focus:bg-primary/5 focus:ring-2 focus:ring-inset focus:ring-primary" value={row[column] ?? ""} onFocus={() => setActiveCell({ row: index, column })} onKeyDown={(event) => moveWithKeyboard(event, index, column)} onChange={(e) => updateCell(index, column, e.target.value)} /></td>)}</tr>)}
          </tbody>
        </table>
        {visibleRows.length === 2000 && rows.length > 2001 ? <p className="sticky left-0 p-3 text-xs text-muted-foreground">Showing the first 2,000 rows. Use the filter to narrow the dataset.</p> : null}
      </div>
    </div>
  );
}

function columnName(index: number) {
  let value = index + 1;
  let name = "";
  while (value > 0) { const remainder = (value - 1) % 26; name = String.fromCharCode(65 + remainder) + name; value = Math.floor((value - 1) / 26); }
  return name;
}
