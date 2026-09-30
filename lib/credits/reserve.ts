import { sql } from "drizzle-orm";

import { db } from "@/db";
import { getCreditsConfig } from "./catalog";
import { firstRow } from "./db-result";
import { ensurePlanCredits } from "./grant";
import { getUserPlan } from "@/lib/entitlements/user";
import type { ExecutionClass } from "./types";

type ReservationRow = {
  reservation_id: string;
  amount: number;
  balance: number;
  reserved: number;
  status: string;
};

export class InsufficientCreditsError extends Error {
  readonly status = 402;

  constructor(
    readonly required: number,
    readonly available: number,
  ) {
    super("Not enough available usage to start this request.");
    this.name = "InsufficientCreditsError";
  }
}

export class FreeTurnLimitError extends Error {
  readonly status = 429;
  constructor(readonly code: "free_active_turn_limit" | "free_daily_turn_limit") {
    super(code === "free_active_turn_limit"
      ? "Wait for your current turn to finish before starting another."
      : "You have reached today's free turn limit.");
  }
}

export function parseExecutionClass(value: string | null | undefined): ExecutionClass {
  return value === "economy" || value === "deep" || value === "standard"
    ? value
    : getCreditsConfig().defaultExecutionClass;
}

export async function expireReservations(userId?: string) {
  await db.execute(sql`select app.expire_credit_reservations(${userId ?? null})`);
}

export async function reserveCredits(input: {
  userId: string;
  requestId: string;
  executionClass: ExecutionClass;
}) {
  const config = getCreditsConfig();
  if (!config.enabled) return null;

  // Allowance settling is memoized per user (see grant.ts); expiry of stale
  // reservations runs inside app.reserve_credits itself
  // (drizzle/0012_reserve_credits_fold_expire.sql), keeping this hot path at a
  // single DB round trip.
  await ensurePlanCredits(input.userId);

  const amount = config.reservationAmounts[input.executionClass];
  const expiresAt = new Date(Date.now() + config.reservationTtlSeconds * 1_000);
  const idempotencyKey = `turn-request:${input.userId}:${input.requestId}`;
  const free = (await getUserPlan(input.userId)) === "free";
  let row: ReservationRow | undefined;
  try {
    row = firstRow<ReservationRow>(await db.execute(free
      ? sql`select * from app.reserve_free_credits(${input.userId}, ${amount}, ${input.executionClass}, ${idempotencyKey}, ${expiresAt}, 20)`
      : sql`select * from app.reserve_credits(${input.userId}, ${amount}, ${input.executionClass}, ${idempotencyKey}, ${expiresAt})`));
  } catch (error) {
    const message = String((error as Error).message);
    if (message.includes("free_active_turn_limit")) throw new FreeTurnLimitError("free_active_turn_limit");
    if (message.includes("free_daily_turn_limit")) throw new FreeTurnLimitError("free_daily_turn_limit");
    throw error;
  }

  if (!row) {
    const available = firstRow<{ spendable: number }>(
      await db.execute(sql`
        select greatest(0, balance - reserved)::integer as spendable
        from app.user_credits
        where user_id = ${input.userId}
      `),
    )?.spendable ?? 0;
    throw new InsufficientCreditsError(amount, available);
  }

  return {
    id: row.reservation_id,
    amount: row.amount,
    balance: row.balance,
    reserved: row.reserved,
    status: row.status,
    executionClass: input.executionClass,
  };
}

export async function attachReservation(
  reservationId: string,
  sessionId: string,
  turnId: string,
) {
  await db.execute(sql`
    update app.credit_reservations
    set session_id = coalesce(session_id, ${sessionId}),
        turn_id = coalesce(turn_id, ${turnId}),
        updated_at = now()
    where id = ${reservationId}::uuid and status = 'active'
  `);
}

export async function findActiveReservation(userId: string, sessionId: string) {
  await expireReservations(userId);
  return firstRow<{ id: string; execution_class: ExecutionClass }>(
    await db.execute(sql`
      select id, execution_class
      from app.credit_reservations
      where user_id = ${userId}
        and session_id = ${sessionId}
        and status = 'active'
        and expires_at > now()
      order by created_at desc
      limit 1
    `),
  );
}

export async function finishReservation(
  reservationId: string,
  outcome: "completed" | "failed" | "cancelled" | "proxy_error",
) {
  return firstRow<{ balance: number; reserved: number; released: number }>(
    await db.execute(sql`
      select * from app.finish_credit_reservation(${reservationId}::uuid, ${outcome})
    `),
  );
}
