import { createHash } from "node:crypto";
import { chmod, chown, readdir, mkdir, readFile, stat } from "node:fs/promises";
import path from "node:path";
import { spawn } from "node:child_process";

import { blStartJob } from "@blaxel/core";
import { Storage } from "@google-cloud/storage";

const WORKSPACE = "/workspace";
const WRITABLE_DIRECTORIES = [".bee-downloads", "2-Data/derived", "3-Analysis", "4-Reports"];
const RESULT_PREFIX = "__beeblio_batch_results";
const MAX_OUTPUT_BYTES = 64_000;
const IDENTITY_PATTERN = /^[A-Za-z0-9_-]+$/;

function credentials() {
  const encoded = process.env.GCS_SA_KEY_BASE64;
  const raw = encoded
    ? Buffer.from(encoded, "base64").toString("utf8")
    : process.env.GCS_SA_KEY;
  if (!raw) throw new Error("GCS_SA_KEY_BASE64 is not configured on the analysis job");
  return JSON.parse(raw);
}

function validateTask(task) {
  if (task?.schemaVersion !== 1) throw new Error("Unsupported analysis task schema");
  for (const key of ["userId", "projectSlug", "runId", "bucket", "resultObject", "command"]) {
    if (typeof task[key] !== "string" || task[key].length === 0) {
      throw new Error(`Analysis task is missing ${key}`);
    }
  }
  if (!IDENTITY_PATTERN.test(task.userId) || !IDENTITY_PATTERN.test(task.projectSlug)) {
    throw new Error("Analysis task has an invalid workspace identity");
  }
  if (!task.resultObject.startsWith(`${RESULT_PREFIX}/${task.userId}/`)) {
    throw new Error("Analysis task has an invalid result object");
  }
  if (!process.env.GCS_BUCKET || task.bucket !== process.env.GCS_BUCKET) {
    throw new Error("Analysis task targets an unexpected storage bucket");
  }
  if (!Number.isInteger(task.timeoutSeconds) || task.timeoutSeconds < 1 || task.timeoutSeconds > 600) {
    throw new Error("Analysis timeout must be between 1 and 600 seconds");
  }
  if (!Number.isFinite(task.submittedAtMs) || task.submittedAtMs <= 0) {
    throw new Error("Analysis task has an invalid submission timestamp");
  }
}

async function mapLimit(items, limit, fn) {
  const queue = [...items];
  const workers = Array.from({ length: Math.min(limit, queue.length) }, async () => {
    for (;;) {
      const item = queue.shift();
      if (item === undefined) return;
      await fn(item);
    }
  });
  await Promise.all(workers);
}

function safeLocalPath(relative) {
  const normalized = path.posix.normalize(relative);
  if (!normalized || normalized === "." || normalized.startsWith("../") || path.posix.isAbsolute(normalized)) {
    throw new Error(`Unsafe workspace object path: ${relative}`);
  }
  return path.join(WORKSPACE, ...normalized.split("/"));
}

async function downloadWorkspace(bucket, prefix) {
  const [files] = await bucket.getFiles({ prefix: `${prefix}/` });
  const generations = new Map();
  const objects = files.filter((file) => !file.name.endsWith("/"));
  await mapLimit(objects, 12, async (file) => {
    const relative = file.name.slice(prefix.length + 1);
    if (!relative || relative === ".bee-workspace.json") return;
    const destination = safeLocalPath(relative);
    await mkdir(path.dirname(destination), { recursive: true });
    await file.download({ destination });
    const [metadata] = await file.getMetadata();
    generations.set(relative, {
      generation: metadata.generation,
      md5Hash: metadata.md5Hash ?? null,
    });
  });
  return generations;
}

async function listLocalFiles(root, relativeRoot = "") {
  const directory = path.join(root, relativeRoot);
  let entries;
  try {
    entries = await readdir(directory, { withFileTypes: true });
  } catch (error) {
    if (error?.code === "ENOENT") return [];
    throw error;
  }
  const files = [];
  for (const entry of entries) {
    const relative = path.posix.join(relativeRoot, entry.name);
    if (entry.isDirectory()) files.push(...await listLocalFiles(root, relative));
    else if (entry.isFile()) files.push(relative);
  }
  return files;
}

async function chownTree(target, uid, gid) {
  const metadata = await stat(target);
  await chown(target, uid, gid);
  if (!metadata.isDirectory()) return;
  const entries = await readdir(target, { withFileTypes: true });
  await Promise.all(entries.map((entry) => chownTree(path.join(target, entry.name), uid, gid)));
}

async function md5Base64(filePath) {
  return createHash("md5").update(await readFile(filePath)).digest("base64");
}

async function syncOutputs(bucket, prefix, generations) {
  const outputFiles = (await Promise.all(
    WRITABLE_DIRECTORIES.map((directory) => listLocalFiles(WORKSPACE, directory)),
  )).flat();
  const changed = [];
  await mapLimit(outputFiles, 8, async (relative) => {
    const source = safeLocalPath(relative);
    const baseline = generations.get(relative);
    const hash = await md5Base64(source);
    if (baseline?.md5Hash === hash) return;
    await bucket.upload(source, {
      destination: `${prefix}/${relative}`,
      resumable: (await stat(source)).size > 10 * 1024 * 1024,
      preconditionOpts: { ifGenerationMatch: baseline?.generation ?? 0 },
    });
    changed.push(`/workspace/${relative}`);
  });
  return changed.sort();
}

