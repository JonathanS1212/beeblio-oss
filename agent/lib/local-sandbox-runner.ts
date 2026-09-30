import type { ToolContext } from "eve/tools";

export type LocalSandboxResult = {
  exitCode: number;
  stdout: string;
  stderr: string;
  outputPaths: string[];
  timings: { queueMs: number; downloadMs: number; executionMs: number; uploadMs: number; totalMs: number };
};

/** Executes inside the durable Eve sandbox mounted on the selected project folder. */
export async function runLocalSandboxCommand(options: { ctx: ToolContext; command: string; timeoutMs: number }): Promise<LocalSandboxResult> {
  const sandbox = await options.ctx.getSandbox();
  const started = Date.now();
  const timeout = AbortSignal.timeout(options.timeoutMs);
  const signal = options.ctx.abortSignal ? AbortSignal.any([options.ctx.abortSignal, timeout]) : timeout;
  const result = await sandbox.run({ command: options.command, workingDirectory: "/workspace", abortSignal: signal });
  const elapsed = Date.now() - started;
  return { ...result, outputPaths: [], timings: { queueMs: 0, downloadMs: 0, executionMs: elapsed, uploadMs: 0, totalMs: elapsed } };
}
