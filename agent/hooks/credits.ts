import { defineHook, type HookContext } from "eve/hooks";

import {
  attachReservation,
  byokModelCostDetails,
  finishReservation,
  recordFreeUsage,
} from "../../lib/credits/index";
import {
  getReservationContext,
  meterReservedUsage,
  modelCostDetails,
  normalizeAiSdkUsage,
} from "../lib/credit-meter";

async function safely(label: string, operation: () => Promise<void>) {
  try {
    await operation();
  } catch (error) {
    console.error(`Credit bookkeeping failed during ${label}:`, error);
  }
}

async function finish(
  ctx: HookContext,
  outcome: "completed" | "failed" | "cancelled",
) {
  const credit = getReservationContext(ctx);
  if (!credit) return;
  await finishReservation(credit.reservationId, outcome);
}

export default defineHook({
  events: {
    async "turn.started"(_event, ctx) {
      await safely("reservation attribution", async () => {
        const credit = getReservationContext(ctx);
        if (!credit) return;
        await attachReservation(
          credit.reservationId,
          credit.sessionId,
          credit.turnId,
        );
      });
    },
    async "step.completed"(event, ctx) {
      await safely("model usage", async () => {
        const credit = getReservationContext(ctx);
        if (!credit) return;
        // The customer pays OpenRouter directly on BYOK turns. Record the work
        // as a zero-cost row so it still shows up in activity feeds; their
        // shared reservation still pays for Blaxel and Beeblio-funded tools.
        if (credit.modelSource === "byok") {
          await recordFreeUsage({
            userId: credit.userId,
            reservationId: credit.reservationId,
            idempotencyKey: `step:${credit.sessionId}:${event.data.turnId}:${event.data.stepIndex}`,
            reason: "turn:model",
            source: "agent",
            sessionId: credit.sessionId,
            turnId: credit.turnId,
            details: byokModelCostDetails({
              model: credit.modelId,
              usage: normalizeAiSdkUsage(event.data.usage ?? {}),
              reportedCostUsd: event.data.usage?.costUsd,
              executionClass: credit.executionClass,
            }),
          });
          return;
        }
        const charge = modelCostDetails({
          role: "main",
          usage: event.data.usage ?? {},
          executionClass: credit.executionClass,
          category: "model",
          reportedCostUsd: event.data.usage?.costUsd,
        });
        await meterReservedUsage({
          ctx,
          idempotencyKey: `step:${credit.sessionId}:${event.data.turnId}:${event.data.stepIndex}`,
          reason: "turn:model",
          chargedCredits: charge.chargedCredits,
          details: charge.details,
        });
      });
    },
    // Tool-level costs (transcription, vision) are metered inside the tools
    // themselves via agent/lib/credit-meter.ts — see transcribe_audio.ts and
    // analyze_image.ts for the pattern.
    async "turn.completed"(_event, ctx) {
      await safely("turn completion", () => finish(ctx, "completed"));
    },
    async "turn.failed"(_event, ctx) {
      await safely("turn failure", () => finish(ctx, "failed"));
    },
    async "turn.cancelled"(_event, ctx) {
      await safely("turn cancellation", () => finish(ctx, "cancelled"));
    },
    async "session.failed"(_event, ctx) {
      await safely("session failure", () => finish(ctx, "failed"));
    },
  },
});
