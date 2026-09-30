import type { CreditWarningActionCounts, ExecutionClass } from "./types.ts";

export type ModelRole = "main" | "lite" | "vision";

export interface ModelRate {
  provider: string;
  model: string;
  inputUsdMicrosPerMillion: bigint;
  cacheReadUsdMicrosPerMillion: bigint;
  cacheWriteUsdMicrosPerMillion: bigint;
  outputUsdMicrosPerMillion: bigint;
  pricingVersion: string;
}

function integerEnv(name: string, fallback: number, minimum = 0) {
  const raw = process.env[name]?.trim();
  if (!raw) return fallback;
  const value = Number(raw);
  if (!Number.isSafeInteger(value) || value < minimum) {
    throw new Error(`${name} must be an integer greater than or equal to ${minimum}.`);
  }
  return value;
}

function booleanEnv(name: string, fallback: boolean) {
  const raw = process.env[name]?.trim().toLowerCase();
  if (!raw) return fallback;
  if (raw === "true" || raw === "1") return true;
  if (raw === "false" || raw === "0") return false;
  throw new Error(`${name} must be true or false.`);
}

function executionClassEnv(): ExecutionClass {
  const value = process.env.CREDITS_DEFAULT_EXECUTION_CLASS?.trim().toLowerCase();
  return value === "economy" || value === "deep" ? value : "standard";
}

export function getCreditsConfig() {
  const warningActionCounts = {
    notice: integerEnv("CREDITS_NOTICE_ACTIONS_REMAINING", 10, 1),
    warning: integerEnv("CREDITS_WARNING_ACTIONS_REMAINING", 5, 1),
    urgent: integerEnv("CREDITS_URGENT_ACTIONS_REMAINING", 2, 1),
  } satisfies CreditWarningActionCounts;
  if (
    warningActionCounts.notice < warningActionCounts.warning ||
    warningActionCounts.warning < warningActionCounts.urgent
  ) {
    throw new Error(
      "Credit action warning thresholds must descend from notice to warning to urgent.",
    );
  }

  return {
    enabled: booleanEnv("CREDITS_ENABLED", true),
    trialAllowance: integerEnv("CREDITS_TRIAL_ALLOWANCE", 500, 0),
    reservationTtlSeconds: integerEnv("CREDITS_RESERVATION_TTL_SECONDS", 900, 60),
    reservationAmounts: {
      economy: integerEnv("CREDITS_RESERVATION_ECONOMY", 25, 1),
      standard: integerEnv("CREDITS_RESERVATION_STANDARD", 75, 1),
      deep: integerEnv("CREDITS_RESERVATION_DEEP", 200, 1),
    } satisfies Record<ExecutionClass, number>,
    defaultExecutionClass: executionClassEnv(),
    pricingVersion: process.env.CREDITS_PRICING_VERSION?.trim() || "v2-2026-09-13",
    bufferBasisPoints: integerEnv("CREDITS_BUFFER_BASIS_POINTS", 12_500, 1),
    usdMicrosPerCredit: integerEnv("CREDITS_USD_MICROS_PER_CREDIT", 1_000, 1),
    // Blaxel bills active sandbox compute by allocated GB-second. Express the
    // rate per GB-hour so the fractional $0.0000115/GB-second list rate stays
    // exact in the integer-microdollar credit system ($0.0414/GB-hour).
    sandboxUsdMicrosPerGbHour: integerEnv(
      "CREDITS_SANDBOX_USD_MICROS_PER_GB_HOUR",
      41_400,
      1,
    ),
    historyLimit: integerEnv("CREDITS_USAGE_HISTORY_LIMIT", 20, 1),
    warningActionCounts,
    externalToolCredits: {
      webSearchPerCall: integerEnv("CREDITS_WEB_SEARCH_CREDITS_PER_CALL", 0, 0),
      webFetchPerUrl: integerEnv("CREDITS_WEB_FETCH_CREDITS_PER_URL", 0, 0),
    },
    externalToolUsdMicros: {
      // Per minute of audio, not per call — a 45-minute interview and a
      // 30-second memo must not cost the same (docs/entitlements-plan.md §5).
      transcriptionPerMinute: integerEnv(
        "CREDITS_TRANSCRIPTION_USD_MICROS_PER_MINUTE",
        0,
        0,
      ),
    },
    knowledge: {
      // Gemini File Search: storage and query-time embeddings are free; the
      // one-time indexing pass embeds the document at $0.15 per 1M tokens
      // (ai.google.dev/gemini-api/docs/file-search).
      indexingUsdMicrosPerMillion: integerEnv(
        "CREDITS_KNOWLEDGE_INDEXING_USD_MICROS_PER_MILLION",
        150_000,
        0,
      ),
      // Knowledge queries run the answer model directly on the Gemini API at
      // its published token rates; grounding chunks bill as input tokens.
      queryInputUsdMicrosPerMillion: integerEnv(
        "CREDITS_KNOWLEDGE_QUERY_INPUT_USD_MICROS_PER_MILLION",
        300_000,
        0,
      ),
      queryOutputUsdMicrosPerMillion: integerEnv(
        "CREDITS_KNOWLEDGE_QUERY_OUTPUT_USD_MICROS_PER_MILLION",
        2_500_000,
        0,
      ),
    },
  };
}

