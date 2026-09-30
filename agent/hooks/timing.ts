import { defineHook } from "eve/hooks";

/**
 * First-response diagnostics, server-side. The frontend surfaces the
 * turn.started → first-delta window as "Loading Tools & Context..." /
 * "Thinking...", but that window mixes framework startup (session creation,
 * dynamic resolvers) with model time-to-first-token. These logs split it:
 *
 *   turn→step    how long the durable turn takes to reach its first model call
 *                (session startup + turn.started dispatch work, e.g. the
 *                user-skills resolver)
 *   step→text    how long that model call takes to stream its first visible
 *                output (OpenRouter routing + prefill + reasoning before text)
 *   step→reasoning  same, but for the first reasoning delta, which on thinking
 *                models arrives before any text
 *
 * First step and first delta only — later steps of multi-step turns do not
 * affect perceived first-response latency.
 */

type TurnTiming = {
  turnStartedAt: number;
  stepStartedAt?: number;
  loggedFirstText?: boolean;
  loggedFirstReasoning?: boolean;
};

// Keyed by turnId; every turn settles (completed/failed/cancelled), so entries
// are removed at turn end and the map cannot grow without bound.
const turns = new Map<string, TurnTiming>();

export default defineHook({
  events: {
    "turn.started"(event) {
      turns.set(event.data.turnId, { turnStartedAt: Date.now() });
    },
    "step.started"(event) {
      const turn = turns.get(event.data.turnId);
      if (!turn || turn.stepStartedAt !== undefined) return;
      turn.stepStartedAt = Date.now();
      // console.log("[timing] turn→step", {
      //   sessionId: ctx.session.id,
      //   turnId: event.data.turnId,
      //   ms: turn.stepStartedAt - turn.turnStartedAt,
      // });
    },
    "reasoning.appended"(event) {
      const turn = turns.get(event.data.turnId);
      if (!turn?.stepStartedAt || turn.loggedFirstReasoning) return;
      turn.loggedFirstReasoning = true;
      // console.log("[timing] step→reasoning", {
      //   turnId: event.data.turnId,
      //   stepIndex: event.data.stepIndex,
      //   ms: Date.now() - turn.stepStartedAt,
      // });
    },
    "message.appended"(event) {
      const turn = turns.get(event.data.turnId);
      if (!turn?.stepStartedAt || turn.loggedFirstText) return;
      turn.loggedFirstText = true;
      // console.log("[timing] step→text", {
      //   turnId: event.data.turnId,
      //   stepIndex: event.data.stepIndex,
      //   ms: Date.now() - turn.stepStartedAt,
      // });
    },
    "turn.completed"(event) {
      turns.delete(event.data.turnId);
    },
    "turn.failed"(event) {
      turns.delete(event.data.turnId);
    },
    "turn.cancelled"(event) {
      turns.delete(event.data.turnId);
    },
  },
});
