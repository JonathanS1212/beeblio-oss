import { auth } from "@/lib/auth/server";
import { getUser } from "@/lib/auth/session";
import { billingError, errorResponse, jsonBody } from "@/lib/billing/http";
import { createLemonSqueezyCheckout } from "@/lib/billing/lemonsqueezy";
import { billingMarket } from "@/lib/billing/market";
import { createMayarPayment } from "@/lib/billing/mayar";
import { updateBillingMobile } from "@/lib/billing/profile";
import { getCreditProduct } from "@/lib/billing/products";
import { getEffectivePlan } from "@/lib/billing/subscriptions";
import { getUserPlan } from "@/lib/entitlements/user";
import { db } from "@/db";
import { payments } from "@/db/schema";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const user = await getUser();
    if (!user) throw billingError("Unauthorized", 401);
    const body = await jsonBody(request, 10_000);
    const market = billingMarket(body?.market);
    if (!body || typeof body.productId !== "string" || !market) {
      throw billingError("A billing product is required", 400);
    }
    const product = await getCreditProduct(body.productId, market);
    // Student products share this database but are sold only by Skripsy.
    // Hidden catalog rows are still addressable by ID, so enforce the boundary here.
    if (product.provider === "mayar" && product.variantId.startsWith("student:")) {
      throw billingError("Product unavailable", 404);
    }
    const [subscription, plan] = await Promise.all([
      getEffectivePlan(user.id),
      getUserPlan(user.id),
    ]);
    if (product.productType === "subscription" && subscription) {
      throw billingError("Use plan switching to change an active subscription", 409, "subscription_already_active");
    }
    if (product.productType === "topup" && plan === "free") {
      throw billingError("Credit top-ups require an active paid subscription", 403, "plan_upgrade_required");
    }
    if (product.productType === "topup" && subscription && subscription.provider !== product.provider) {
      throw billingError("Credit top-ups must use your subscription payment provider", 409);
    }
    if (product.productType === "storage_addon" && subscription && subscription.provider !== product.provider) {
      throw billingError("Storage add-ons must use your subscription payment provider", 409);
    }
  const origin = new URL(request.url).origin;
  const redirectUrl = `${origin}/usage?checkout=success`;
    if (product.provider === "mayar") {
      const mobile = await updateBillingMobile(user.id, body.mobile);
      if (!user.phoneNumber) {
        // First phone number the user gave us: back-fill the identity profile
        // so it shows on /account. Never overwrite a phone the user set there.
        const { error } = await auth.updateUser({ phoneNumber: mobile });
        if (error) {
          console.warn("[checkout] could not save phone to profile", error.message);
        }
      }
      if (!user.email) {
        throw billingError("Your account needs an email address for Mayar checkout", 400);
      }
      const description =
        product.productType === "storage_addon"
          ? `Beeblio ${product.name}`
          : `Beeblio ${product.name}${product.credits ? ` — ${product.credits} credits` : ""}`;
      const checkout = await createMayarPayment({
        name: user.name || user.email.split("@")[0],
        email: user.email,
        mobile,
        amount: product.amountMinor,
        description,
        redirectUrl,
      });
      await db
        .insert(payments)
        .values({
          userId: user.id,
          productId: product.id,
          provider: "mayar",
          providerCheckoutId: checkout.checkoutId,
          status: "pending",
          amountMinor: product.amountMinor,
          currency: product.currency,
          creditsGranted: 0,
          metadata: { transactionId: checkout.transactionId, market },
        })
        .onConflictDoNothing({
          target: [payments.provider, payments.providerCheckoutId],
        });
      return Response.json({ checkoutUrl: checkout.checkoutUrl });
    }
    const checkout = await createLemonSqueezyCheckout({
      userId: user.id,
      productId: product.id,
      variantId: product.variantId,
      email: user.email,
      name: user.name,
      redirectUrl,
    });
    return Response.json({ checkoutUrl: checkout.checkoutUrl });
  } catch (error) {
    return errorResponse(error);
  }
}
