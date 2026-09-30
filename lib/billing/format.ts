import type { BillingMarket, BillingPlan } from "./types";

export function money(amountMinor: number, currency: string) {
  const amount = currency === "IDR" ? amountMinor : amountMinor / 100;
  const whole = currency === "IDR" || amountMinor % 100 === 0;
  return new Intl.NumberFormat(currency === "IDR" ? "id-ID" : undefined, {
    style: "currency",
    currency,
    maximumFractionDigits: whole ? 0 : 2,
  }).format(amount);
}

/** A card's headline price: plan list price in the market's currency, with static fallbacks when catalog rows are missing. */
export function planPrice(planKey: "free" | "plus" | "pro", market: BillingMarket, billed: BillingPlan | undefined) {
  if (planKey === "free") return market === "indonesia" ? "Rp0" : "$0";
  if (!billed) return planKey === "plus" ? "$12" : "$29";
  return money(billed.amountMinor, billed.currency);
}
