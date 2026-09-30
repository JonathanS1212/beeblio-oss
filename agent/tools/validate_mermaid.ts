import { defineTool } from "eve/tools";
import { z } from "zod";
import { validateMermaidFlowchart } from "../lib/mermaid-validation";

export default defineTool({
  description:
    "Validate raw Mermaid flowchart/graph syntax with the Mermaid parser before returning or writing it. " +
    "Pass source without Markdown fences. If valid is false, repair the reported syntax and validate again.",
  inputSchema: z.object({
    source: z.string().min(1).max(200_000).describe(
      "Raw Mermaid flowchart source beginning with flowchart or graph; do not include Markdown code fences.",
    ),
  }).strict(),
  execute({ source }) {
    return validateMermaidFlowchart(source);
  },
});
