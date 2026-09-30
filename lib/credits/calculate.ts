import { getCreditsConfig, type ModelRate } from "./catalog.ts";
import type { TokenUsageInput } from "./types.ts";

const TOKENS_PER_MILLION = BigInt(1_000_000);
const BASIS_POINTS = BigInt(10_000);

function nonNegativeInteger(value: number | undefined) {
  if (value === undefined || !Number.isFinite(value)) return 0;
  return Math.max(0, Math.trunc(value));
}

function ceilDivide(numerator: bigint, denominator: bigint) {
  if (numerator === BigInt(0)) return BigInt(0);
  return (numerator + denominator - BigInt(1)) / denominator;
}

export function usdToMicros(usd: number | undefined) {
  if (usd === undefined || !Number.isFinite(usd) || usd <= 0) return undefined;
  return Math.ceil(usd * 1_000_000);
}

export function calculateModelCost(rate: ModelRate, usage: TokenUsageInput) {
  const inputTokens = nonNegativeInteger(usage.inputTokens);
  const outputTokens = nonNegativeInteger(usage.outputTokens);
  const cacheReadTokens = Math.min(inputTokens, nonNegativeInteger(usage.cacheReadTokens));
  const cacheWriteTokens = Math.min(
    inputTokens - cacheReadTokens,
    nonNegativeInteger(usage.cacheWriteTokens),
  );
  const uncachedInputTokens = Math.max(
    0,
    inputTokens - cacheReadTokens - cacheWriteTokens,
  );

  const expectedProviderCostUsdMicros =
    ceilDivide(BigInt(uncachedInputTokens) * rate.inputUsdMicrosPerMillion, TOKENS_PER_MILLION) +
    ceilDivide(BigInt(cacheReadTokens) * rate.cacheReadUsdMicrosPerMillion, TOKENS_PER_MILLION) +
    ceilDivide(BigInt(cacheWriteTokens) * rate.cacheWriteUsdMicrosPerMillion, TOKENS_PER_MILLION) +
    ceilDivide(BigInt(outputTokens) * rate.outputUsdMicrosPerMillion, TOKENS_PER_MILLION);

  return {
    inputTokens,
    outputTokens,
    cacheReadTokens,
    cacheWriteTokens,
    reasoningTokens: nonNegativeInteger(usage.reasoningTokens),
    uncachedInputTokens,
    expectedProviderCostUsdMicros: Number(expectedProviderCostUsdMicros),
  };
}

export function calculateChargedCredits(rawCostUsdMicros: number) {
  const config = getCreditsConfig();
  const cost = BigInt(Math.max(0, Math.trunc(rawCostUsdMicros)));
  const charged = ceilDivide(
    cost * BigInt(config.bufferBasisPoints),
    BASIS_POINTS * BigInt(config.usdMicrosPerCredit),
  );
  return Math.max(1, Number(charged));
}

/** Price per-second sandbox GB allocation in integer USD microdollars. */
export function calculateSandboxComputeCostUsdMicros(
  events: readonly { activeMilliseconds: number; memoryMb: number }[],
  usdMicrosPerGbHour: number,
) {
  const weightedMbMilliseconds = events.reduce((total, event) => {
    const billedMilliseconds = Math.ceil(Math.max(0, event.activeMilliseconds) / 1_000) * 1_000;
    const memoryMb = Math.max(0, Math.ceil(event.memoryMb));
    return total + BigInt(billedMilliseconds) * BigInt(memoryMb);
  }, BigInt(0));
  if (weightedMbMilliseconds === BigInt(0)) return 0;

  const numerator = weightedMbMilliseconds * BigInt(usdMicrosPerGbHour);
  const denominator = BigInt(3_600_000 * 1_024);
  return Number((numerator + denominator - BigInt(1)) / denominator);
}
