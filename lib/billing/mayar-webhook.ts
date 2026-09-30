import "server-only";

import { and, desc, eq, or, sql } from "drizzle-orm";

import { db } from "@/db";
import { billingSubscriptions, creditProducts, payments } from "@/db/schema";
import { ensurePlanCredits, grantCredits } from "@/lib/credits";
import { invalidatePlanCreditCheck } from "@/lib/credits/grant";
import { getUserPlan } from "@/lib/entitlements/user";

import { claimBillingEvent, markBillingEventProcessed } from "./events";
import { billingError } from "./http";
import { getMayarPayment } from "./mayar";
import { parseProduct } from "./products";
import { applyBilledPlan, upsertStorageAddon } from "./subscriptions";

type MayarWebhook = { event?: unknown; data?: Record<string, unknown> };

function text(value: unknown) {
  return typeof value === "string" && value ? value : null;
}
function number(value: unknown) {
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) ? parsed : NaN;
}

function asPayload(value: MayarWebhook): Record<string, unknown> {
  return JSON.parse(JSON.stringify(value)) as Record<string, unknown>;
}

export async function processMayarWebhook(payload: MayarWebhook) {
  if (payload.event !== "payment.received" || !payload.data) {
    return { ignored: true, processed: false };
  }
  const transactionId =
    text(payload.data.transactionId) ??
    text(payload.data.paymentLinkTransactionId) ??
    text(payload.data.id);
  const checkoutId = text(payload.data.paymentLinkId) ?? text(payload.data.productId);
  if (!transactionId && !checkoutId) throw billingError("Invalid Mayar webhook payload", 400);

  const pending = await db
    .select()
    .from(payments)
    .where(
      and(
        eq(payments.provider, "mayar"),
        eq(payments.status, "pending"),
        or(
          checkoutId ? eq(payments.providerCheckoutId, checkoutId) : sql`false`,
          transactionId
            ? sql`${payments.metadata}->>'transactionId' = ${transactionId}`
            : sql`false`,
        ),
      ),
    )
    .orderBy(desc(payments.createdAt))
    .limit(1);

  const row = pending[0];
  if (!row) {
    const duplicate = await db.query.payments.findFirst({
      where: and(
        eq(payments.provider, "mayar"),
        eq(payments.status, "paid"),
        or(
          transactionId ? eq(payments.providerPaymentId, transactionId) : sql`false`,
          checkoutId ? eq(payments.providerCheckoutId, checkoutId) : sql`false`,
        ),
      ),
    });
    if (duplicate) return { duplicate: true, processed: false };
    throw billingError("Mayar payment is not associated with a pending checkout", 400);
  }

  if (!row.providerCheckoutId || !row.productId) {
    throw billingError("Mayar payment is missing checkout identity", 400);
  }

  const verified = await getMayarPayment(row.providerCheckoutId);
  const status = text(verified?.status)?.toLowerCase();
  const amount = number(verified?.amount);
  if (!status || !["paid", "settled", "success"].includes(status) || amount !== number(row.amountMinor)) {
    throw billingError("Mayar payment could not be verified", 400);
  }
  const payloadAmount = number(payload.data.amount);
  if (!Number.isNaN(payloadAmount) && payloadAmount !== number(row.amountMinor)) {
    throw billingError("Mayar webhook amount does not match checkout", 400);
  }

  const verifiedTransactionId = Array.isArray(verified?.transactions)
    ? text(verified.transactions[0]?.id)
    : null;
  const storedTransactionId = text(row.metadata.transactionId);
  if (storedTransactionId && verifiedTransactionId && storedTransactionId !== verifiedTransactionId) {
    throw billingError("Mayar transaction does not match checkout", 400);
  }
  const paymentId = verifiedTransactionId ?? storedTransactionId ?? transactionId;
  if (!paymentId) throw billingError("Mayar payment is missing a transaction ID", 400);

  const eventId = `payment.received:${paymentId}`;
  const claimed = await claimBillingEvent({
    provider: "mayar",
    eventId,
    eventType: "payment.received",
    userId: row.userId,
    payload: asPayload(payload),
  });
  if (claimed.duplicate) return { duplicate: true, processed: false };

  const productRow = await db.query.creditProducts.findFirst({
    where: eq(creditProducts.id, row.productId),
  });
  if (!productRow) throw billingError("Mayar payment references an unknown product", 400);
  const selected = parseProduct(productRow);
  const billingInterval = productRow.metadata?.billingInterval === "week" ? "week" : "month";

  await db
    .update(payments)
    .set({
      providerPaymentId: paymentId,
      providerEventId: eventId,
      status: "paid",
      creditsGranted: selected.credits,
      paidAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(payments.id, row.id));

  const periodStart = new Date();
  const end = new Date(periodStart);
  if (selected.productType === "subscription" && billingInterval === "week") {
    end.setUTCDate(end.getUTCDate() + 7);
  } else {
    end.setUTCMonth(end.getUTCMonth() + 1);
  }

  if (selected.productType === "subscription" && selected.planKey) {
    await db
      .insert(billingSubscriptions)
      .values({
        userId: row.userId,
        provider: "mayar",
        providerSubscriptionId: paymentId,
        providerVariantId: selected.variantId,
        planKey: selected.planKey,
        status: "active",
        currentPeriodStart: periodStart,
        currentPeriodEnd: end,
        cancelAtPeriodEnd: true,
        metadata: { renewal: "manual", billingInterval, includedCredits: selected.credits },
      })
      .onConflictDoNothing({
        target: [billingSubscriptions.provider, billingSubscriptions.providerSubscriptionId],
      });
    await applyBilledPlan(row.userId, selected.planKey);
    invalidatePlanCreditCheck(row.userId);
    await ensurePlanCredits(row.userId).catch((error) => {
      console.error("[mayar] allowance grant will retry on next usage read", error);
    });
  } else if (selected.productType === "topup") {
    const plan = await getUserPlan(row.userId);
    if (plan === "free") {
      throw billingError("Credit top-ups require a paid plan (Plus or Pro)", 403);
    }
    if (selected.credits > 0) {
      await grantCredits({
        userId: row.userId,
        amount: selected.credits,
        idempotencyKey: `topup:payment:${paymentId}`,
        reason: "topup",
        source: "payment",
        bucket: "topup",
      });
    }
  } else if (selected.productType === "storage_addon" && selected.storageBytes) {
    await upsertStorageAddon({
      userId: row.userId,
      productId: row.productId,
      provider: "mayar",
      providerReferenceId: paymentId,
      storageBytes: selected.storageBytes,
      status: "active",
      currentPeriodStart: new Date(),
      currentPeriodEnd: end,
      metadata: { renewal: "manual" },
    });
  }

  await markBillingEventProcessed({ provider: "mayar", eventId, userId: row.userId });
  return { duplicate: false, processed: true };
}

// Mayar's redirect can land the buyer back on the app before (or without) the
// payment.received webhook. Re-checking pending payments through the webhook
// path self-heals both cases; unpaid links simply fail verification inside
// processMayarWebhook and stay pending.
export async function reconcilePendingMayarPayments(userId: string) {
  const pending = await db
    .select()
    .from(payments)
    .where(
      and(
        eq(payments.userId, userId),
        eq(payments.provider, "mayar"),
        eq(payments.status, "pending"),
        sql`${payments.createdAt} > now() - interval '2 hours'`,
      ),
    )
    .orderBy(desc(payments.createdAt))
    .limit(5);
  for (const row of pending) {
    if (!row.providerCheckoutId) continue;
    const transactionId = text(row.metadata?.transactionId);
    try {
      await processMayarWebhook({
        event: "payment.received",
        data: {
          paymentLinkId: row.providerCheckoutId,
          ...(transactionId ? { transactionId } : {}),
          amount: row.amountMinor,
        },
      });
    } catch {
      // Not paid yet or unverifiable — the webhook remains the source of truth.
    }
  }
}
