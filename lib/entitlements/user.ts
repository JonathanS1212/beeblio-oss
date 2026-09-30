import { eq } from "drizzle-orm";

import { db } from "@/db";
import { userPlans, userRoles } from "@/db/schema";
import {
  getActiveStorageAddonBytes,
  getEffectivePlan,
} from "@/lib/billing/subscriptions";
import {
  adminStorageQuotaBytes,
  getPlanEntitlements,
  parsePlanKey,
  type PlanKey,
} from "./plans";

/**
 * DB-backed entitlement lookups shared by the Next.js app and the eve agent
 * (the agent imports this via a relative path, same as lib/credits). No row in
 * app.user_plans means the free plan, so existing users need no backfill.
 */

export type UserEntitlements = {
  userId: string;
  plan: PlanKey;
  isAdmin: boolean;
  monthlyCredits: number;
  /** Stable paid-period key for a shared weekly subscription; null for monthly plans. */
  weeklyAllowanceKey: string | null;
  /** Storage quota in bytes, or null for unlimited (admins). */
  storageQuotaBytes: number | null;
};

const adminUserIds = new Set(
  (process.env.ADMIN_USER_IDS ?? "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean),
);

/**
 * Env-configured bootstrap admin ids (ADMIN_USER_IDS). Admin display queries
 * use this so the UI's admin flags match what isUserAdmin authorizes.
 */
export function getEnvAdminUserIds(): string[] {
  return [...adminUserIds];
}

export async function getUserPlan(userId: string): Promise<PlanKey> {
  try {
    const subscription = await getEffectivePlan(userId);
    if (subscription) return subscription.planKey;

    const row = await db.query.userPlans.findFirst({
      where: eq(userPlans.userId, userId),
    });
    const plan = parsePlanKey(row?.plan) ?? "free";
    if (plan !== "free" && row?.updatedBy === "billing") {
      await db
        .update(userPlans)
        .set({ plan: "free", status: "lapsed", updatedBy: "billing", updatedAt: new Date() })
        .where(eq(userPlans.userId, userId));
      return "free";
    }
    return plan;
  } catch (error) {
    console.error("[entitlements] user plan lookup failed, defaulting to free", error);
    return "free";
  }
}

export async function isUserAdmin(userId: string): Promise<boolean> {
  if (adminUserIds.has(userId)) return true;
  try {
    const row = await db.query.userRoles.findFirst({
      where: eq(userRoles.userId, userId),
    });
    return row?.role === "admin";
  } catch (error) {
    console.error("[entitlements] admin role lookup failed", error);
    return false;
  }
}

export async function getUserEntitlements(userId: string): Promise<UserEntitlements> {
  const [plan, isAdmin, addonBytes, subscription] = await Promise.all([
    getUserPlan(userId),
    isUserAdmin(userId),
    getActiveStorageAddonBytes(userId).catch(() => 0),
    getEffectivePlan(userId),
  ]);
  const entitlements = getPlanEntitlements(plan);
  if (subscription?.billingInterval === "week" && (!Number.isSafeInteger(subscription.includedCredits) || (subscription.includedCredits ?? 0) <= 0)) {
    throw new Error("Weekly subscription is missing its included-credit allowance");
  }
  return {
    userId,
    plan,
    isAdmin,
    monthlyCredits: subscription?.billingInterval === "week" && subscription.planKey === plan
      ? subscription.includedCredits!
      : entitlements.monthlyCredits,
    weeklyAllowanceKey: subscription?.billingInterval === "week" && subscription.planKey === plan
      ? `weekly:${userId}:${subscription.providerSubscriptionId}`
      : null,
    storageQuotaBytes: isAdmin
      ? adminStorageQuotaBytes()
      : entitlements.storageBytes + addonBytes,
  };
}
