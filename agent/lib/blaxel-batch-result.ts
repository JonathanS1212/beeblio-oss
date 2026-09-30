export type BlaxelBatchTimings = {
  queueMs: number;
  downloadMs: number;
  executionMs: number;
  uploadMs: number;
  totalMs: number;
};

export type BlaxelBatchResult = {
  exitCode: number;
  stdout: string;
  stderr: string;
  outputPaths: string[];
  timings: BlaxelBatchTimings;
};

type BatchResultRecord = BlaxelBatchResult & {
  schemaVersion: 1;
};

function asFiniteNonNegative(value: unknown, name: string): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
    throw new Error(`Batch result has an invalid ${name}`);
  }
  return value;
}

export function parseBatchResult(input: unknown): BlaxelBatchResult {
  if (typeof input !== "object" || input === null) {
    throw new Error("Batch result is not an object");
  }
  const value = input as Partial<BatchResultRecord>;
  if (value.schemaVersion !== 1) throw new Error("Batch result has an unsupported schema version");
  if (!Number.isInteger(value.exitCode) || (value.exitCode as number) < 0) {
    throw new Error("Batch result has an invalid exit code");
  }
  if (typeof value.stdout !== "string" || typeof value.stderr !== "string") {
    throw new Error("Batch result is missing process output");
  }
  if (!Array.isArray(value.outputPaths) || !value.outputPaths.every((item) => typeof item === "string")) {
    throw new Error("Batch result has invalid output paths");
  }
  if (typeof value.timings !== "object" || value.timings === null) {
    throw new Error("Batch result is missing timing data");
  }
  return {
    exitCode: value.exitCode as number,
    stdout: value.stdout,
    stderr: value.stderr,
    outputPaths: value.outputPaths,
    timings: {
      queueMs: asFiniteNonNegative(value.timings.queueMs, "queueMs"),
      downloadMs: asFiniteNonNegative(value.timings.downloadMs, "downloadMs"),
      executionMs: asFiniteNonNegative(value.timings.executionMs, "executionMs"),
      uploadMs: asFiniteNonNegative(value.timings.uploadMs, "uploadMs"),
      totalMs: asFiniteNonNegative(value.timings.totalMs, "totalMs"),
    },
  };
}
