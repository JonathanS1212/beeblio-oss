import type { CreditWarningActionCounts, CreditWarningLevel } from "./types.ts";

export function estimatedCreditActions(spendable: number, reservationAmount: number) {
  if (reservationAmount <= 0) return 0;
  return Math.max(0, Math.floor(Math.max(0, spendable) / reservationAmount));
}

export function creditWarningLevel({
  balance,
  spendable,
  reservationAmount,
  thresholds,
}: {
  balance: number;
  spendable: number;
  reservationAmount: number;
  thresholds: CreditWarningActionCounts;
}): CreditWarningLevel {
  if (balance <= 0) return "empty";

  const actionsRemaining = estimatedCreditActions(spendable, reservationAmount);
  if (actionsRemaining === 0) return "blocked";
  if (actionsRemaining <= thresholds.urgent) return "urgent";
  if (actionsRemaining <= thresholds.warning) return "warning";
  if (actionsRemaining <= thresholds.notice) return "notice";
  return "normal";
}
