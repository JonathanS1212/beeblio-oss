import fs from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";

export const MAX_MODEL_TEXT_CHARS = 25_000;

export function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export function truncateText(value: string, maxChars = MAX_MODEL_TEXT_CHARS) {
  const truncated = value.length > maxChars;
  return {
    content: truncated ? value.slice(0, maxChars) : value,
    contentLength: value.length,
    truncated,
  };
}

export function compactModelOutput(value: unknown, maxChars = 50_000): string {
  const serialized = JSON.stringify(value);
  if (serialized === undefined) return String(value);
  return serialized.length <= maxChars
    ? serialized
    : `${serialized.slice(0, maxChars)}\n[tool output truncated]`;
}

export async function atomicWriteFile(
  targetPath: string,
  content: string | Uint8Array,
): Promise<void> {
  const temporaryPath = path.join(
    path.dirname(targetPath),
    `.${path.basename(targetPath)}.${randomUUID()}.tmp`,
  );
  try {
    await fs.writeFile(temporaryPath, content);
    await fs.rename(temporaryPath, targetPath);
  } catch (error) {
    await fs.rm(temporaryPath, { force: true }).catch(() => undefined);
    throw error;
  }
}

export function fetchWithTimeout(
  url: string | URL,
  init: RequestInit & { timeoutMs?: number } = {},
): Promise<Response> {
  const { timeoutMs = 30_000, signal, ...requestInit } = init;
  return fetch(url, {
    ...requestInit,
    signal: signal
      ? AbortSignal.any([signal, AbortSignal.timeout(timeoutMs)])
      : AbortSignal.timeout(timeoutMs),
  });
}
