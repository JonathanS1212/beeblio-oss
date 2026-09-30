import { and, eq, sql } from "drizzle-orm";

import { db } from "@/db";
import { billingAddons, billingSubscriptions, userPlans } from "@/db/schema";
import type { PlanKey } from "@/lib/entitlements/plans";
import { parsePlanKey } from "@/lib/entitlements/plans";

import type { BillingProvider, BillingSummary, PaidPlanKey } from "./types";

const ENTITLED_STATUS_SQL = sql`('on_trial', 'active', 'past_due', 'unpaid', 'paused', 'cancelled')`;

export type SubscriptionRow = {
  provider: BillingProvider;
  providerSubscriptionId: string;
  providerVariantId: string;
  planKey: PaidPlanKey;
  status: string;
  currentPeriodEnd: Date | null;
  cancelAtPeriodEnd: boolean;
  billingInterval: "week" | "month";
  includedCredits: number | null;
};

function rowsOf<T>(result: unknown): T[] {
  if (Array.isArray(result)) return result as T[];
  if (result && typeof result === "object" && "rows" in result) {
    return ((result as { rows?: unknown[] }).rows ?? []) as T[];
  }
  return [];
}

export async function getEffectivePlan(userId: string): Promise<SubscriptionRow | null> {
  const rows = rowsOf<{
    provider: BillingProvider;
    provider_subscription_id: string;
    provider_variant_id: string;
    plan_key: PaidPlanKey;
    status: string;
    current_period_end: string | Date | null;
    cancel_at_period_end: boolean;
    billing_interval: string | null;
    included_credits: number | null;
  }>(
    await db.execute(sql`
      select s.provider, s.provider_subscription_id, s.provider_variant_id, s.plan_key, s.status,
             s.current_period_end, s.cancel_at_period_end,
             coalesce(p.metadata->>'billingInterval', s.metadata->>'billingInterval') as billing_interval,
             coalesce(p.credits, (s.metadata->>'includedCredits')::integer) as included_credits
      from app.billing_subscriptions s
      left join app.credit_products p
        on p.provider = s.provider and p.provider_price_id = s.provider_variant_id
      where s.user_id = ${userId}
        and s.status in ${ENTITLED_STATUS_SQL}
        and (s.status <> 'cancelled' or s.current_period_end is null or s.current_period_end > now())
        and (s.provider <> 'mayar' or s.current_period_end is null or s.current_period_end > now())
      order by case s.plan_key when 'pro' then 2 else 1 end desc,
               s.current_period_end desc nulls first
      limit 1
    `),
  );
  const row = rows[0];
  if (!row) return null;
  const end = row.current_period_end;
  return {
    provider: row.provider,
    providerSubscriptionId: row.provider_subscription_id,
    providerVariantId: row.provider_variant_id,
    planKey: row.plan_key,
    status: row.status,
    currentPeriodEnd: end ? (end instanceof Date ? end : new Date(end)) : null,
    cancelAtPeriodEnd: row.cancel_at_period_end,
    billingInterval: row.billing_interval === "week" ? "week" : "month",
    includedCredits: row.included_credits === null ? null : Number(row.included_credits),
  };
}

export async function getActiveSubscription(userId: string) {
  return getEffectivePlan(userId);
}

export async function getBillingSummary(userId: string): Promise<BillingSummary> {
  const subscription = await getEffectivePlan(userId);
  const plan: PlanKey = subscription?.planKey ?? "free";
  return {
    plan,
    subscriptionProvider: subscription?.provider ?? null,
    subscriptionStatus: subscription?.status ?? null,
    currentPeriodEnd: subscription?.currentPeriodEnd?.toISOString() ?? null,
    cancelAtPeriodEnd: subscription?.cancelAtPeriodEnd ?? false,
  };
}

export async function applyBilledPlan(userId: string, plan: PaidPlanKey) {
  await db
    .insert(userPlans)
    .values({ userId, plan, status: "active", updatedBy: "billing" })
    .onConflictDoUpdate({
      target: userPlans.userId,
      set: { plan, status: "active", updatedBy: "billing", updatedAt: new Date() },
    });
}

