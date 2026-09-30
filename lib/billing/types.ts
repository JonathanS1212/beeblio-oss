import type { PlanKey } from "@/lib/entitlements/plans";

export type BillingMarket = "global" | "indonesia";
export type BillingProvider = "lemonsqueezy" | "mayar";
export type BillingProductType = "subscription" | "topup" | "storage_addon";
export type BillingRenewal = "automatic" | "manual";
export type PaidPlanKey = Exclude<PlanKey, "free">;

export type CreditProduct = {
  id: string;
  name: string;
  credits: number;
  amountMinor: number;
  currency: string;
  productType: BillingProductType;
  planKey: PaidPlanKey | null;
  storageBytes: number | null;
  provider: BillingProvider;
  market: BillingMarket;
  renewal: BillingRenewal;
  variantId: string;
};

export type BillingPlan = {
  key: PaidPlanKey;
  name: string;
  credits: number;
  amountMinor: number;
  currency: string;
  productId: string;
  provider: BillingProvider;
  market: BillingMarket;
  renewal: BillingRenewal;
};

export type BillingSummary = {
  plan: PlanKey;
  subscriptionProvider: BillingProvider | null;
  subscriptionStatus: string | null;
  currentPeriodEnd: string | null;
  cancelAtPeriodEnd: boolean;
};

export type CheckoutResponse = {
  checkoutUrl: string;
};

export type MarketCatalog = {
  plans: BillingPlan[];
  topups: CreditProduct[];
  storageAddons: CreditProduct[];
};
