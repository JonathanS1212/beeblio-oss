import "server-only";

import { and, eq } from "drizzle-orm";

import { db } from "@/db";
import {
  billingAddons,
  billingCustomers,
  billingSubscriptions,
  creditProducts,
  payments,
} from "@/db/schema";
import { grantCredits } from "@/lib/credits";
import { getUserPlan } from "@/lib/entitlements/user";

import { claimBillingEvent, markBillingEventProcessed } from "./events";
import { billingError } from "./http";
import {
  getLemonSqueezySubscription,
  lemonSqueezyTestMode,
  LEMON_SQUEEZY_APP_TAG,
  verifyCheckoutBinding,
} from "./lemonsqueezy";
import { parseProduct } from "./products";
import { pendingPlanChange, subscriptionWebhookAction } from "./subscription-state";
import {
  getSubscriptionByProviderId,
  syncBilledPlan,
  upsertStorageAddon,
} from "./subscriptions";
import type { CreditProduct } from "./types";

const PROVIDER = "lemonsqueezy" as const;

export type LemonSqueezyOrderWebhook = {
  meta?: {
    event_name?: unknown;
    webhook_id?: unknown;
    custom_data?: { user_id?: unknown; product_id?: unknown; checkout_binding?: unknown; app?: unknown };
  };
  data?: {
    id?: unknown;
    type?: unknown;
    attributes?: {
      customer_id?: unknown;
      currency?: unknown;
      total?: unknown;
      status?: unknown;
      test_mode?: unknown;
      first_order_item?: { variant_id?: unknown; price?: unknown };
      variant_id?: unknown;
      subscription_id?: unknown;
      renews_at?: unknown;
      ends_at?: unknown;
      cancelled?: unknown;
      created_at?: unknown;
      updated_at?: unknown;
      billing_reason?: unknown;
      billing_period_start?: unknown;
      billing_period_end?: unknown;
      urls?: { customer_portal?: unknown };
    };
  };
};

function integer(value: unknown) {
  const result = Number(value);
  return Number.isSafeInteger(result) ? result : NaN;
}

function stringValue(value: unknown) {
  return typeof value === "string" && value ? value : null;
}

function asPayload(value: LemonSqueezyOrderWebhook): Record<string, unknown> {
  return JSON.parse(JSON.stringify(value)) as Record<string, unknown>;
}

async function configuredProduct(productId: string): Promise<{
  row: typeof creditProducts.$inferSelect;
  selected: CreditProduct;
}> {
  const row = await db.query.creditProducts.findFirst({
    where: and(
      eq(creditProducts.id, productId),
      eq(creditProducts.provider, PROVIDER),
      eq(creditProducts.active, true),
    ),
  });
  if (!row) throw billingError("Webhook references an unknown billing product", 400);
  return { row, selected: parseProduct(row) };
}

async function productIdForVariant(variantId: string): Promise<string | null> {
  const row = await db.query.creditProducts.findFirst({
    where: and(
      eq(creditProducts.provider, PROVIDER),
      eq(creditProducts.providerPriceId, variantId),
      eq(creditProducts.active, true),
    ),
  });
  return row?.id ?? null;
}

function periodDate(value: string | null) {
  if (!value || Number.isNaN(Date.parse(value))) return null;
  return new Date(value);
}

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// A product id that exists locally, even deactivated, is one of ours; an id
// absent from the catalog entirely (or not a uuid at all) belongs to another
// app sharing this Lemon Squeezy store.
async function isForeignProductId(productId: string) {
  if (!UUID_PATTERN.test(productId)) return true;
  const row = await db.query.creditProducts.findFirst({
    where: eq(creditProducts.id, productId),
  });
  return row == null;
}

