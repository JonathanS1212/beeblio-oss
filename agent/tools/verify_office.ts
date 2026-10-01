import path from "node:path";

import { defineTool } from "eve/tools";
import JSZip from "jszip";
import { z } from "zod";

import { readOfficeBytes } from "../lib/office-files";

type Metrics = Record<string, string[] | number | boolean>;
type Report = { format: string; ok: boolean; errors: string[]; warnings: string[]; metrics: Metrics; sourceMetrics?: Metrics };
const supported = new Set([".docx", ".xlsx", ".pptx"]);

function count(text: string, pattern: RegExp): number {
  return [...text.matchAll(pattern)].length;
}

async function inspect(bytes: Uint8Array, extension: string): Promise<Report> {
  const report: Report = { format: extension.slice(1), ok: false, errors: [], warnings: [], metrics: {} };
  let zip: JSZip;
  try {
    zip = await JSZip.loadAsync(bytes, { checkCRC32: true });
  } catch (error) {
    report.errors.push(`Cannot open ZIP package: ${String(error)}`);
    return report;
  }
  const names = Object.keys(zip.files).filter((name) => !zip.files[name].dir);
  const nameSet = new Set(names);
  const read = async (name: string) => zip.file(name)?.async("string") ?? "";
  if (!nameSet.has("[Content_Types].xml") || !nameSet.has("_rels/.rels")) {
    report.errors.push("Missing required OOXML package metadata");
  }
  for (const name of names.filter((item) => item.endsWith(".rels"))) {
    const xml = await read(name);
    const base = name === "_rels/.rels" ? "." : path.posix.dirname(path.posix.dirname(name));
    for (const match of xml.matchAll(/<Relationship\b([^>]*?)\/?\s*>/g)) {
      const attributes = match[1];
      if (/TargetMode=["']External["']/.test(attributes)) continue;
      const target = /\bTarget=["']([^"']+)["']/.exec(attributes)?.[1];
      if (!target) continue;
      const bare = target.split(/[?#]/, 1)[0];
      const resolved = bare.startsWith("/") ? bare.slice(1) : path.posix.normalize(path.posix.join(base, bare));
      if (!nameSet.has(resolved)) report.errors.push(`Broken internal relationship: ${name} → ${target}`);
    }
  }
  if (extension === ".docx") {
    const document = await read("word/document.xml");
    if (!document) report.errors.push("Missing word/document.xml");
    report.metrics = {
      paragraphs: count(document, /<w:p(?:\s|>)/g),
      tables: count(document, /<w:tbl(?:\s|>)/g),
      images: names.filter((name) => name.startsWith("word/media/")).length,
      comments: nameSet.has("word/comments.xml"),
      trackedChanges: /<w:(?:ins|del)(?:\s|>)/.test(document),
      footnotes: nameSet.has("word/footnotes.xml"),
      headers: names.filter((name) => /^word\/header\d+\.xml$/.test(name)).length,
      hyperlinks: count(document, /<w:hyperlink(?:\s|>)/g),
    };
  } else if (extension === ".xlsx") {
    const workbook = await read("xl/workbook.xml");
    if (!workbook) report.errors.push("Missing xl/workbook.xml");
    const sheets = [...workbook.matchAll(/<sheet\b[^>]*\bname=["']([^"']+)["']/g)].map((match) => match[1]);
    const sheetFiles = names.filter((name) => /^xl\/worksheets\/sheet\d+\.xml$/.test(name));
    let formulas = 0;
    let errorCells = 0;
    for (const name of sheetFiles) {
      const xml = await read(name);
      formulas += count(xml, /<f(?:\s|>)/g);
      errorCells += count(xml, /<c\b[^>]*\bt=["']e["']/g);
    }
    report.metrics = {
      sheets,
      worksheetParts: sheetFiles.length,
      formulas,
      errorCells,
      charts: names.filter((name) => /^xl\/charts\/chart\d+\.xml$/.test(name)).length,
      tables: names.filter((name) => /^xl\/tables\/table\d+\.xml$/.test(name)).length,
      macros: nameSet.has("xl/vbaProject.bin"),
    };
    if (!sheets.length || !sheetFiles.length) report.errors.push("Workbook has no worksheets");
    if (errorCells) report.errors.push(`Workbook contains ${errorCells} cached error cell(s)`);
    if (formulas) report.warnings.push("Formula results were not recalculated; verify key outputs independently");
  } else {
    const presentation = await read("ppt/presentation.xml");
    if (!presentation) report.errors.push("Missing ppt/presentation.xml");
    const slides = names.filter((name) => /^ppt\/slides\/slide\d+\.xml$/.test(name));
    report.metrics = {
      slides: slides.length,
      media: names.filter((name) => name.startsWith("ppt/media/")).length,
      charts: names.filter((name) => /^ppt\/charts\/chart\d+\.xml$/.test(name)).length,
      notes: names.filter((name) => /^ppt\/notesSlides\/notesSlide\d+\.xml$/.test(name)).length,
    };
    if (!slides.length) report.errors.push("Presentation has no slides");
  }
  report.ok = report.errors.length === 0;
  return report;
}

export default defineTool({
  description:
    "Check a DOCX, XLSX, or PPTX package for broken ZIP/relationships, core parts, workbook error cells, " +
    "and possible feature loss compared with an optional source file. This does not judge visual layout or recalculate formulas.",
  inputSchema: z.object({
    filePath: z.string().min(1).max(500),
    sourceFilePath: z.string().min(1).max(500).optional(),
  }).strict(),
  async execute(input, ctx) {
    const output = await readOfficeBytes(ctx, input.filePath);
    if (!supported.has(output.extension)) throw new Error("verify_office supports DOCX, XLSX, and PPTX only.");
    const source = input.sourceFilePath ? await readOfficeBytes(ctx, input.sourceFilePath) : null;
    if (source && source.extension !== output.extension) throw new Error("Source and output formats must match.");
    const report = await inspect(output.bytes, output.extension);
    if (source) {
      const before = await inspect(source.bytes, source.extension);
      report.sourceMetrics = before.metrics;
      if (!before.ok) report.warnings.push("Source package has structural errors; compare manually");
      const keys = output.extension === ".docx"
        ? ["images", "comments", "trackedChanges", "footnotes", "headers", "hyperlinks"]
        : output.extension === ".xlsx" ? ["charts", "tables", "macros"] : ["slides", "media", "charts", "notes"];
      for (const key of keys) {
        const oldValue = before.metrics[key];
        const newValue = report.metrics[key];
        if (oldValue && (!newValue || typeof oldValue === "number" && typeof newValue === "number" && newValue < oldValue)) {
          report.warnings.push(`Source ${key} decreased or disappeared (${oldValue} → ${newValue}); confirm this was requested`);
        }
      }
      if (output.extension === ".xlsx") {
        const oldSheets = before.metrics.sheets as string[] | undefined;
        const newSheets = report.metrics.sheets as string[] | undefined;
        if (oldSheets?.some((sheet) => !newSheets?.includes(sheet))) report.warnings.push("One or more source worksheets are missing");
      }
    }
    return { path: output.path, ...report };
  },
});
