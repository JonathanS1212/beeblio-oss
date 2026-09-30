import { SandboxInstance } from "@blaxel/core";
import { integerEnv } from "@/lib/env-config";

// Gotenberg runs as a real process inside a dedicated Blaxel sandbox (image
// built from the official gotenberg/gotenberg image by
// scripts/build-gotenberg-image.mjs), reached through the SDK's port proxy
// (SandboxInstance.fetch). The sandbox scales to zero between conversions;
// a standby snapshot preserves the running process, and the health check +
// named-process restart below self-heal the cases it does not.

const PORT = 3000;
const SERVER_PROCESS_NAME = "beeblio-gotenberg-server";
// No process auto-kill (timeout 0) but no keepAlive either: scale-to-zero
// must stay enabled so the sandbox does not burn always-on compute.
const SERVER_STARTUP_TIMEOUT_MS = integerEnv("GOTENBERG_SERVER_STARTUP_TIMEOUT_MS", 60_000, 5_000);
// Blaxel injects observability env into every sandbox process; Gotenberg
// parses both. LOG_LEVEL=DEBUG (uppercase) is fatal to its config parser,
// and the OTEL_* exporters would point its telemetry at Blaxel's collector.
// exec env merges over the sandbox environment (verified 2026-09-12).
const SERVER_ENV = {
  LOG_LEVEL: "info",
  OTEL_TRACES_EXPORTER: "none",
  OTEL_METRICS_EXPORTER: "none",
  OTEL_LOGS_EXPORTER: "none",
};
const WAKE_RETRY_TOTAL_MS = 30_000;
// Retry transient Blaxel wake failures within a short user-facing budget.
function stringifyError(error: unknown): string {
  if (error instanceof Error) {
    if (error.message === "[object Object]") {
      const body = (error as { body?: unknown }).body;
      if (body) {
        try { return JSON.stringify(body); } catch {}
      }
      try { return JSON.stringify(error); } catch {}
    }
    return error.message;
  }
  if (typeof error === "string") return error;
  try {
    return JSON.stringify(error, null, 0);
  } catch {
    return String(error);
  }
}

async function withWakeRetry<T>(label: string, fn: () => Promise<T>): Promise<T> {
  const deadline = Date.now() + WAKE_RETRY_TOTAL_MS;
  let lastError: unknown;
  for (let attempt = 1; ; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      const message = stringifyError(error);
      const errorCode = typeof error === "object" && error !== null
        ? ((error as { code?: number }).code ?? (error as { status?: number }).status ?? (error as { statusCode?: number }).statusCode)
        : undefined;
      const waking = /502|504|unreachable|waking|UNAVAILABLE|WORKLOAD_UNAVAILABLE/i.test(message) ||
        (typeof errorCode === "number" && [502, 504].includes(errorCode));
      if (!waking || Date.now() > deadline) {
        throw new Error(`blaxel gotenberg call "${label}" failed: ${message}`, { cause: lastError });
      }
      await new Promise((resolve) => setTimeout(resolve, Math.min(1000 * attempt, 5000)));
    }
  }
}

let sandboxPromise: Promise<SandboxInstance> | undefined;

function gotenbergSandbox(): Promise<SandboxInstance> {
  sandboxPromise ??= (async () => {
    const image = process.env.BLAXEL_GOTENBERG_IMAGE;
    if (!image) {
      throw new Error(
        "BLAXEL_GOTENBERG_IMAGE is not set. Build the image with scripts/build-gotenberg-image.mjs and add it to the environment (see .env.example).",
      );
    }
    const region = process.env.BLAXEL_REGION;
    if (!region) throw new Error("BLAXEL_REGION is not set (see .env.example).");
    return withWakeRetry("sandbox:create", () =>
      SandboxInstance.createIfNotExists({
        name: process.env.BLAXEL_GOTENBERG_SANDBOX ?? "beeblio-gotenberg",
        image,
        memory: Number(process.env.BLAXEL_GOTENBERG_MEMORY) || 2048,
        region,
        lifecycle: {
          expirationPolicies: [
            { type: "ttl-idle", action: "delete", value: process.env.BLAXEL_GOTENBERG_IDLE_TTL ?? "7d" },
          ],
        },
        // This is a shared rendering utility, not a project-scoped agent
        // workspace. Keep its labels distinct from Job executions.
        labels: { app: "beeblio-utility", service: "gotenberg" },
      }),
    );
  })();
  const pending = sandboxPromise;
  pending.catch(() => {
    if (sandboxPromise === pending) sandboxPromise = undefined;
  });
  return pending;
}

