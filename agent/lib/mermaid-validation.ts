// Mermaid's public parse API initializes browser sanitization even for syntax
// checks. The pinned flowchart parser can validate without a DOM.
// @ts-expect-error Mermaid does not publish declarations for its bundled chunk.
import { diagram as flowchartDiagram } from "mermaid/dist/chunks/mermaid.core/chunk-PUDLZKDR.mjs";

type FlowchartDatabase = {
  clear: () => void;
  sanitizeNodeLabelType: (value: string) => string;
  sanitizeText: (value: string) => string;
};

type FlowchartParser = {
  parser: { yy?: FlowchartDatabase };
  yy?: FlowchartDatabase;
  parse: (source: string) => unknown;
};

function conciseParserError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  return message.replace(/^Error:\s*/u, "").trim();
}

export function isMermaidFlowchart(source: string): boolean {
  return /^(?:flowchart|graph)\s+(?:TB|TD|BT|RL|LR)\b/iu.test(source.trim());
}

export function validateMermaidFlowchart(source: string):
  | { valid: true; diagramType: "flowchart" }
  | { valid: false; diagramType?: "flowchart"; error: string } {
  const trimmed = source.trim();
  if (/^(?:```|~~~)/u.test(trimmed) || /(?:```|~~~)\s*$/u.test(trimmed)) {
    return { valid: false, error: "Pass raw Mermaid source only, without Markdown code fences." };
  }
  if (!isMermaidFlowchart(trimmed)) {
    return {
      valid: false,
      error: "This validator currently supports flowchart/graph diagrams with an explicit direction.",
    };
  }

  const db = flowchartDiagram.db as FlowchartDatabase;
  db.clear();
  db.sanitizeText = (value) => value;
  db.sanitizeNodeLabelType = (value) => value;
  const parser = flowchartDiagram.parser as FlowchartParser;
  parser.yy = db;
  parser.parser.yy = db;

  try {
    parser.parse(trimmed);
    return { valid: true, diagramType: "flowchart" };
  } catch (error) {
    return {
      valid: false,
      diagramType: "flowchart",
      error: conciseParserError(error),
    };
  }
}

function mermaidFlowchartsInMarkdown(content: string): string[] {
  const lines = content.split(/\r?\n/u);
  const diagrams: string[] = [];
  for (let index = 0; index < lines.length; index += 1) {
    const opening = lines[index]?.match(/^\s*(([`~])\2{2,})mermaid\s*$/iu);
    if (!opening) continue;
    const fenceCharacter = opening[2];
    const minimumLength = opening[1].length;
    const body: string[] = [];
    let closed = false;
    for (index += 1; index < lines.length; index += 1) {
      const line = lines[index] ?? "";
      const closing = line.match(/^\s*([`~]{3,})\s*$/u);
      if (
        closing &&
        closing[1][0] === fenceCharacter &&
        closing[1].length >= minimumLength
      ) {
        closed = true;
        break;
      }
      body.push(line);
    }
    if (!closed) throw new Error("Invalid Mermaid: Markdown Mermaid code fence is not closed.");
    const source = body.join("\n");
    if (isMermaidFlowchart(source)) diagrams.push(source);
  }
  return diagrams;
}

export function assertValidMermaidFlowcharts(filePath: string, content: string): void {
  const normalizedPath = filePath.toLowerCase();
  const sources =
    normalizedPath.endsWith(".mmd") || normalizedPath.endsWith(".mermaid")
      ? (isMermaidFlowchart(content) ? [content] : [])
      : normalizedPath.endsWith(".md") || normalizedPath.endsWith(".markdown")
        ? mermaidFlowchartsInMarkdown(content)
        : [];

  for (const [index, source] of sources.entries()) {
    const result = validateMermaidFlowchart(source);
    if (!result.valid) {
      const location = sources.length > 1 ? ` block ${index + 1}` : "";
      throw new Error(
        `Invalid Mermaid flowchart${location}; repair it with validate_mermaid before writing. ${result.error}`,
      );
    }
  }
}
