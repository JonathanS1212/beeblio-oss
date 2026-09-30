import { createOpenRouter } from "@openrouter/ai-sdk-provider";
import { defineAgent, defineDynamic } from "eve";
import { timedModelFetch, turnModelDeadline } from "./lib/model-timeout";

// Direct (non-gateway) models have no AI Gateway context-window metadata, so
// eve cannot infer the window for compaction. Supply it explicitly per model.
// gemini-2.5-flash has a 1,048,576-token context window.
const FALLBACK_MODEL_ID = process.env.OPENROUTER_MODEL_ID!;
const FALLBACK_MODEL_CONTEXT_WINDOW_TOKENS = 1_048_576;

export default defineAgent({
  // A dynamic model has no compiled fallback in current eve: the resolver must
  // return a concrete model for every step, so non-BYOK turns resolve to the
  // system OpenRouter model here.
  model: defineDynamic({
    events: {
      "step.started": async (_event, ctx) => {
        const auth = ctx.session.auth.current;
        const deadline = turnModelDeadline(auth?.attributes.turnModelDeadlineAt);
        const fetch = timedModelFetch(deadline);
        const openrouter = createOpenRouter({ apiKey: process.env.OPENROUTER_API_KEY, fetch });
        return { model: openrouter(FALLBACK_MODEL_ID), modelContextWindowTokens: FALLBACK_MODEL_CONTEXT_WINDOW_TOKENS };
      },
    },
  }),
  reasoning: "medium",
  limits: {
    // Input consumption re-bills the full context every model call, so it grows
    // far faster than context size; 5M keeps the continuation prompt out of
    // legitimate long runs while still stopping defective ones. Output must be
    // sized alongside it: approving either window resets both, so a tight
    // output cap resurfaces the dialog once input approvals become rare.
    maxInputTokensPerSession: 5_000_000,
    maxOutputTokensPerSession: 200_000,
  },
  build: {
    // Keep the sandbox/storage SDKs external instead of bundling them.
    externalDependencies: ["better-sqlite3", "sharp"],
  },
});