async function isHealthy(sbx: SandboxInstance, timeoutMs: number): Promise<boolean> {
  try {
    const response = await sbx.fetch(PORT, "/health", { signal: AbortSignal.timeout(timeoutMs) });
    return response.ok;
  } catch {
    return false;
  }
}

let startingServer: Promise<void> | undefined;

async function startServer(sbx: SandboxInstance, apiTimeoutSeconds: number): Promise<void> {
  // A terminal process under our name would block a fresh start; clear it.
  const existing = await withWakeRetry("server:status", () =>
    sbx.process.get(SERVER_PROCESS_NAME)).catch(() => null);
  if (existing && existing.status !== undefined && existing.status !== "running") {
    await withWakeRetry("server:cleanup", () => sbx.process.kill(SERVER_PROCESS_NAME)).catch(() => {});
  }
  try {
    await withWakeRetry("server:start", () =>
      sbx.process.exec({
        command: `gotenberg --api-timeout=${apiTimeoutSeconds}s`,
        name: SERVER_PROCESS_NAME,
        waitForCompletion: false,
        restartOnFailure: true,
        maxRestarts: 3,
        timeout: 0,
        env: SERVER_ENV,
      }));
  } catch (error) {
    // A concurrent conversion (web + agent are separate processes) may have
    // started the server under the same name first — the health poll below
    // settles which one is serving.
    if (!/exist|conflict|duplicate|already/i.test(stringifyError(error))) throw error;
  }

  const deadline = Date.now() + SERVER_STARTUP_TIMEOUT_MS;
  while (Date.now() < deadline) {
    if (await isHealthy(sbx, 5_000)) return;
    await new Promise((resolve) => setTimeout(resolve, 1_000));
  }
  const info = await sbx.process.get(SERVER_PROCESS_NAME).catch(() => null);
  const logs = ((info as { logs?: string; stderr?: string } | null)?.logs ?? "") +
    ((info as { stderr?: string } | null)?.stderr ?? "");
  throw new Error(`Gotenberg did not become healthy within ${SERVER_STARTUP_TIMEOUT_MS}ms. ${logs.slice(0, 400)}`);
}

async function ensureServer(sbx: SandboxInstance, apiTimeoutSeconds: number): Promise<void> {
  if (await isHealthy(sbx, 4_000)) return;
  startingServer ??= startServer(sbx, apiTimeoutSeconds).finally(() => {
    startingServer = undefined;
  });
  return startingServer;
}

/**
 * Sends a request to the Gotenberg server inside its Blaxel sandbox, waking
 * the sandbox and (re)starting the server process when needed. Non-2xx
 * responses are returned as-is; only transport failures throw.
 */
export async function gotenbergRequest(path: string, init: RequestInit): Promise<Response> {
  const sbx = await gotenbergSandbox();
  // The server's --api-timeout must cover the request, so derive it here and
  // reuse it for the client-side abort signal.
  const timeoutMs = integerEnv("GOTENBERG_TIMEOUT_MS", 120_000, 1_000);
  await ensureServer(sbx, Math.ceil(timeoutMs / 1000));
  return withWakeRetry(`fetch:${path}`, () => sbx.fetch(PORT, path, init));
}
