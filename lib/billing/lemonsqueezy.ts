import { createHmac, timingSafeEqual } from "node:crypto";

const API_URL = "https://api.lemonsqueezy.com/v1";

// Beeblio and mograph sell through the same Lemon Squeezy store, whose
// webhooks fan out to every registered endpoint. This tag on checkout custom
// data lets each app's webhook drop the other's events instead of erroring
// into provider retry loops.
export const LEMON_SQUEEZY_APP_TAG = "beeblio";

export function lemonSqueezyTestMode() {
  const configured = process.env.LEMON_SQUEEZY_MODE?.trim().toLowerCase();
  if (configured && configured !== "test" && configured !== "live") {
    throw new Error("LEMON_SQUEEZY_MODE must be test or live");
  }
  if (configured) return configured === "test";
  return process.env.VERCEL_ENV !== "production";
}

function required(name: "LEMON_SQUEEZY_API_KEY" | "LEMON_SQUEEZY_STORE_ID" | "LEMON_SQUEEZY_WEBHOOK_SECRET") {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is not configured`);
  return value;
}

export function verifyLemonSqueezySignature(rawBody: string, signature: string | null) {
  if (!signature || !/^[a-f\d]{64}$/i.test(signature)) return false;
  const expected = createHmac("sha256", required("LEMON_SQUEEZY_WEBHOOK_SECRET"))
    .update(rawBody)
    .digest("hex");
  return timingSafeEqual(Buffer.from(expected, "utf8"), Buffer.from(signature, "utf8"));
}

export function checkoutBinding(userId: string, productId: string) {
  return createHmac("sha256", required("LEMON_SQUEEZY_WEBHOOK_SECRET"))
    .update(`${userId}\0${productId}`)
    .digest("hex");
}

export function verifyCheckoutBinding(userId: string, productId: string, binding: unknown) {
  if (typeof binding !== "string" || !/^[a-f\d]{64}$/i.test(binding)) return false;
  return timingSafeEqual(
    Buffer.from(checkoutBinding(userId, productId), "utf8"),
    Buffer.from(binding, "utf8"),
  );
}

type CheckoutInput = {
  userId: string;
  productId: string;
  variantId: string;
  email?: string;
  name?: string;
  redirectUrl: string;
};

export async function createLemonSqueezyCheckout(input: CheckoutInput) {
  const response = await fetch(`${API_URL}/checkouts`, {
    method: "POST",
    headers: {
      Accept: "application/vnd.api+json",
      "Content-Type": "application/vnd.api+json",
      Authorization: `Bearer ${required("LEMON_SQUEEZY_API_KEY")}`,
    },
    body: JSON.stringify({
      data: {
        type: "checkouts",
        attributes: {
          product_options: {
            redirect_url: input.redirectUrl,
            enabled_variants: [Number(input.variantId)],
          },
          checkout_data: {
            ...(input.email ? { email: input.email } : {}),
            ...(input.name ? { name: input.name } : {}),
            custom: {
              app: LEMON_SQUEEZY_APP_TAG,
              user_id: input.userId,
              product_id: input.productId,
              checkout_binding: checkoutBinding(input.userId, input.productId),
            },
          },
        },
        relationships: {
          store: { data: { type: "stores", id: required("LEMON_SQUEEZY_STORE_ID") } },
          variant: { data: { type: "variants", id: input.variantId } },
        },
      },
    }),
    cache: "no-store",
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    console.error("[billing] Lemon Squeezy checkout failed", response.status, payload?.errors);
    throw Object.assign(new Error("Could not start checkout"), { status: 502 });
  }
  const checkoutId = payload?.data?.id;
  const checkoutUrl = payload?.data?.attributes?.url;
  if (typeof checkoutId !== "string" || typeof checkoutUrl !== "string") {
    throw Object.assign(new Error("Payment provider returned an invalid checkout"), { status: 502 });
  }
  return { checkoutId, checkoutUrl };
}

export async function changeLemonSqueezySubscription(input: {
  subscriptionId: string;
  variantId: string;
  invoiceImmediately: boolean;
}) {
  const response = await fetch(`${API_URL}/subscriptions/${encodeURIComponent(input.subscriptionId)}`, {
    method: "PATCH",
    headers: {
      Accept: "application/vnd.api+json",
      "Content-Type": "application/vnd.api+json",
      Authorization: `Bearer ${required("LEMON_SQUEEZY_API_KEY")}`,
    },
    body: JSON.stringify({
      data: {
        type: "subscriptions",
        id: input.subscriptionId,
        attributes: {
          variant_id: Number(input.variantId),
          ...(input.invoiceImmediately
            ? { invoice_immediately: true }
            : { disable_prorations: true }),
        },
      },
    }),
    cache: "no-store",
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    console.error("[billing] Lemon Squeezy subscription change failed", response.status, payload?.errors);
    throw Object.assign(new Error("Could not change subscription plan"), { status: 502 });
  }
  const attributes = payload?.data?.attributes;
  const portalUrl = attributes?.urls?.customer_portal_update_subscription;
  if (
    payload?.data?.id === input.subscriptionId &&
    Number(attributes?.variant_id) !== Number(input.variantId) &&
    typeof portalUrl === "string"
  ) {
    return {
      status: typeof attributes.status === "string" ? attributes.status : "active",
      portalUrl,
      changed: false,
    };
  }
  if (payload?.data?.id !== input.subscriptionId || Number(attributes?.variant_id) !== Number(input.variantId)) {
    throw Object.assign(new Error("Payment provider returned an invalid subscription update"), { status: 502 });
  }
  return {
    status: typeof attributes.status === "string" ? attributes.status : "active",
    portalUrl: typeof portalUrl === "string" ? portalUrl : null,
    changed: true,
  };
}

export async function getLemonSqueezySubscription(subscriptionId: string) {
  const response = await fetch(`${API_URL}/subscriptions/${encodeURIComponent(subscriptionId)}`, {
    headers: {
      Accept: "application/vnd.api+json",
      Authorization: `Bearer ${required("LEMON_SQUEEZY_API_KEY")}`,
    },
    cache: "no-store",
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    console.error("[billing] Lemon Squeezy subscription lookup failed", response.status, payload?.errors);
    throw Object.assign(new Error("Could not verify subscription renewal"), { status: 502 });
  }
  const attributes = payload?.data?.attributes;
  if (
    payload?.data?.type !== "subscriptions" ||
    payload?.data?.id !== subscriptionId ||
    !Number.isSafeInteger(Number(attributes?.variant_id)) ||
    typeof attributes?.status !== "string" ||
    typeof attributes?.renews_at !== "string" ||
    typeof attributes?.test_mode !== "boolean"
  ) {
    throw Object.assign(new Error("Payment provider returned an invalid subscription"), { status: 502 });
  }
  return {
    id: subscriptionId,
    variantId: String(attributes.variant_id),
    status: attributes.status,
    renewsAt: attributes.renews_at,
    testMode: attributes.test_mode,
  };
}
