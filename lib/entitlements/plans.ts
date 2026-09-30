import { integerEnv } from "@/lib/env-config";

/**
 * Plan catalog for user entitlements (docs/entitlements-plan.md).
 *
 * A tier is exactly two numbers: a monthly credit budget and a storage quota.
 * There are no per-tier feature flags — expensive capabilities are priced in
 * credits (per-minute transcription, per-step model metering). This module is
 * deliberately dependency-free (env parsing only) so the Next.js app imports it
 * via `@/lib/entitlements/plans` and the eve agent via a relative path.
 */
export type PlanKey = "free" | "plus" | "pro";

export const planKeys: readonly PlanKey[] = ["free", "plus", "pro"] as const;

export function parsePlanKey(value: unknown): PlanKey | null {
  return value === "free" || value === "plus" || value === "pro" ? value : null;
}

/** Editor AI generations are included without credit charges on paid plans. */
export function hasUnlimitedEditorAi(plan: PlanKey): boolean {
  return plan === "plus" || plan === "pro";
}

export type PlanEntitlements = {
  /** Monthly included-credit allowance granted by calendar-month floor top-up. 0 for free. */
  monthlyCredits: number;
  /** Storage quota in bytes across all of the user's projects and skills. */
  storageBytes: number;
};

export const FREE_PLAN: PlanEntitlements = {
  monthlyCredits: 0,
  storageBytes: integerEnv("PLAN_FREE_STORAGE_BYTES", 250 * 1024 * 1024),
};

export const PLUS_PLAN: PlanEntitlements = {
  monthlyCredits: integerEnv("PLAN_PLUS_MONTHLY_CREDITS", 4_000),
  storageBytes: integerEnv("PLAN_PLUS_STORAGE_BYTES", 5 * 1024 * 1024 * 1024),
};

export const PRO_PLAN: PlanEntitlements = {
  monthlyCredits: integerEnv("PLAN_PRO_MONTHLY_CREDITS", 12_000),
  storageBytes: integerEnv("PLAN_PRO_STORAGE_BYTES", 25 * 1024 * 1024 * 1024),
};

/**
 * Storage quota for admins, or null for unlimited. Applies regardless of plan.
 */
export function adminStorageQuotaBytes(): number | null {
  const raw = process.env.PLAN_ADMIN_STORAGE_BYTES?.trim();
  if (!raw || raw.toLowerCase() === "unlimited") return null;
  const value = Number(raw);
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new Error("PLAN_ADMIN_STORAGE_BYTES must be a non-negative integer or 'unlimited'.");
  }
  return value;
}

export function getPlanEntitlements(plan: PlanKey): PlanEntitlements {
  switch (plan) {
    case "plus":
      return PLUS_PLAN;
    case "pro":
      return PRO_PLAN;
    default:
      return FREE_PLAN;
  }
}
