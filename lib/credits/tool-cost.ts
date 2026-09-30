import { calculateChargedCredits, usdToMicros } from "./calculate";
import { getCreditsConfig } from "./catalog";
import type { CostDetails, CreditUsageCategory, ExecutionClass, TokenUsageInput } from "./types";

/** Charge details for a supplier cost that is not a model token bill. */
export function externalToolCostDetails(input: {
  executionClass: ExecutionClass;
  category: CreditUsageCategory;
  toolName: string;
  costUsdMicros: number;
}): { chargedCredits: number; details: CostDetails } | null {
  if (input.costUsdMicros <= 0) return null;
  const config = getCreditsConfig();
  const chargedCredits = calculateChargedCredits(input.costUsdMicros);
  const details: CostDetails = {
    provider: "external-tool",
    model: "none",
    pricingVersion: config.pricingVersion,
    inputTokens: 0,
    outputTokens: 0,
    cacheReadTokens: 0,
    cacheWriteTokens: 0,
    reasoningTokens: 0,
    uncachedInputTokens: 0,
    expectedProviderCostUsdMicros: 0,
    externalToolCostUsdMicros: input.costUsdMicros,
    bufferBasisPoints: config.bufferBasisPoints,
    chargedCredits,
    executionClass: input.executionClass,
    category: input.category,
    toolName: input.toolName,
  };
  return { chargedCredits, details };
}

/**
 * Zero-cost details for model work that ran on the user's own key. Token counts
 * and the provider-reported cost are kept for transparency; nothing is charged.
 */
export function byokModelCostDetails(input: {
  model?: string;
  usage?: TokenUsageInput;
  reportedCostUsd?: number;
  executionClass: ExecutionClass;
}): CostDetails {
  const inputTokens = Math.max(0, Math.trunc(input.usage?.inputTokens ?? 0));
  const outputTokens = Math.max(0, Math.trunc(input.usage?.outputTokens ?? 0));
  return {
    provider: "byok",
    model: input.model?.trim() || "unknown",
    pricingVersion: getCreditsConfig().pricingVersion,
    inputTokens,
    outputTokens,
    cacheReadTokens: 0,
    cacheWriteTokens: 0,
    reasoningTokens: 0,
    uncachedInputTokens: inputTokens,
    expectedProviderCostUsdMicros: 0,
    reportedProviderCostUsdMicros: usdToMicros(input.reportedCostUsd),
    externalToolCostUsdMicros: 0,
    bufferBasisPoints: 0,
    chargedCredits: 0,
    executionClass: input.executionClass,
    category: "model",
    modelSource: "byok",
  };
}
