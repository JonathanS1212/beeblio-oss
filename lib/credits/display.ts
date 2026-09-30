import type { CreditSummary } from "./types";

/**
 * Display layer for the relative usage model. The meter is anchored to the
 * plan allowance (never above 100%) and purchased usage lives in a separate
 * buffer that only draws after the allowance is spent — usage debits the
 * included bucket first (drizzle/0007 record_*_credit_usage). Compact surfaces
 * lead with the exact spendable total; the percentage is reserved for the
 * plan allowance so purchased credits never disappear behind a partial meter.
 */

export type UsagePhase =
  | "plan" // drawing down the monthly or sign-up allowance
  | "buffer" // allowance exhausted, running on purchased/extra usage
  | "overdraw" // last task exceeded everything; new requests paused
  | "empty"; // nothing left, nothing owed

export interface UsageDisplay {
  phase: UsagePhase;
  loading: boolean;
  /** Credits that can fund a new reservation right now, across all buckets. */
  totalAvailableCredits: number;
  /** Remaining plan allowance as 0-100; purchased usage never exceeds 100. */
  meterPercent: number;
  /** Remaining credits in the plan-allowance bucket. */
  planRemainingCredits: number;
  /** Credits beyond this period's allowance: top-ups plus downgrade residue. */
  bufferCredits: number;
  /** ≈ requests left at the default reservation (spendable-based). */
  requestsRemaining: number;
  /** ≈ requests the extra buffer alone could fund. */
  bufferRequests: number;
  /** Plan meter still has room while a buffer exists ("banked" state). */
  hasBuffer: boolean;
  /** Compact label for pills and chips. */
  shortLabel: string;
}

/** Used only when the summary is unavailable to derive a request estimate. */
const FALLBACK_RESERVATION = 75;

export function usageDisplay(summary?: CreditSummary): UsageDisplay {
  if (!summary) {
    return {
      phase: "plan",
      loading: true,
      totalAvailableCredits: 0,
      meterPercent: 0,
      planRemainingCredits: 0,
      bufferCredits: 0,
      requestsRemaining: 0,
      bufferRequests: 0,
      hasBuffer: false,
      shortLabel: "…",
    };
  }

  const allowance = Math.max(0, summary.currentAllowance);
  const totalAvailableCredits = Math.max(0, summary.spendable);
  // includedBalance above the allowance is downgrade residue — the monthly
  // floor only raises, never lowers — so it behaves like a buffer.
  const planRemaining = Math.min(Math.max(0, summary.includedBalance), allowance);
  const downgradeExcess = Math.max(0, summary.includedBalance - allowance);
  const bufferCredits = Math.max(0, summary.topupBalance) + downgradeExcess;
  const meterPercent =
    allowance > 0
      ? Math.round((planRemaining / allowance) * 100)
      : summary.balance > 0
        ? 100
        : 0;

  const bufferRequests = estimateRequests(bufferCredits, summary);

  const phase: UsagePhase =
    summary.balance < 0
      ? "overdraw"
      : planRemaining > 0
        ? "plan"
        : bufferCredits > 0
          ? "buffer"
          : "empty";

  const shortLabel = `${formatCompactCredits(totalAvailableCredits)} credits`;

  return {
    phase,
    loading: false,
    totalAvailableCredits,
    meterPercent,
    planRemainingCredits: planRemaining,
    bufferCredits,
    requestsRemaining: summary.enabled ? summary.estimatedActionsRemaining : 0,
    bufferRequests,
    hasBuffer: phase === "plan" && bufferCredits > 0,
    shortLabel,
  };
}

/** Compact, locale-stable credit count for pills and narrow navigation rails. */
export function formatCompactCredits(credits: number): string {
  const value = Math.max(0, Math.trunc(credits));
  if (value < 1_000) return value.toLocaleString("en-US");
  if (value < 1_000_000) return `${compactNumber(value / 1_000)}k`;
  return `${compactNumber(value / 1_000_000)}m`;
}

function compactNumber(value: number): string {
  return (Math.round(value * 10) / 10).toLocaleString("en-US", {
    maximumFractionDigits: 1,
  });
}

/** When the plan's allowance resets. Paid plans re-floor at each UTC month start. */
export function allowanceRefreshLabel(monthly: boolean, now: Date = new Date()): string {
  if (!monthly) return "One-time sign-up usage";
  const next = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));
  const label = new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  }).format(next);
  return `Refreshes ${label}`;
}

function estimateRequests(bufferCredits: number, summary: CreditSummary): number {
  if (bufferCredits <= 0) return 0;
  // Reuse the summary's own spendable→requests ratio when one exists so the
  // buffer estimate tracks the configured reservation amount.
  if (summary.spendable > 0 && summary.estimatedActionsRemaining > 0) {
    return Math.max(
      1,
      Math.round((bufferCredits / summary.spendable) * summary.estimatedActionsRemaining),
    );
  }
  return Math.floor(bufferCredits / FALLBACK_RESERVATION);
}
