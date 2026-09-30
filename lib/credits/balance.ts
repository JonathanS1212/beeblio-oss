import { and, desc, eq, gte, or, type SQL } from "drizzle-orm";

import { db } from "@/db";
import { agentSessions, creditLedger, projects, userCredits } from "@/db/schema";
import { getUserEntitlements } from "@/lib/entitlements/user";
import { getCreditsConfig } from "./catalog";
import { ensurePlanCredits } from "./grant";
import { expireReservations } from "./reserve";
import { creditWarningLevel, estimatedCreditActions } from "./status";
import type {
  CreditGrantKind,
  CreditSummary,
  CreditUsageCategory,
  CreditUsageItem,
} from "./types";

export async function getCreditSummary(userId: string): Promise<CreditSummary> {
  const config = getCreditsConfig();
  if (!config.enabled) {
    return {
      enabled: false,
      balance: 0,
      includedBalance: 0,
      topupBalance: 0,
      reserved: 0,
      spendable: 0,
      totalGranted: 0,
      totalUsed: 0,
      currentAllowance: 0,
      remainingPercentage: 100,
      estimatedActionsRemaining: 0,
      warningLevel: "normal",
    };
  }

  await ensurePlanCredits(userId);
  await expireReservations(userId);
  const row = await db.query.userCredits.findFirst({
    where: eq(userCredits.userId, userId),
  });
  const balance = row?.balance ?? 0;
  const reserved = row?.reserved ?? 0;
  const spendable = Math.max(0, balance - reserved);
  // Plan-aware denominator: paid plans reference their monthly allowance; free
  // references the one-time signup allowance (docs/entitlements-plan.md §7).
  const entitlements = await getUserEntitlements(userId);
  const currentAllowance =
    entitlements.monthlyCredits > 0 ? entitlements.monthlyCredits : config.trialAllowance;
  const reservationAmount = config.reservationAmounts[config.defaultExecutionClass];
  const estimatedActionsRemaining = estimatedCreditActions(spendable, reservationAmount);
  const remainingPercentage = currentAllowance > 0
    ? Math.max(0, Math.min(100, Math.round((Math.max(0, balance) / currentAllowance) * 100)))
    : balance > 0 ? 100 : 0;

  return {
    enabled: true,
    balance,
    includedBalance: row?.includedBalance ?? 0,
    topupBalance: row?.topupBalance ?? 0,
    reserved,
    spendable,
    totalGranted: row?.totalGranted ?? 0,
    totalUsed: row?.totalUsed ?? 0,
    currentAllowance,
    remainingPercentage,
    estimatedActionsRemaining,
    warningLevel: creditWarningLevel({
      balance,
      spendable,
      reservationAmount,
      thresholds: config.warningActionCounts,
    }),
  };
}

/** Spendable credits for pre-flight affordability checks in costly tools. */
export async function getSpendableCredits(userId: string): Promise<number> {
  const row = await db.query.userCredits.findFirst({
    where: eq(userCredits.userId, userId),
  });
  if (!row) return 0;
  return Math.max(0, row.balance - row.reserved);
}

// Date-windowed usage queries (usage-mix periods) cap rows so a heavy user
// cannot produce an unbounded payload; feed-style callers stay limit-based.
const usageWindowRowCap = 500;

export async function getRecentCreditUsage(
  userId: string,
  options: { since?: Date } = {},
): Promise<CreditUsageItem[]> {
  const limit = options.since ? usageWindowRowCap : getCreditsConfig().historyLimit;
  const rows = await selectRecentLedgerRows(userId, limit, eq(creditLedger.type, "usage"), options.since);
  return rows.map((row) => ({
    id: row.id,
    credits: Math.abs(row.delta),
    category: categoryFrom(row.reason, row.costDetails),
    reason: row.reason,
    sessionId: row.sessionId,
    projectName: row.projectName,
    conversationName: row.conversationName,
    createdAt: row.createdAt.toISOString(),
    modelSource: modelSourceFrom(row.costDetails),
  }));
}

/**
 * Settled usage plus all credit grants (top-ups, plan allowances, sign-up
 * bonus), newest first. Used by activity feeds that should show increases and
 * decreases; usage-mix metrics keep using getRecentCreditUsage so grants never
 * skew category shares.
 */
export async function getRecentCreditActivity(
  userId: string,
  options: { limit?: number } = {},
): Promise<CreditUsageItem[]> {
  const limit = options.limit ?? getCreditsConfig().historyLimit;
  const rows = await selectRecentLedgerRows(
    userId,
    limit,
    or(
      eq(creditLedger.type, "usage"),
      eq(creditLedger.type, "grant"),
    ),
  );
  return rows.map((row) => ({
    id: row.id,
    credits: Math.abs(row.delta),
    category: categoryFrom(row.reason, row.costDetails),
    reason: row.reason,
    sessionId: row.sessionId,
    projectName: row.projectName,
    conversationName: row.conversationName,
    createdAt: row.createdAt.toISOString(),
    ...(row.type === "grant" ? { grant: grantKindFrom(row.reason) } : { modelSource: modelSourceFrom(row.costDetails) }),
  }));
}

function modelSourceFrom(details: unknown): string | undefined {
  if (details && typeof details === "object" && "modelSource" in details) {
    const value = (details as { modelSource?: unknown }).modelSource;
    if (typeof value === "string" && value) return value;
  }
  return undefined;
}

function grantKindFrom(reason: string | null): CreditGrantKind {
  if (reason === "topup" || reason === "plan_allowance" || reason === "signup_bonus") return reason;
  return "other";
}

async function selectRecentLedgerRows(
  userId: string,
  limit: number,
  filter: SQL<unknown> | undefined,
  since?: Date,
) {
  return db
    .select({
      id: creditLedger.id,
      type: creditLedger.type,
      delta: creditLedger.delta,
      reason: creditLedger.reason,
      costDetails: creditLedger.costDetails,
      sessionId: creditLedger.sessionId,
      projectName: projects.name,
      conversationName: agentSessions.title,
      createdAt: creditLedger.createdAt,
    })
    .from(creditLedger)
    .leftJoin(agentSessions, eq(creditLedger.sessionId, agentSessions.eveSessionId))
    .leftJoin(
      projects,
      and(eq(agentSessions.projectId, projects.id), eq(projects.userId, userId)),
    )
    .where(and(eq(creditLedger.userId, userId), filter, since ? gte(creditLedger.createdAt, since) : undefined))
    .orderBy(desc(creditLedger.createdAt))
    .limit(limit);
}

function categoryFrom(reason: string | null, details: unknown): CreditUsageCategory {
  if (details && typeof details === "object" && "category" in details) {
    const category = (details as { category?: unknown }).category;
    if (category === "model" || category === "compute" || category === "search" || category === "knowledge" || category === "transcription" || category === "vision") {
      return category;
    }
  }
  if (reason?.includes("sandbox") || reason?.includes("compute")) return "compute";
  if (reason?.includes("vision")) return "vision";
  if (reason?.includes("knowledge")) return "knowledge";
  if (reason?.includes("search") || reason?.includes("fetch")) return "search";
  if (reason?.includes("transcri")) return "transcription";
  if (reason?.includes("model") || reason === "turn") return "model";
  return "other";
}