export async function processLemonSqueezyWebhook(payload: LemonSqueezyOrderWebhook) {
  const eventName = stringValue(payload.meta?.event_name);
  const objectId = stringValue(payload.data?.id);
  if (!eventName || !objectId) throw billingError("Invalid webhook payload", 400);
  const eventId =
    stringValue(payload.meta?.webhook_id) ||
    `${eventName}:${objectId}:${String(payload.data?.attributes?.updated_at || "")}`;
  const attributes = payload.data?.attributes;
  const subscriptionId =
    payload.data?.type === "subscriptions" ? objectId : stringValue(attributes?.subscription_id);
  const webhookAction = subscriptionWebhookAction(eventName, attributes?.billing_reason);
  const custom = payload.meta?.custom_data;
  let userId = stringValue(custom?.user_id);
  let productId = stringValue(custom?.product_id);

  // The store's webhooks fan out to every app selling through it (beeblio and
  // mograph share one Lemon Squeezy store). Foreign events are not ours to
  // process and not errors worth a provider retry loop, so acknowledge and
  // drop them. Checkouts created before the app tag rely on the product-id
  // tell instead.
  const appTag = stringValue(custom?.app);
  if (appTag && appTag !== LEMON_SQUEEZY_APP_TAG) {
    return { ignored: true, reason: "foreign_app" };
  }
  if (productId && (await isForeignProductId(productId))) {
    return { ignored: true, reason: "foreign_product" };
  }

  if (webhookAction === "renewal_paid" && attributes?.status !== "paid") {
    throw billingError("Renewal invoice is not paid", 400);
  }
  const verifiedRenewal =
    webhookAction === "renewal_paid" && subscriptionId
      ? await getLemonSqueezySubscription(subscriptionId)
      : null;

  const claimed = await claimBillingEvent({
    provider: PROVIDER,
    eventId,
    eventType: eventName,
    userId,
    payload: asPayload(payload),
  });
  if (claimed.duplicate) return { duplicate: true, processed: false };

  if ((!userId || !productId) && subscriptionId) {
    const existing = await getSubscriptionByProviderId(PROVIDER, subscriptionId);
    if (existing) {
      userId = userId ?? existing.userId;
      productId =
        productId ??
        (await productIdForVariant(existing.providerVariantId));
    }
    if ((!userId || !productId) && subscriptionId) {
      const addon = await db.query.billingAddons.findFirst({
        where: and(
          eq(billingAddons.provider, PROVIDER),
          eq(billingAddons.providerReferenceId, subscriptionId),
        ),
      });
      if (addon) {
        userId = userId ?? addon.userId;
        productId = productId ?? addon.productId ?? productId;
      }
    }
  }

  if (eventName === "order_created") {
    if (
      payload.data?.type !== "orders" ||
      !userId ||
      !productId ||
      !verifyCheckoutBinding(userId, productId, custom?.checkout_binding)
    ) {
      throw billingError("Order webhook is missing valid checkout identity", 400);
    }
    if (attributes?.status !== "paid") throw billingError("Order is not paid", 400);
    const { row, selected } = await configuredProduct(productId);
    // Match the order item's pre-tax unit price: Lemon Squeezy is the merchant
    // of record, so the order `total` carries region-dependent VAT/sales tax
    // above the configured price and must not be compared against it.
    const orderItem = attributes.first_order_item;
    const variantId = String(orderItem?.variant_id ?? "");
    if (
      variantId !== row.providerPriceId ||
      integer(orderItem?.price) !== selected.amountMinor ||
      String(attributes.currency || "").toUpperCase() !== selected.currency
    ) {
      throw billingError("Order does not match the configured billing product", 400);
    }
    if (selected.productType === "topup") {
      const plan = await getUserPlan(userId);
      if (plan === "free") {
        throw billingError("Credit top-ups require a paid plan (Plus or Pro)", 403);
      }
      const payment = await db
        .insert(payments)
        .values({
          userId,
          productId,
          provider: PROVIDER,
          providerPaymentId: objectId,
          status: "paid",
          amountMinor: selected.amountMinor,
          currency: selected.currency,
          creditsGranted: selected.credits,
          providerEventId: eventId,
          paidAt: new Date(),
          metadata: { customerId: attributes.customer_id, productType: "topup" },
        })
        .onConflictDoNothing({
          target: [payments.provider, payments.providerPaymentId],
        })
        .returning({ id: payments.id });
      if (payment[0] && selected.credits > 0) {
        await grantCredits({
          userId,
          amount: selected.credits,
          idempotencyKey: `topup:order:${objectId}`,
          reason: "topup",
          source: "payment",
          bucket: "topup",
        });
      }
    } else if (selected.productType === "storage_addon" && selected.storageBytes && !subscriptionId) {
      const end = new Date();
      end.setUTCMonth(end.getUTCMonth() + 1);
      await upsertStorageAddon({
        userId,
        productId,
        provider: PROVIDER,
        providerReferenceId: `order:${objectId}`,
        storageBytes: selected.storageBytes,
        status: "active",
        currentPeriodStart: new Date(),
        currentPeriodEnd: end,
        metadata: { eventName, oneTime: true },
      });
    }
    if (attributes.customer_id != null) {
      await db
        .insert(billingCustomers)
        .values({
          userId,
          provider: PROVIDER,
          providerCustomerId: String(attributes.customer_id),
        })
        .onConflictDoNothing();
    }
  } else if (eventName.startsWith("subscription_") && subscriptionId) {
    if (!userId || !productId) {
      throw billingError("Subscription webhook cannot be associated with a user", 400);
    }
    if (custom?.checkout_binding && !verifyCheckoutBinding(userId, productId, custom.checkout_binding)) {
      throw billingError("Subscription checkout identity is invalid", 400);
    }
    const existing = await getSubscriptionByProviderId(PROVIDER, subscriptionId);
    const pending = pendingPlanChange(existing?.metadata?.pendingPlanChange);
    const lifecycleEvent = webhookAction === "lifecycle";
    const updatedPaymentSucceeded = webhookAction === "upgrade_paid";
    const paymentFailed = webhookAction === "upgrade_failed";

    let resolvedProductId = productId;
    const incomingVariantId = verifiedRenewal?.variantId ?? stringValue(attributes?.variant_id);
    if (pending && !updatedPaymentSucceeded && existing) {
      resolvedProductId = (await productIdForVariant(existing.providerVariantId)) ?? productId;
    } else if (incomingVariantId) {
      resolvedProductId = (await productIdForVariant(incomingVariantId)) ?? productId;
    } else if (updatedPaymentSucceeded && pending) {
      resolvedProductId = (await productIdForVariant(pending.toVariantId)) ?? productId;
    }
    const { row, selected } = await configuredProduct(resolvedProductId);

    if (selected.productType === "storage_addon") {
      if (!selected.storageBytes) throw billingError("Storage add-on is missing a quota", 400);
      const status = lifecycleEvent
        ? stringValue(attributes?.status) || (eventName === "subscription_expired" ? "expired" : "active")
        : "active";
      const allowedStatus = [
        "on_trial",
        "active",
        "past_due",
        "unpaid",
        "paused",
        "cancelled",
        "expired",
      ].includes(status ?? "")
        ? status!
        : "active";
      const periodEnd =
        verifiedRenewal?.renewsAt ||
        stringValue(attributes?.renews_at) ||
        stringValue(attributes?.ends_at) ||
        stringValue(attributes?.billing_period_end);
      await upsertStorageAddon({
        userId,
        productId: resolvedProductId,
        provider: PROVIDER,
        providerReferenceId: subscriptionId,
        storageBytes: selected.storageBytes,
        status: allowedStatus,
        currentPeriodStart: periodDate(stringValue(attributes?.billing_period_start) || stringValue(attributes?.created_at)),
        currentPeriodEnd: periodDate(periodEnd),
        metadata: { eventName, customerPortalUrl: attributes?.urls?.customer_portal || null },
      });
    } else {
      if (selected.productType !== "subscription" || !selected.planKey) {
        throw billingError("Subscription uses an invalid plan product", 400);
      }
      if (
        verifiedRenewal &&
        (verifiedRenewal.id !== subscriptionId ||
          verifiedRenewal.status !== "active" ||
          verifiedRenewal.testMode !== lemonSqueezyTestMode() ||
          row.metadata.testMode !== verifiedRenewal.testMode)
      ) {
        throw billingError("Renewal does not match the active configured subscription", 400);
      }
      const preservePaidPlan = Boolean(pending && !updatedPaymentSucceeded);
      const variantId =
        preservePaidPlan && existing
          ? existing.providerVariantId
          : verifiedRenewal?.variantId ?? String(attributes?.variant_id ?? row.providerPriceId);
      if (variantId !== row.providerPriceId) {
        throw billingError("Subscription variant does not match the configured plan", 400);
      }
      const status = lifecycleEvent
        ? stringValue(attributes?.status) || (eventName === "subscription_expired" ? "expired" : "active")
        : null;
      const allowedStatus = [
        "on_trial",
        "active",
        "past_due",
        "unpaid",
        "paused",
        "cancelled",
        "expired",
      ].includes(status ?? "")
        ? status
        : "active";
      const periodEnd =
        verifiedRenewal?.renewsAt ||
        stringValue(attributes?.renews_at) ||
        stringValue(attributes?.ends_at) ||
        stringValue(attributes?.billing_period_end);
      if (verifiedRenewal && (!periodEnd || Number.isNaN(Date.parse(periodEnd)))) {
        throw billingError("Renewal subscription has an invalid billing period", 400);
      }
      if (lifecycleEvent || updatedPaymentSucceeded) {
        await db
          .insert(billingSubscriptions)
          .values({
            userId,
            provider: PROVIDER,
            providerSubscriptionId: subscriptionId,
            providerCustomerId: attributes?.customer_id == null ? null : String(attributes.customer_id),
            providerVariantId: variantId,
            planKey: preservePaidPlan && existing ? existing.planKey : selected.planKey,
            status: allowedStatus ?? "active",
            currentPeriodStart: periodDate(
              stringValue(attributes?.billing_period_start) || stringValue(attributes?.created_at),
            ),
            currentPeriodEnd: periodDate(periodEnd),
            cancelAtPeriodEnd: attributes?.cancelled === true || allowedStatus === "cancelled",
            endedAt:
              allowedStatus === "expired"
                ? periodDate(stringValue(attributes?.ends_at)) ?? new Date()
                : null,
            metadata: {
              customerPortalUrl: attributes?.urls?.customer_portal || null,
              eventName,
              ...(updatedPaymentSucceeded
                ? {
                    pendingPlanChange: null,
                    lastPlanChange: { direction: "upgrade", changedAt: new Date().toISOString() },
                  }
                : {}),
            },
          })
          .onConflictDoUpdate({
            target: [billingSubscriptions.provider, billingSubscriptions.providerSubscriptionId],
            set: {
              providerCustomerId: attributes?.customer_id == null ? null : String(attributes.customer_id),
              providerVariantId: variantId,
              planKey: preservePaidPlan && existing ? existing.planKey : selected.planKey,
              status: allowedStatus ?? "active",
              currentPeriodStart: periodDate(
                stringValue(attributes?.billing_period_start) || stringValue(attributes?.created_at),
              ),
              currentPeriodEnd: periodDate(periodEnd),
              cancelAtPeriodEnd: attributes?.cancelled === true || allowedStatus === "cancelled",
              endedAt:
                allowedStatus === "expired"
                  ? periodDate(stringValue(attributes?.ends_at)) ?? new Date()
                  : null,
              metadata: {
                ...(existing?.metadata ?? {}),
                customerPortalUrl: attributes?.urls?.customer_portal || null,
                eventName,
                ...(updatedPaymentSucceeded
                  ? {
                      pendingPlanChange: null,
                      lastPlanChange: { direction: "upgrade", changedAt: new Date().toISOString() },
                    }
                  : {}),
              },
              updatedAt: new Date(),
            },
          });
      }
      if (updatedPaymentSucceeded) {
        const current = await getSubscriptionByProviderId(PROVIDER, subscriptionId);
        if (current) {
          const nextMetadata = { ...current.metadata };
          delete nextMetadata.pendingPlanChange;
          await db
            .update(billingSubscriptions)
            .set({ metadata: nextMetadata, updatedAt: new Date() })
            .where(
              and(
                eq(billingSubscriptions.provider, PROVIDER),
                eq(billingSubscriptions.providerSubscriptionId, subscriptionId),
              ),
            );
        }
      } else if (paymentFailed && pending) {
        const current = await getSubscriptionByProviderId(PROVIDER, subscriptionId);
        if (current) {
          await db
            .update(billingSubscriptions)
            .set({
              metadata: {
                ...current.metadata,
                pendingPlanChange: { ...pending, state: "payment_failed" },
                lastPaymentFailure: { invoiceId: objectId, failedAt: new Date().toISOString() },
              },
              updatedAt: new Date(),
            })
            .where(
              and(
                eq(billingSubscriptions.provider, PROVIDER),
                eq(billingSubscriptions.providerSubscriptionId, subscriptionId),
              ),
            );
        }
      }
      await syncBilledPlan(userId);
    }
  }

  await markBillingEventProcessed({ provider: PROVIDER, eventId, userId });
  return { duplicate: false, processed: true };
}
