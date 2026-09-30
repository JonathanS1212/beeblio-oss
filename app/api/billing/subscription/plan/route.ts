import { and, eq } from "drizzle-orm";

import { db } from "@/db";
import { billingSubscriptions } from "@/db/schema";
import { getUser } from "@/lib/auth/session";
import { billingError, errorResponse, jsonBody } from "@/lib/billing/http";
import { changeLemonSqueezySubscription } from "@/lib/billing/lemonsqueezy";
import { getCreditProduct } from "@/lib/billing/products";
import { getActiveSubscription } from "@/lib/billing/subscriptions";
import type { PaidPlanKey } from "@/lib/billing/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const PLAN_RANK: Record<PaidPlanKey, number> = { plus: 1, pro: 2 };

export async function POST(request: Request) {
  try {
    const user = await getUser();
    if (!user) throw billingError("Unauthorized", 401);
    const body = await jsonBody(request, 10_000);
    if (!body || typeof body.productId !== "string") {
      throw billingError("A target plan is required", 400);
    }
    const [subscription, product] = await Promise.all([
      getActiveSubscription(user.id),
      getCreditProduct(body.productId),
    ]);
    if (!subscription) throw billingError("No active subscription was found", 409);
    if (subscription.provider !== "lemonsqueezy") {
      throw billingError("Mayar plans renew manually and cannot be switched during an active month", 409);
    }
    if (product.productType !== "subscription" || !product.planKey) {
      throw billingError("The selected product is not a subscription plan", 400);
    }
    if (product.provider !== subscription.provider) {
      throw billingError("Plan changes must use the current payment provider", 409);
    }
    if (subscription.planKey === product.planKey) {
      return Response.json({ changed: false, plan: product.planKey });
    }

    const direction = PLAN_RANK[product.planKey] > PLAN_RANK[subscription.planKey] ? "upgrade" : "downgrade";
    const requestedAt = new Date().toISOString();
    const current = await db.query.billingSubscriptions.findFirst({
      where: and(
        eq(billingSubscriptions.userId, user.id),
        eq(billingSubscriptions.provider, "lemonsqueezy"),
        eq(billingSubscriptions.providerSubscriptionId, subscription.providerSubscriptionId),
      ),
    });
    if (direction === "upgrade") {
      await db
        .update(billingSubscriptions)
        .set({
          metadata: {
            ...(current?.metadata ?? {}),
            pendingPlanChange: {
              direction,
              fromPlanKey: subscription.planKey,
              fromVariantId: subscription.providerVariantId,
              toPlanKey: product.planKey,
              toVariantId: product.variantId,
              requestedAt,
              state: "awaiting_payment",
            },
          },
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(billingSubscriptions.userId, user.id),
            eq(billingSubscriptions.provider, "lemonsqueezy"),
            eq(billingSubscriptions.providerSubscriptionId, subscription.providerSubscriptionId),
          ),
        );
    }

    let updated;
    try {
      updated = await changeLemonSqueezySubscription({
        subscriptionId: subscription.providerSubscriptionId,
        variantId: product.variantId,
        invoiceImmediately: direction === "upgrade",
      });
    } catch (error) {
      if (direction === "upgrade") {
        const metadata = { ...(current?.metadata ?? {}) };
        delete metadata.pendingPlanChange;
        await db
          .update(billingSubscriptions)
          .set({ metadata, updatedAt: new Date() })
          .where(
            and(
              eq(billingSubscriptions.userId, user.id),
              eq(billingSubscriptions.provider, "lemonsqueezy"),
              eq(billingSubscriptions.providerSubscriptionId, subscription.providerSubscriptionId),
            ),
          );
      }
      throw error;
    }
    if (!updated.changed && updated.portalUrl) {
      return Response.json({ changed: false, requiresPortal: true, portalUrl: updated.portalUrl });
    }

    if (direction === "downgrade") {
      await db
        .update(billingSubscriptions)
        .set({
          providerVariantId: product.variantId,
          planKey: product.planKey,
          status: updated.status,
          metadata: {
            ...(current?.metadata ?? {}),
            pendingPlanChange: undefined,
            lastPlanChange: { direction, changedAt: requestedAt },
          },
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(billingSubscriptions.userId, user.id),
            eq(billingSubscriptions.provider, "lemonsqueezy"),
            eq(billingSubscriptions.providerSubscriptionId, subscription.providerSubscriptionId),
          ),
        );
      return Response.json({
        changed: true,
        plan: product.planKey,
        direction,
        portalUrl: updated.portalUrl,
      });
    }

    return Response.json({
      changed: false,
      pendingPayment: true,
      plan: subscription.planKey,
      direction,
    });
  } catch (error) {
    return errorResponse(error);
  }
}
