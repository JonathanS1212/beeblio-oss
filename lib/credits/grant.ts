import { sql } from "drizzle-orm";

import { db } from "@/db";
import { getUserEntitlements } from "@/lib/entitlements/user";
import { getCreditsConfig } from "./catalog";
import { firstRow } from "./db-result";

type GrantRow = {
  included_balance: number;
  topup_balance: number;
  balance: number;
  reserved: number;
  granted: boolean;
};

type AllowanceRow = {
  included_balance: number;
  topup_balance: number;
  balance: number;
  reserved: number;
  granted: boolean;
};

export type CreditBucket = "included" | "topup";

export async function grantCredits(input: {
  userId: string;
  amount: number;
  idempotencyKey: string;
  reason: string;
  source: string;
  bucket?: CreditBucket;
}) {
  if (input.amount <= 0) return;
  return firstRow<GrantRow>(
    await db.execute(sql`
      select * from app.grant_credits(
        ${input.userId},
        ${input.amount},
        ${input.idempotencyKey},
        ${input.reason},
        ${input.source},
        ${input.bucket ?? "included"}
      )
    `),
  );
}

export async function ensureSignupCredits(userId: string) {
  const config = getCreditsConfig();
  if (!config.enabled || config.trialAllowance <= 0) return;
  await grantCredits({
    userId,
    amount: config.trialAllowance,
    idempotencyKey: `signup:${userId}:v1`,
    reason: "signup_bonus",
    source: "app",
  });
}

// ensurePlanCredits costs several serial DB reads (entitlements + allowance
// settle) and sits on the turn-reservation hot path, yet its writes are
// idempotent per (user, plan, period): after one successful check, repeats
// within a short window are pure latency. Memoize per user per process (best
// effort in multi-isolate deployments). The TTL keeps a mid-month plan upgrade
// settling within a minute instead of waiting out the month — top-up purchases
// are unaffected (they go through grantCredits, never this memo).
const PLAN_CREDIT_CHECK_TTL_MS = 60_000;
const planCreditChecks = new Map<string, number>();

/**
 * Lazily grant whatever the user's plan owes them (docs/entitlements-plan.md
 * §7). Free keeps the one-time signup grant; paid plans get a calendar-month
 * floor top-up on the included bucket: included := max(included, allowance),
 * idempotent per (user, plan, period). Called from the same lazy points as the
 * old signup grant — the first credit summary read or turn reservation of a
 * new month settles the allowance; no cron.
 */
export async function ensurePlanCredits(userId: string) {
  const config = getCreditsConfig();
  if (!config.enabled) return;
  const now = Date.now();
  const checkedUntil = planCreditChecks.get(userId);
  if (checkedUntil !== undefined && checkedUntil > now) {
    return;
  }
  const entitlements = await getUserEntitlements(userId);
  if (entitlements.monthlyCredits <= 0) {
    await ensureSignupCredits(userId);
  } else {
    const period = new Date().toISOString().slice(0, 7); // UTC yyyy-MM
    const allowanceKey = entitlements.weeklyAllowanceKey ?? `monthly:${userId}:${entitlements.plan}:${period}`;
    await db.execute(sql`
      select * from app.ensure_monthly_allowance(
        ${userId},
        ${entitlements.monthlyCredits},
        ${allowanceKey},
        'plan_allowance',
        'app'
      )
    `);
  }
  // Only memoize success: a failed check retries on the next call.
  if (planCreditChecks.size > 10_000) planCreditChecks.clear();
  planCreditChecks.set(userId, Date.now() + PLAN_CREDIT_CHECK_TTL_MS);
}

/** Allow a just-settled Mayar purchase to grant its allowance immediately. */
export function invalidatePlanCreditCheck(userId: string) {
  planCreditChecks.delete(userId);
}
