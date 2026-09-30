export const RECOMMENDED_OPENROUTER_MODELS = [
  ["openai/gpt-5.6-sol", "GPT-5.6 Sol"],
  ["anthropic/claude-opus-5", "Claude Opus 5"],
  ["google/gemini-3.8-flash", "Gemini 3.8 Flash"],
  ["x-ai/grok-4.6", "Grok 4.6"],
] as const;

export type ConversationModelSource = "system" | "byok";

export type OpenRouterPreference = {
  enabled: boolean;
  modelId: string;
  contextLength: number;
};

export const DEFAULT_OPENROUTER_PREFERENCE: OpenRouterPreference = {
  enabled: false,
  modelId: RECOMMENDED_OPENROUTER_MODELS[0][0],
  contextLength: 128_000,
};
