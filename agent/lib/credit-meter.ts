import {
  calculateChargedCredits,
  calculateModelCost,
  externalToolCostDetails,
  getCreditsConfig,
  getModelRate,
  recordFreeUsage,
  recordReservedUsage,
  usdToMicros,
  type CostDetails,
  type CreditUsageCategory,
  type ExecutionClass,
  type ModelRate,
  type ModelRole,
  type TokenUsageInput,
} from "../../lib/credits/index";

export { externalToolCostDetails };

type CreditSessionContext = {
  session: {
    id: string;
    turn: { id: string };
    auth: {
      current: { principalId: string; attributes: Readonly<Record<string, string | readonly string[]>> } | null;
    };
  };
};

export function getReservationContext(ctx: CreditSessionContext) {
  const auth = ctx.session.auth.current;
  const reservationId = attribute(auth?.attributes, "creditReservationId");
  if (!auth || !reservationId) return null;
  const rawClass = attribute(auth.attributes, "creditExecutionClass");
  const executionClass: ExecutionClass = rawClass === "economy" || rawClass === "deep"
    ? rawClass
    : "standard";
  return {
    userId: auth.principalId,
    reservationId,
    executionClass,
    sessionId: ctx.session.id,
    turnId: ctx.session.turn.id,
    modelSource: attribute(auth.attributes, "modelSource"),
    modelId: attribute(auth.attributes, "modelId"),
  };
}

export function modelCostDetails(input: {
  role?: ModelRole;
  usage: TokenUsageInput;
  executionClass: ExecutionClass;
  category: CreditUsageCategory;
  reportedCostUsd?: number;
  toolName?: string;
  modelOverride?: string;
  /** Explicit rate card; skips the OpenRouter role lookup for direct provider calls. */
  rate?: ModelRate;
}) {
  const rate = input.rate ?? getModelRate(input.role ?? "main", input.modelOverride);
  const normalized = calculateModelCost(rate, input.usage);
  const reportedProviderCostUsdMicros = usdToMicros(input.reportedCostUsd);
  const rawCostUsdMicros = normalized.expectedProviderCostUsdMicros;
  const chargedCredits = calculateChargedCredits(rawCostUsdMicros);
  const config = getCreditsConfig();
  const details: CostDetails = {
    provider: rate.provider,
    model: rate.model,
    pricingVersion: rate.pricingVersion,
    ...normalized,
    reportedProviderCostUsdMicros,
    externalToolCostUsdMicros: 0,
    bufferBasisPoints: config.bufferBasisPoints,
    chargedCredits,
    executionClass: input.executionClass,
    category: input.category,
    toolName: input.toolName,
  };
  return { chargedCredits, details };
}

export function configuredToolCreditDetails(input: {
  executionClass: ExecutionClass;
  category: CreditUsageCategory;
  toolName: string;
  creditsPerUnit: number;
  quantity: number;
  billingUnit: "call" | "url";
}) {
  const creditsPerUnit = Math.max(0, Math.trunc(input.creditsPerUnit));
  const billingQuantity = Math.max(0, Math.trunc(input.quantity));
  const chargedCredits = creditsPerUnit * billingQuantity;

  const config = getCreditsConfig();
  const details: CostDetails = {
    provider: "configured-tool-rate",
    model: "none",
    pricingVersion: config.pricingVersion,
    inputTokens: 0,
    outputTokens: 0,
    cacheReadTokens: 0,
    cacheWriteTokens: 0,
    reasoningTokens: 0,
    uncachedInputTokens: 0,
    expectedProviderCostUsdMicros: 0,
    externalToolCostUsdMicros: 0,
    bufferBasisPoints: 10_000,
    chargedCredits,
    executionClass: input.executionClass,
    category: input.category,
    toolName: input.toolName,
    billingUnit: input.billingUnit,
    billingQuantity,
    creditsPerUnit,
  };
  return { chargedCredits, details };
}

export async function meterConfiguredToolUsage(input: {
  ctx: CreditSessionContext;
  callId?: string;
  idempotencyKey: string;
  reason: string;
  chargedCredits: number;
  details: CostDetails;
}) {
  const context = getReservationContext(input.ctx);
  if (!context || !getCreditsConfig().enabled) return;

  if (input.chargedCredits > 0) {
    await recordReservedUsage({
      reservationId: context.reservationId,
      idempotencyKey: input.idempotencyKey,
      credits: input.chargedCredits,
      reason: input.reason,
      source: "agent",
      sessionId: context.sessionId,
      turnId: context.turnId,
      callId: input.callId,
      details: input.details,
    });
    return;
  }

  await recordFreeUsage({
    userId: context.userId,
    reservationId: context.reservationId,
    idempotencyKey: input.idempotencyKey,
    reason: input.reason,
    source: "agent",
    sessionId: context.sessionId,
    turnId: context.turnId,
    callId: input.callId,
    details: input.details,
  });
}

export async function meterReservedUsage(input: {
  ctx: CreditSessionContext;
  callId?: string;
  idempotencyKey: string;
  reason: string;
  chargedCredits: number;
  details: CostDetails;
}) {
  const context = getReservationContext(input.ctx);
  if (!context || !getCreditsConfig().enabled) return;
  await recordReservedUsage({
    reservationId: context.reservationId,
    idempotencyKey: input.idempotencyKey,
    credits: input.chargedCredits,
    reason: input.reason,
    source: "agent",
    sessionId: context.sessionId,
    turnId: context.turnId,
    callId: input.callId,
    details: input.details,
  });
}

export function normalizeAiSdkUsage(usage: {
  inputTokens?: number;
  outputTokens?: number;
  inputTokenDetails?: {
    cacheReadTokens?: number;
    cacheWriteTokens?: number;
  };
  outputTokenDetails?: { reasoningTokens?: number };
}): TokenUsageInput {
  return {
    inputTokens: usage.inputTokens,
    outputTokens: usage.outputTokens,
    cacheReadTokens: usage.inputTokenDetails?.cacheReadTokens,
    cacheWriteTokens: usage.inputTokenDetails?.cacheWriteTokens,
    reasoningTokens: usage.outputTokenDetails?.reasoningTokens,
  };
}

function attribute(
  attributes: Readonly<Record<string, string | readonly string[]>> | undefined,
  key: string,
) {
  const value = attributes?.[key];
  return typeof value === "string" ? value : value?.[0];
}