export async function syncBilledPlan(userId: string) {
  const subscription = await getEffectivePlan(userId);
  if (subscription) {
    await applyBilledPlan(userId, subscription.planKey);
    return subscription.planKey;
  }
  const row = await db.query.userPlans.findFirst({
    where: eq(userPlans.userId, userId),
  });
  if (row?.updatedBy === "billing" && parsePlanKey(row.plan) !== "free") {
    await db
      .update(userPlans)
      .set({ plan: "free", status: "lapsed", updatedBy: "billing", updatedAt: new Date() })
      .where(eq(userPlans.userId, userId));
  }
  return "free" as const;
}

export async function getActiveStorageAddonBytes(userId: string): Promise<number> {
  const rows = rowsOf<{ storage_bytes: string | number }>(
    await db.execute(sql`
      select coalesce(sum(storage_bytes), 0) as storage_bytes
      from app.billing_addons
      where user_id = ${userId}
        and status in ${ENTITLED_STATUS_SQL}
        and (status <> 'cancelled' or current_period_end is null or current_period_end > now())
        and (provider <> 'mayar' or current_period_end is null or current_period_end > now())
    `),
  );
  const value = Number(rows[0]?.storage_bytes ?? 0);
  return Number.isSafeInteger(value) && value > 0 ? value : 0;
}

export async function upsertStorageAddon(input: {
  userId: string;
  productId: string;
  provider: BillingProvider;
  providerReferenceId: string;
  storageBytes: number;
  status: string;
  currentPeriodStart?: Date | null;
  currentPeriodEnd?: Date | null;
  metadata?: Record<string, unknown>;
}) {
  await db
    .insert(billingAddons)
    .values({
      userId: input.userId,
      productId: input.productId,
      provider: input.provider,
      providerReferenceId: input.providerReferenceId,
      storageBytes: input.storageBytes,
      status: input.status,
      currentPeriodStart: input.currentPeriodStart ?? null,
      currentPeriodEnd: input.currentPeriodEnd ?? null,
      metadata: input.metadata ?? {},
    })
    .onConflictDoUpdate({
      target: [billingAddons.provider, billingAddons.providerReferenceId],
      set: {
        productId: input.productId,
        storageBytes: input.storageBytes,
        status: input.status,
        currentPeriodStart: input.currentPeriodStart ?? null,
        currentPeriodEnd: input.currentPeriodEnd ?? null,
        metadata: input.metadata ?? {},
        updatedAt: new Date(),
      },
    });
}

export async function getSubscriptionByProviderId(provider: BillingProvider, subscriptionId: string) {
  return db.query.billingSubscriptions.findFirst({
    where: and(
      eq(billingSubscriptions.provider, provider),
      eq(billingSubscriptions.providerSubscriptionId, subscriptionId),
    ),
  });
}

// Effective right now by the same rules getEffectivePlan uses, so admin plan
// overrides only touch subscriptions that still entitle the user.
const EFFECTIVE_SUBSCRIPTION_SQL = and(
  sql`status in ${ENTITLED_STATUS_SQL}`,
  sql`(status <> 'cancelled' or current_period_end is null or current_period_end > now())`,
  sql`(provider <> 'mayar' or current_period_end is null or current_period_end > now())`,
);

/**
 * Admin plan override support: an active subscription outranks manual plan
 * rows in getUserPlan, so downgrading a subscriber to free must expire the
 * subscription or the next plan read reverts the change.
 */
export async function expireActiveSubscriptions(userId: string) {
  await db
    .update(billingSubscriptions)
    .set({ status: "expired", endedAt: new Date(), cancelAtPeriodEnd: false, updatedAt: new Date() })
    .where(and(eq(billingSubscriptions.userId, userId), EFFECTIVE_SUBSCRIPTION_SQL));
}

/** Align effective subscriptions to an admin-selected paid plan. Provider
 * events (e.g. LemonSqueezy renewals) may re-sync this to the billed variant. */
export async function overrideActiveSubscriptionPlan(userId: string, plan: PaidPlanKey) {
  await db
    .update(billingSubscriptions)
    .set({ planKey: plan, updatedAt: new Date() })
    .where(and(eq(billingSubscriptions.userId, userId), EFFECTIVE_SUBSCRIPTION_SQL));
}
