import path from "node:path";

import { defineTool } from "eve/tools";
import { z } from "zod";
import mammoth from "mammoth";
import { OfficeParser } from "officeparser";
import * as XLSX from "xlsx";

import { readOfficeBytes } from "../lib/office-files";

const inputSchema = z.object({
  filePath: z.string().min(1).max(500),
  format: z.enum(["markdown", "text"]).default("markdown"),
  offset: z.number().int().min(0).default(0).describe("Character offset for paginating document or presentation output."),
  limit: z.number().int().min(1).max(80_000).default(30_000).describe("Maximum characters returned for document or presentation output."),
  sheet: z.string().min(1).max(200).optional().describe("Workbook sheet to read; defaults to the first sheet."),
  startRow: z.number().int().min(1).default(1),
  maxRows: z.number().int().min(1).max(1_000).default(100),
  maxColumns: z.number().int().min(1).max(200).default(50),
}).strict();

const workbookExtensions = new Set([".xls", ".xlsx", ".xlsm", ".xlsb", ".ods"]);
const parserExtensions = new Set([".docx", ".pptx", ".odt", ".odp", ".rtf"]);

function serializable(value: unknown): unknown {
  return JSON.parse(JSON.stringify(value, (_key, item) => item instanceof Date ? item.toISOString() : item));
}

export default defineTool({
  description:
    "Read Microsoft Office or OpenDocument content without using read_file or ad-hoc scripts. " +
    "For workbooks, returns bounded structured cell data with formulas and sheet names. For DOCX/PPTX/ODT/ODP/RTF, " +
    "returns paginated semantic Markdown or text, metadata, and parser warnings. This reads content, not visual layout; " +
    "do not use it to judge slide design or exact page appearance. Legacy DOC and PPT are not supported by this tool.",
  inputSchema,
  async execute(input, ctx) {
    const source = await readOfficeBytes(ctx, input.filePath);
    if (workbookExtensions.has(source.extension)) {
      const workbook = XLSX.read(source.bytes, { type: "buffer", cellDates: true, cellFormula: true });
      const sheetName = input.sheet ?? workbook.SheetNames[0];
      if (!sheetName || !workbook.Sheets[sheetName]) {
        throw new Error(`Worksheet not found. Available sheets: ${workbook.SheetNames.join(", ")}`);
      }
      const sheet = workbook.Sheets[sheetName];
      const range = XLSX.utils.decode_range(sheet["!ref"] ?? "A1:A1");
      const firstRow = Math.max(range.s.r, input.startRow - 1);
      const lastRow = Math.min(range.e.r, firstRow + input.maxRows - 1);
      const lastColumn = Math.min(range.e.c, range.s.c + input.maxColumns - 1);
      const rows = [];
      for (let row = firstRow; row <= lastRow; row++) {
        const cells = [];
        for (let column = range.s.c; column <= lastColumn; column++) {
          const address = XLSX.utils.encode_cell({ r: row, c: column });
          const cell = sheet[address];
          cells.push(cell ? {
            address,
            value: serializable(cell.v),
            display: cell.w,
            formula: cell.f,
            type: cell.t,
          } : { address, value: null });
        }
        rows.push({ row: row + 1, cells });
      }
      return {
        path: source.path,
        type: "workbook",
        sheets: workbook.SheetNames,
        selectedSheet: sheetName,
        usedRange: sheet["!ref"] ?? null,
        rows,
        truncatedRows: lastRow < range.e.r,
        truncatedColumns: lastColumn < range.e.c,
      };
    }

    if (!parserExtensions.has(source.extension)) {
      throw new Error(`Unsupported Office format ${source.extension || "without an extension"}. Supported: DOCX, PPTX, XLS/XLSX, ODT/ODS/ODP, and RTF.`);
    }
    let ast;
    try {
      ast = await OfficeParser.parseOffice(source.bytes, {
        fileType: source.extension.slice(1) as "docx" | "pptx" | "odt" | "odp" | "rtf",
        extractAttachments: false,
        ocr: false,
        includeRawContent: false,
        decompressionLimits: {
          maxUncompressedBytes: 128 * 1024 * 1024,
          maxZipEntries: 10_000,
          maxTableCells: 1_000_000,
        },
      });
    } catch (error) {
      if (source.extension !== ".docx") throw error;
      const fallback = await mammoth.extractRawText({ buffer: source.bytes });
      const content = fallback.value;
      const end = Math.min(content.length, input.offset + input.limit);
      return {
        path: source.path,
        type: "docx",
        metadata: {},
        content: content.slice(input.offset, end),
        offset: input.offset,
        nextOffset: end < content.length ? end : null,
        totalCharacters: content.length,
        warnings: [
          "The structured DOCX parser failed, so Beeblio returned Mammoth plain-text fallback output.",
          ...fallback.messages.map((message) => message.message),
        ],
      };
    }
    const conversion = await ast.to(input.format === "markdown" ? "md" : "text");
    const content = String(conversion.value);
    const end = Math.min(content.length, input.offset + input.limit);
    return {
      path: source.path,
      type: ast.type,
      metadata: serializable(ast.metadata),
      content: content.slice(input.offset, end),
      offset: input.offset,
      nextOffset: end < content.length ? end : null,
      totalCharacters: content.length,
      warnings: serializable(ast.warnings),
      note: path.extname(source.path).toLowerCase() === ".pptx"
        ? "Text extraction does not represent slide appearance; do not infer visual quality from this result."
        : undefined,
    };
  },
});
