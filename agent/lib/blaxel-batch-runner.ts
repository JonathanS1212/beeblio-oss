import { randomUUID } from "node:crypto";

import { blJob } from "@blaxel/core";
import type { ToolContext } from "eve/tools";

import { workspaceBucket, workspaceBucketName } from "../../lib/workspace-gcs";
import type { WorkspaceIdentity } from "../workspace-paths";
import {
  parseBatchResult,
  type BlaxelBatchResult,
} from "./blaxel-batch-result";

export type { BlaxelBatchResult, BlaxelBatchTimings } from "./blaxel-batch-result";

const RESULT_PREFIX = "__beeblio_batch_results";
const DEFAULT_POLL_MS = 500;
const DEFAULT_STARTUP_ALLOWANCE_MS = 120_000;
const MAX_RESULT_BYTES = 256 * 1024;

export function isBlaxelBatchEnabled(): boolean {
  return process.env.BLAXEL_BATCH_ENABLED?.trim().toLowerCase() === "true";
}

function positiveIntegerEnv(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const value = Number(raw);
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new Error(`${name} must be a positive integer`);
  }
  return value;
}

function requireJobName(): string {
  const value = process.env.BLAXEL_BATCH_JOB?.trim();
  if (!value) throw new Error("BLAXEL_BATCH_JOB is not set (see .env.example)");
  return value;
}

function abortError(): Error {
  const error = new Error("Batch analysis was cancelled");
  error.name = "AbortError";
  return error;
}

async function waitForExecution(options: {
  executionId: string;
  job: ReturnType<typeof blJob>;
  signal: AbortSignal;
  deadline: number;
  pollMs: number;
}): Promise<string> {
  for (;;) {
    if (options.signal.aborted) throw abortError();
    const execution = await options.job.getExecution(options.executionId);
    const status = execution.status ?? "unknown";
    if (["succeeded", "failed", "cancelled"].includes(status)) return status;
    if (Date.now() >= options.deadline) {
      throw new Error(`Batch execution ${options.executionId} did not finish before its deadline`);
    }
    await new Promise<void>((resolve, reject) => {
      const cleanup = () => options.signal.removeEventListener("abort", onAbort);
      const timer = setTimeout(() => {
        cleanup();
        resolve();
      }, options.pollMs);
      const onAbort = () => {
        clearTimeout(timer);
        cleanup();
        reject(abortError());
      };
      options.signal.addEventListener("abort", onAbort, { once: true });
      (timer as { unref?: () => void }).unref?.();
    });
  }
}

async function readResult(resultObject: string, deadline: number): Promise<BlaxelBatchResult | null> {
  const file = workspaceBucket().file(resultObject);
  while (Date.now() < deadline) {
    const [exists] = await file.exists();
    if (exists) {
      const [metadata] = await file.getMetadata();
      if (Number(metadata.size) > MAX_RESULT_BYTES) throw new Error("Batch result exceeds the size limit");
      const [bytes] = await file.download();
      return parseBatchResult(JSON.parse(bytes.toString("utf8")));
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  return null;
}

export async function runBlaxelBatchCommand(options: {
  ctx?: ToolContext;
  abortSignal?: AbortSignal;
  identity: Pick<WorkspaceIdentity, "userId" | "projectSlug">;
  command: string;
  timeoutMs: number;
}): Promise<BlaxelBatchResult> {
  const abortSignal = options.ctx?.abortSignal ?? options.abortSignal;
  if (!abortSignal) throw new Error("Batch execution requires an abort signal");
  const job = blJob(requireJobName());
  const runId = randomUUID();
  const resultObject = `${RESULT_PREFIX}/${options.identity.userId}/${runId}.json`;
  const resultFile = workspaceBucket().file(resultObject);
  const pollMs = positiveIntegerEnv("BLAXEL_BATCH_POLL_MS", DEFAULT_POLL_MS);
  const startupAllowanceMs = positiveIntegerEnv(
    "BLAXEL_BATCH_STARTUP_ALLOWANCE_MS",
    DEFAULT_STARTUP_ALLOWANCE_MS,
  );
  const memory = positiveIntegerEnv("BLAXEL_BATCH_MEMORY", 2048);
  const submittedAtMs = Date.now();
  let executionId: string | null = null;

  try {
    executionId = await job.run(
      [{
        schemaVersion: 1,
        runId,
        submittedAtMs,
        bucket: workspaceBucketName(),
        userId: options.identity.userId,
        projectSlug: options.identity.projectSlug,
        resultObject,
        command: options.command,
        timeoutSeconds: Math.max(1, Math.ceil(options.timeoutMs / 1_000)),
      }],
      { allowQueue: true, memory },
    );

    // console.log("[blaxel-batch] submitted", { executionId, runId });
    const deadline = submittedAtMs + options.timeoutMs + startupAllowanceMs;
    const status = await waitForExecution({
      executionId,
      job,
      signal: abortSignal,
      deadline,
      pollMs,
    });
    const result = await readResult(resultObject, Math.min(deadline, Date.now() + 10_000));
    if (result === null) {
      throw new Error(`Batch execution ${executionId} ${status} without publishing a result`);
    }
    if (status !== "succeeded") {
      throw new Error(
        `Batch execution ${executionId} ${status}: ${result.stderr || result.stdout || "no worker error"}`,
      );
    }
    // console.log("[blaxel-batch] completed", {
    //   executionId,
    //   runId,
    //   ...result.timings,
    // });
    return result;
  } catch (error) {
    if (executionId && abortSignal.aborted) {
      await job.cancelExecution(executionId).catch(() => undefined);
    }
    throw error;
  } finally {
    await resultFile.delete({ ignoreNotFound: true }).catch(() => undefined);
  }
}
