export const executionClasses = ["economy", "standard", "deep"] as const;

export type ExecutionClass = (typeof executionClasses)[number];
export type CreditWarningLevel = "normal" | "notice" | "warning" | "urgent" | "blocked" | "empty";
export type CreditUsageCategory = "model" | "compute" | "search" | "knowledge" | "transcription" | "vision" | "other";

export interface CreditWarningActionCounts {
  notice: number;
  warning: number;
  urgent: number;
}

export interface CreditSummary {
  enabled: boolean;
  balance: number;
  /** Included credits: plan allowance, re-floored monthly (floor top-up). */
  includedBalance: number;
  /** Purchased credits: never expire, untouched by the monthly floor. */
  topupBalance: number;
  reserved: number;
  spendable: number;
  totalGranted: number;
  totalUsed: number;
  currentAllowance: number;
  remainingPercentage: number;
  estimatedActionsRemaining: number;
  warningLevel: CreditWarningLevel;
}

export interface CreditUsageItem {
  id: string;
  credits: number;
  category: CreditUsageCategory;
  reason: string | null;
  sessionId: string | null;
  projectName: string | null;
  conversationName: string | null;
  createdAt: string;
  /** Present on credit grants so activity feeds can render increases. */
  grant?: CreditGrantKind;
  /** "byok" on zero-cost rows for work that ran on the user's own key. */
  modelSource?: string;
}

/** Kinds of credit grants surfaced in activity feeds. */
export type CreditGrantKind = "topup" | "plan_allowance" | "signup_bonus" | "other";

export interface TokenUsageInput {
  inputTokens?: number;
  outputTokens?: number;
  cacheReadTokens?: number;
  cacheWriteTokens?: number;
  reasoningTokens?: number;
}

export interface CostDetails extends TokenUsageInput {
  provider: string;
  model: string;
  pricingVersion: string;
  uncachedInputTokens: number;
  expectedProviderCostUsdMicros: number;
  reportedProviderCostUsdMicros?: number;
  externalToolCostUsdMicros: number;
  computeCostUsdMicros?: number;
  bufferBasisPoints: number;
  chargedCredits: number;
  executionClass: ExecutionClass;
  category: CreditUsageCategory;
  toolName?: string;
  billingUnit?: "call" | "url";
  billingQuantity?: number;
  creditsPerUnit?: number;
  activeMilliseconds?: number;
  memoryMb?: number;
  usdMicrosPerGbHour?: number;
  /** "byok" on zero-cost rows for model work that ran on the user's own key. */
  modelSource?: string;
}
