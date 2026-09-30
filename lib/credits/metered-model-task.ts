import { randomUUID } from "node:crypto";

import type { ModelRate, ModelRole } from "./catalog";
import { calculateChargedCredits, calculateModelCost, usdToMicros } from "./calculate";
import { getCreditsConfig, getModelRate } from "./catalog";
import { finishReservation, reserveCredits } from "./reserve";
import { recordFreeUsage, recordReservedUsage } from "./settle";
import { byokModelCostDetails } from "./tool-cost";
import type { CreditUsageCategory, ExecutionClass, TokenUsageInput } from "./types";

type AiSdkUsage = {
  inputTokens?: number;
  outputTokens?: number;
  inputTokenDetails?: { cacheReadTokens?: number; cacheWriteTokens?: number };
  outputTokenDetails?: { reasoningTokens?: number };
};

/** Meter a model call that runs outside an eve agent turn. */
export async function runMeteredModelTask<T>(input: {
  userId: string;
  reason: string;
  role?: ModelRole;
  model?: string;
  /** Explicit rate card; skips the OpenRouter role lookup for direct provider calls. */
  rate?: ModelRate;
  executionClass?: ExecutionClass;
  category?: CreditUsageCategory;
  run: () => Promise<{ value: T; usage?: AiSdkUsage; reportedCostUsd?: number }>;
}): Promise<T> {
  const config = getCreditsConfig();
  const executionClass = input.executionClass ?? config.defaultExecutionClass;
  const requestId = randomUUID();
  const reservation = await reserveCredits({ userId: input.userId, requestId, executionClass });

  try {
    const result = await input.run();
    if (reservation) {
      // A run that made no billable call (short-circuited before reaching the
      // provider) settles its reservation without the 1-credit minimum charge.
      if (result.usage === undefined && result.reportedCostUsd === undefined) {
        await finishReservation(reservation.id, "completed");
        return result.value;
      }
      const usage = normalizeAiSdkUsage(result.usage ?? {});
      const rate = input.rate ?? getModelRate(input.role ?? "main", input.model);
      const normalized = calculateModelCost(rate, usage);
      const chargedCredits = calculateChargedCredits(normalized.expectedProviderCostUsdMicros);
      const category = input.category ?? "model";
      await recordReservedUsage({
        reservationId: reservation.id,
        idempotencyKey: `task:${input.reason}:${requestId}`,
        credits: chargedCredits,
        reason: input.reason,
        source: "app",
        sessionId: `task:${requestId}`,
        turnId: requestId,
        details: {
          provider: rate.provider,
          model: rate.model,
          pricingVersion: rate.pricingVersion,
          ...normalized,
          reportedProviderCostUsdMicros: usdToMicros(result.reportedCostUsd),
          externalToolCostUsdMicros: 0,
          bufferBasisPoints: config.bufferBasisPoints,
          chargedCredits,
          executionClass,
          category,
        },
      });
      await finishReservation(reservation.id, "completed");
    }
    return result.value;
  } catch (error) {
    if (reservation) await finishReservation(reservation.id, "failed").catch(() => undefined);
    throw error;
  }
}

/**
 * Record a zero-cost BYOK model task so it appears in activity feeds. This
 * existing path attempts a reservation, but BYOK work must never be gated on
 * Beeblio credits — when none can be made, the row is skipped.
 */
export async function recordByokModelTask(input: {
  userId: string;
  reason: string;
  model?: string;
  usage?: AiSdkUsage;
  reportedCostUsd?: number;
}): Promise<void> {
  if (!getCreditsConfig().enabled) return;
  const requestId = randomUUID();
  let reservation;
  try {
    reservation = await reserveCredits({ userId: input.userId, requestId, executionClass: "economy" });
  } catch {
    return; // e.g. InsufficientCreditsError: BYOK still runs, just unrecorded.
  }
  if (!reservation) return;
  try {
    await recordFreeUsage({
      userId: input.userId,
      reservationId: reservation.id,
      idempotencyKey: `task:${input.reason}:${requestId}`,
      reason: input.reason,
      source: "app",
      sessionId: `task:${requestId}`,
      turnId: requestId,
      details: byokModelCostDetails({
        model: input.model,
        usage: normalizeAiSdkUsage(input.usage ?? {}),
        reportedCostUsd: input.reportedCostUsd,
        executionClass: "economy",
      }),
    });
  } finally {
    await finishReservation(reservation.id, "completed").catch(() => undefined);
  }
}

/** Record an included paid-plan model call without requiring spendable credits. */
export async function recordIncludedModelTask(input: {
  userId: string;
  reason: string;
  model?: string;
  usage?: AiSdkUsage;
  reportedCostUsd?: number;
}): Promise<void> {
  if (!getCreditsConfig().enabled) return;
  const requestId = randomUUID();
  const rate = getModelRate("lite", input.model);
  const normalized = calculateModelCost(rate, normalizeAiSdkUsage(input.usage ?? {}));
  await recordFreeUsage({
    userId: input.userId,
    idempotencyKey: `task:${input.reason}:${requestId}`,
    reason: input.reason,
    source: "app",
    sessionId: `task:${requestId}`,
    turnId: requestId,
    details: {
      provider: rate.provider,
      model: rate.model,
      pricingVersion: rate.pricingVersion,
      ...normalized,
      reportedProviderCostUsdMicros: usdToMicros(input.reportedCostUsd),
      externalToolCostUsdMicros: 0,
      bufferBasisPoints: 0,
      chargedCredits: 0,
      executionClass: "economy",
      category: "model",
      modelSource: "plan",
    },
  });
}

function normalizeAiSdkUsage(usage: AiSdkUsage): TokenUsageInput {
  return {
    inputTokens: usage.inputTokens,
    outputTokens: usage.outputTokens,
    cacheReadTokens: usage.inputTokenDetails?.cacheReadTokens,
    cacheWriteTokens: usage.inputTokenDetails?.cacheWriteTokens,
    reasoningTokens: usage.outputTokenDetails?.reasoningTokens,
  };
}
