import type { PaidPlanKey } from "./types";

export type PendingPlanChange = {
  direction: "upgrade";
  fromPlanKey: PaidPlanKey;
  fromVariantId: string;
  toPlanKey: PaidPlanKey;
  toVariantId: string;
  requestedAt: string;
  state?: "awaiting_payment" | "payment_failed";
};

export function pendingPlanChange(value: unknown): PendingPlanChange | null {
  if (!value || typeof value !== "object") return null;
  const item = value as Record<string, unknown>;
  const plans = ["plus", "pro"];
  if (
    item.direction !== "upgrade" ||
    !plans.includes(String(item.fromPlanKey)) ||
    !plans.includes(String(item.toPlanKey)) ||
    typeof item.fromVariantId !== "string" ||
    typeof item.toVariantId !== "string" ||
    typeof item.requestedAt !== "string"
  ) {
    return null;
  }
  return item as PendingPlanChange;
}

export type SubscriptionWebhookAction =
  | "lifecycle"
  | "upgrade_paid"
  | "upgrade_failed"
  | "renewal_paid"
  | "ignore";

export function subscriptionWebhookAction(
  eventName: string,
  billingReason: unknown,
): SubscriptionWebhookAction {
  if (
    [
      "subscription_created",
      "subscription_updated",
      "subscription_cancelled",
      "subscription_resumed",
      "subscription_paused",
      "subscription_unpaused",
      "subscription_expired",
    ].includes(eventName)
  ) {
    return "lifecycle";
  }
  if (eventName === "subscription_payment_success" && billingReason === "updated") return "upgrade_paid";
  if (eventName === "subscription_payment_success" && billingReason === "renewal") return "renewal_paid";
  if (eventName === "subscription_payment_failed" && billingReason === "updated") return "upgrade_failed";
  return "ignore";
}
