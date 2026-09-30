import { defineTool } from "eve/tools";
import { z } from "zod";

import { isBlaxelBatchEnabled, runBlaxelBatchCommand } from "../lib/blaxel-batch-runner";
import { getWorkspaceIdentity } from "../workspace-paths";

const MAX_COMMAND_CHARS = 16_000;
const MAX_OUTPUT_CHARS = 64_000;

export default defineTool({
  description: `Run a data-analysis, statistics, visualization, notebook, PDF-processing, or other research-computation command as an isolated Blaxel Batch job. This is the primary computation tool for Python and analysis work; use it instead of bash so no persistent per-user sandbox is created.

Write substantial programs to /workspace/3-Analysis with write_file first, then execute the saved script by path. Python 3 includes NumPy, pandas, Polars, SciPy, Matplotlib, Seaborn, scikit-learn, statsmodels, NetworkX, openpyxl, PyArrow, DuckDB, and the pinned Beeblio analysis stack. The command has no network or inherited secrets. Raw data and references are read-only; generated files may be written under /workspace/2-Data/derived, /workspace/3-Analysis, and /workspace/4-Reports. Runtime package installation is unsupported.`,
  inputSchema: z.object({
    command: z.string().min(1).max(MAX_COMMAND_CHARS),
    timeoutSeconds: z.number().int().min(1).max(600).default(120),
  }).strict(),
  async *execute({ command: rawCommand, timeoutSeconds }, ctx) {
    if (!isBlaxelBatchEnabled()) {
      throw new Error("Blaxel Batch analysis is disabled; set BLAXEL_BATCH_ENABLED=true");
    }
    const command = rawCommand.trim();
    if (command.includes("\0")) throw new Error("Analysis command contains an invalid null byte");
    const identity = getWorkspaceIdentity({
      principalId: ctx.session.auth.current?.principalId,
      projectSlug: ctx.session.auth.current?.attributes?.projectSlug,
      sessionId: ctx.session.id,
    });
    // console.log("[run_analysis] execution backend", {
    //   backend: "blaxel-batch",
    //   projectSlug: identity.projectSlug,
    // });
    yield { phase: "queued" as const, backend: "blaxel-batch" as const };
    const result = await runBlaxelBatchCommand({
      ctx,
      identity,
      command,
      timeoutMs: timeoutSeconds * 1_000,
    });
    const trim = (value = "") => value.length > MAX_OUTPUT_CHARS
      ? `${value.slice(0, MAX_OUTPUT_CHARS)}\n[output truncated]`
      : value;
    yield {
      ...result,
      backend: "blaxel-batch" as const,
      stdout: trim(result.stdout),
      stderr: trim(result.stderr),
      truncated: result.stdout.length > MAX_OUTPUT_CHARS || result.stderr.length > MAX_OUTPUT_CHARS,
    };
  },
});
