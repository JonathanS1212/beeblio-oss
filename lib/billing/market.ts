import type { BillingMarket } from "./types";

export const BILLING_MARKET_COOKIE = "beeblio_billing_market";

export function billingMarket(value: unknown): BillingMarket | null {
  return value === "global" || value === "indonesia" ? value : null;
}

export function detectedBillingMarket(headers: Headers): BillingMarket {
  return headers.get("x-vercel-ip-country")?.toUpperCase() === "ID" ? "indonesia" : "global";
}
