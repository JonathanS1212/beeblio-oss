import "server-only";

import { and, eq, sql } from "drizzle-orm";

import { db } from "@/db";
import { creditProducts } from "@/db/schema";
import { parsePlanKey, type PlanKey } from "@/lib/entitlements/plans";

import { lemonSqueezyTestMode } from "./lemonsqueezy";
import { billingError } from "./http";
import type {
  BillingMarket,
  BillingPlan,
  BillingProductType,
  BillingProvider,
  CreditProduct,
  PaidPlanKey,
} from "./types";

type ProductRow = typeof creditProducts.$inferSelect;

function integer(value: unknown) {
  const result = Number(value);
  return Number.isSafeInteger(result) ? result : NaN;
}

function paidPlanKey(value: unknown): PaidPlanKey | null {
  const plan = parsePlanKey(value);
  return plan === "plus" || plan === "pro" ? plan : null;
}

export function parseProduct(row: ProductRow): CreditProduct {
  const metadata = row.metadata ?? {};
  const productType: BillingProductType =
    metadata.productType === "subscription"
      ? "subscription"
      : metadata.productType === "storage_addon"
        ? "storage_addon"
        : "topup";
  const storageBytes = integer(metadata.storageBytes);
  return {
    id: row.id,
    name: row.name,
    credits: row.credits,
    amountMinor: row.amountMinor,
    currency: row.currency.toUpperCase(),
    productType,
    planKey: paidPlanKey(metadata.planKey),
    storageBytes: Number.isSafeInteger(storageBytes) && storageBytes > 0 ? storageBytes : null,
    provider: row.provider as BillingProvider,
    market: metadata.market === "indonesia" ? "indonesia" : "global",
    renewal: metadata.renewal === "manual" ? "manual" : "automatic",
    variantId: row.providerPriceId,
  };
}

export async function listCreditProducts(market: BillingMarket = "global"): Promise<CreditProduct[]> {
  const provider: BillingProvider = market === "indonesia" ? "mayar" : "lemonsqueezy";
  const rows = await db
    .select()
    .from(creditProducts)
    .where(
      and(
        eq(creditProducts.provider, provider),
        eq(creditProducts.active, true),
        sql`coalesce(${creditProducts.metadata}->>'market', 'global') = ${market}`,
        sql`(${creditProducts.provider} <> 'lemonsqueezy' OR coalesce((${creditProducts.metadata}->>'testMode')::boolean, true) = ${lemonSqueezyTestMode()})`,
        sql`coalesce((${creditProducts.metadata}->>'hidden')::boolean, false) = false`,
      ),
    )
    .orderBy(creditProducts.amountMinor, creditProducts.credits);
  return rows.map(parseProduct);
}

export async function getCreditProduct(id: string, market?: BillingMarket): Promise<CreditProduct> {
  const marketFilter = market
    ? sql`coalesce(${creditProducts.metadata}->>'market', 'global') = ${market}`
    : sql`true`;
  const rows = await db
    .select()
    .from(creditProducts)
    .where(
      and(
        eq(creditProducts.id, id),
        eq(creditProducts.active, true),
        marketFilter,
        sql`(${creditProducts.provider} <> 'lemonsqueezy' OR coalesce((${creditProducts.metadata}->>'testMode')::boolean, true) = ${lemonSqueezyTestMode()})`,
      ),
    )
    .limit(1);
  const row = rows[0];
  if (!row) throw billingError("Credit pack not found", 404);
  return parseProduct(row);
}

export async function getCreditProductByVariant(
  provider: BillingProvider,
  variantId: string,
): Promise<CreditProduct | null> {
  const row = await db.query.creditProducts.findFirst({
    where: and(
      eq(creditProducts.provider, provider),
      eq(creditProducts.providerPriceId, variantId),
      eq(creditProducts.active, true),
    ),
  });
  return row ? parseProduct(row) : null;
}

export async function listBillingPlans(market: BillingMarket = "global"): Promise<BillingPlan[]> {
  const products = await listCreditProducts(market);
  return products
    .filter((item): item is CreditProduct & { planKey: PaidPlanKey } =>
      item.productType === "subscription" && item.planKey !== null,
    )
    .map((item) => ({
      key: item.planKey,
      name: item.name,
      credits: item.credits,
      amountMinor: item.amountMinor,
      currency: item.currency,
      productId: item.id,
      provider: item.provider,
      market: item.market,
      renewal: item.renewal,
    }));
}

export async function listTopUpProducts(market: BillingMarket = "global") {
  return (await listCreditProducts(market)).filter((item) => item.productType === "topup");
}

export async function listStorageAddonProducts(market: BillingMarket = "global") {
  return (await listCreditProducts(market)).filter((item) => item.productType === "storage_addon");
}

export async function listPromoProducts(market: BillingMarket = "indonesia"): Promise<CreditProduct[]> {
  const provider: BillingProvider = market === "indonesia" ? "mayar" : "lemonsqueezy";
  const rows = await db
    .select()
    .from(creditProducts)
    .where(
      and(
        eq(creditProducts.provider, provider),
        eq(creditProducts.active, true),
        sql`coalesce(${creditProducts.metadata}->>'market', 'global') = ${market}`,
        sql`coalesce((${creditProducts.metadata}->>'hidden')::boolean, false) = true`,
        sql`coalesce(${creditProducts.metadata}->>'purpose', '') = 'productionTest'`,
      ),
    )
    .orderBy(creditProducts.amountMinor, creditProducts.credits);
  return rows.map(parseProduct);
}

export function applyPromoCatalog(catalog: {
  plans: BillingPlan[];
  topups: CreditProduct[];
  storageAddons: CreditProduct[];
}, promo: CreditProduct[]) {
  const promoPlans = promo.filter(
    (item): item is CreditProduct & { planKey: PaidPlanKey } =>
      item.productType === "subscription" && item.planKey !== null,
  );
  const promoTopups = promo.filter((item) => item.productType === "topup");
  return {
    plans: catalog.plans.map((plan) => {
      const override = promoPlans.find((item) => item.planKey === plan.key);
      if (!override) return plan;
      return {
        ...plan,
        credits: override.credits,
        amountMinor: override.amountMinor,
        currency: override.currency,
        productId: override.id,
        provider: override.provider,
        market: override.market,
        renewal: override.renewal,
      };
    }),
    topups: promoTopups.length ? promoTopups : catalog.topups,
    storageAddons: catalog.storageAddons,
  };
}

export async function getIdrExchangeRate(): Promise<number> {
  const { billingSettings } = await import("@/db/schema");
  const row = await db.query.billingSettings.findFirst({
    where: eq(billingSettings.key, "pricing.idr"),
  });
  const usdToIdr = Number(row?.value?.usdToIdr);
  return Number.isFinite(usdToIdr) && usdToIdr > 0 ? usdToIdr : 15000;
}

export function isPaidPlan(plan: PlanKey): plan is PaidPlanKey {
  return plan === "plus" || plan === "pro";
}