function appendLimited(chunks, state, chunk) {
  if (state.bytes >= MAX_OUTPUT_BYTES) return;
  const bytes = Buffer.from(chunk);
  const remaining = MAX_OUTPUT_BYTES - state.bytes;
  chunks.push(bytes.subarray(0, remaining));
  state.bytes += Math.min(bytes.byteLength, remaining);
}

async function runIsolated(command, timeoutSeconds) {
  // Blaxel may pre-create the image workdir with a restrictive mode. The
  // unprivileged job identity needs traversal to reach the explicitly bound
  // writable subdirectories; contents remain read-only through bwrap.
  await chmod(WORKSPACE, 0o755);
  for (const directory of WRITABLE_DIRECTORIES) {
    const absolute = path.join(WORKSPACE, directory);
    const parent = path.dirname(absolute);
    await mkdir(parent, { recursive: true, mode: 0o755 });
    await chmod(parent, 0o755);
    await mkdir(absolute, { recursive: true, mode: 0o770 });
    await chownTree(absolute, 10001, 10001);
  }
  const args = [
    "--die-with-parent", "--new-session", "--unshare-user", "--unshare-pid", "--unshare-ipc", "--unshare-uts", "--unshare-net",
    "--ro-bind", "/", "/", "--proc", "/proc", "--dev", "/dev", "--tmpfs", "/tmp", "--dir", "/tmp/home",
    ...WRITABLE_DIRECTORIES.flatMap((directory) => {
      const absolute = path.join(WORKSPACE, directory);
      return ["--bind", absolute, absolute];
    }),
    "--chdir", WORKSPACE,
    "--clearenv",
    "--setenv", "HOME", "/tmp/home",
    "--setenv", "PATH", "/opt/beeblio-python/bin:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin",
    "--setenv", "PYTHONPATH", "/opt/beeblio-research",
    "--setenv", "PYTHONNOUSERSITE", "1",
    "--setenv", "PYTHONDONTWRITEBYTECODE", "1",
    "--setenv", "MPLBACKEND", "Agg",
    "--setenv", "MPLCONFIGDIR", "/tmp/matplotlib",
    "--setenv", "XDG_CACHE_HOME", "/tmp/cache",
    "--setenv", "OMP_NUM_THREADS", "2",
    "--setenv", "OPENBLAS_NUM_THREADS", "2",
    "--setenv", "MKL_NUM_THREADS", "2",
    "--uid", "10001", "--gid", "10001",
    "/usr/bin/timeout", "--signal=TERM", "--kill-after=5s", `${timeoutSeconds}s`, "/bin/sh", "-c", command,
  ];
  const child = spawn(
    "/usr/bin/setpriv",
    ["--reuid=10001", "--regid=10001", "--clear-groups", "/usr/bin/bwrap", ...args],
    { stdio: ["ignore", "pipe", "pipe"] },
  );
  const stdout = [];
  const stderr = [];
  const stdoutState = { bytes: 0 };
  const stderrState = { bytes: 0 };
  child.stdout.on("data", (chunk) => appendLimited(stdout, stdoutState, chunk));
  child.stderr.on("data", (chunk) => appendLimited(stderr, stderrState, chunk));
  const exitCode = await new Promise((resolve, reject) => {
    child.once("error", reject);
    child.once("close", (code, signal) => resolve(code ?? (signal ? 128 : 1)));
  });
  return {
    exitCode,
    stdout: Buffer.concat(stdout).toString("utf8"),
    stderr: Buffer.concat(stderr).toString("utf8"),
  };
}

async function analysisJob(task) {
  const workerStartedAt = Date.now();
  validateTask(task);
  const storage = new Storage({ credentials: credentials(), projectId: process.env.GCS_PROJECT_ID || undefined });
  const bucket = storage.bucket(task.bucket);
  const prefix = `${task.userId}/${task.projectSlug}`;
  let downloadMs = 0;
  let executionMs = 0;
  let uploadMs = 0;
  let processResult = { exitCode: 1, stdout: "", stderr: "Analysis worker did not start" };
  let outputPaths = [];

  try {
    await mkdir(WORKSPACE, { recursive: true, mode: 0o755 });
    const downloadStartedAt = Date.now();
    const generations = await downloadWorkspace(bucket, prefix);
    downloadMs = Date.now() - downloadStartedAt;

    const executionStartedAt = Date.now();
    processResult = await runIsolated(task.command, task.timeoutSeconds);
    executionMs = Date.now() - executionStartedAt;

    if (processResult.exitCode === 0) {
      const uploadStartedAt = Date.now();
      outputPaths = await syncOutputs(bucket, prefix, generations);
      uploadMs = Date.now() - uploadStartedAt;
    }
  } catch (error) {
    processResult = {
      exitCode: 1,
      stdout: processResult.stdout,
      stderr: `${processResult.stderr ? `${processResult.stderr}\n` : ""}${error instanceof Error ? error.stack ?? error.message : String(error)}`,
    };
  }

  const finishedAt = Date.now();
  const result = {
    schemaVersion: 1,
    ...processResult,
    outputPaths,
    timings: {
      queueMs: Math.max(0, workerStartedAt - task.submittedAtMs),
      downloadMs,
      executionMs,
      uploadMs,
      totalMs: Math.max(0, finishedAt - task.submittedAtMs),
    },
  };
  await bucket.file(task.resultObject).save(JSON.stringify(result), {
    contentType: "application/json",
    resumable: false,
    preconditionOpts: { ifGenerationMatch: 0 },
  });
}

blStartJob(analysisJob);