/**
 * Transcription supplier cost for a given audio duration. Whole minutes,
 * rounded up — providers bill partial minutes as full ones.
 */
export function transcriptionCostUsdMicros(durationSeconds: number): number {
  const config = getCreditsConfig();
  if (!Number.isFinite(durationSeconds) || durationSeconds <= 0) return 0;
  const minutes = Math.ceil(durationSeconds / 60);
  return minutes * config.externalToolUsdMicros.transcriptionPerMinute;
}

/** Rate card for the Knowledge query model (Gemini API direct, not OpenRouter). */
export function getKnowledgeQueryRate(): ModelRate {
  const config = getCreditsConfig();
  return {
    provider: "google",
    model: process.env.KNOWLEDGE_QUERY_MODEL?.trim() || "gemini-2.5-flash",
    // File Search grounding reports no cache breakdown of its own, so cached
    // and uncached input both bill at the published input rate.
    inputUsdMicrosPerMillion: BigInt(config.knowledge.queryInputUsdMicrosPerMillion),
    cacheReadUsdMicrosPerMillion: BigInt(config.knowledge.queryInputUsdMicrosPerMillion),
    cacheWriteUsdMicrosPerMillion: BigInt(config.knowledge.queryInputUsdMicrosPerMillion),
    outputUsdMicrosPerMillion: BigInt(config.knowledge.queryOutputUsdMicrosPerMillion),
    pricingVersion: config.pricingVersion,
  };
}

// Document containers whose extracted text is a fraction of their binary size.
const DOCUMENT_MIME_PREFIXES = [
  "application/pdf",
  "application/msword",
  "application/rtf",
  "application/vnd.oasis.opendocument",
  "application/vnd.openxmlformats-officedocument",
  "application/vnd.ms-excel",
  "application/vnd.ms-powerpoint",
  "application/x-hwp",
  "application/vnd.jupyter",
  "application/zip",
];

// Roughly 4 bytes of plain text or code per token.
const TEXT_BYTES_PER_TOKEN = 4;
// PDF/Office binaries carry layout and media alongside the words.
const DOCUMENT_BYTES_PER_TOKEN = 8;
// Multimodal embeddings compress images to a small, roughly fixed token
// footprint that barely scales with file size.
const IMAGE_INDEXING_TOKENS = 1_024;

/**
 * One-time Gemini File Search indexing cost for a document, estimated from its
 * size and kind (Google bills $0.15 per 1M indexed tokens and reports no token
 * count of its own on the upload operation).
 */
export function knowledgeIndexingCostUsdMicros(sizeBytes: number, mimeType?: string): number {
  if (!Number.isFinite(sizeBytes) || sizeBytes <= 0) return 0;
  const config = getCreditsConfig();
  const rate = config.knowledge.indexingUsdMicrosPerMillion;
  if (rate <= 0) return 0;

  let estimatedTokens: number;
  if (mimeType?.startsWith("image/")) {
    estimatedTokens = IMAGE_INDEXING_TOKENS;
  } else if (mimeType && DOCUMENT_MIME_PREFIXES.some((prefix) => mimeType.startsWith(prefix))) {
    estimatedTokens = Math.ceil(sizeBytes / DOCUMENT_BYTES_PER_TOKEN);
  } else {
    estimatedTokens = Math.ceil(sizeBytes / TEXT_BYTES_PER_TOKEN);
  }
  // Ceil per whole millionth: a token fraction of the rate must not round to
  // zero and give indexing away free.
  return Math.ceil((estimatedTokens * rate) / 1_000_000);
}

export function getModelRate(role: ModelRole, modelOverride?: string): ModelRate {
  const prefix = `CREDITS_${role.toUpperCase()}`;
  const model =
    modelOverride ||
    (role === "main"
      ? process.env.OPENROUTER_MODEL_ID
      : role === "lite"
        ? process.env.OPENROUTER_MODEL_ID_LITE
        : process.env.OPENROUTER_VISION_MODEL_ID ?? process.env.OPENROUTER_MODEL_ID) ||
    "unknown";

  return {
    provider: "openrouter",
    model,
    inputUsdMicrosPerMillion: BigInt(integerEnv(`${prefix}_INPUT_USD_MICROS_PER_MILLION`, role === "main" ? 200_000 : role === "lite" ? 100_000 : 300_000)),
    cacheReadUsdMicrosPerMillion: BigInt(integerEnv(`${prefix}_CACHE_READ_USD_MICROS_PER_MILLION`, role === "main" ? 200_000 : role === "lite" ? 100_000 : 300_000)),
    cacheWriteUsdMicrosPerMillion: BigInt(integerEnv(`${prefix}_CACHE_WRITE_USD_MICROS_PER_MILLION`, role === "main" ? 200_000 : role === "lite" ? 100_000 : 300_000)),
    outputUsdMicrosPerMillion: BigInt(integerEnv(`${prefix}_OUTPUT_USD_MICROS_PER_MILLION`, role === "main" ? 1_200_000 : role === "lite" ? 400_000 : 2_500_000)),
    pricingVersion: getCreditsConfig().pricingVersion,
  };
}
