import { sql } from "drizzle-orm";

import { db } from "@/db";
import { creditLedger } from "@/db/schema";
import { firstRow } from "./db-result";
import type { CostDetails } from "./types";

type UsageRow = {
  balance: number;
  reserved: number;
  charged: number;
  recorded: boolean;
};

export async function recordFreeUsage(input: {
  userId: string;
  reservationId?: string;
  idempotencyKey: string;
  reason: string;
  source: string;
  sessionId: string;
  turnId: string;
  callId?: string;
  details: CostDetails;
}) {
  return db
    .insert(creditLedger)
    .values({
      userId: input.userId,
      delta: 0,
      type: "usage",
      reason: input.reason,
      source: input.source,
      costDetails: input.details,
      sessionId: input.sessionId,
      turnId: input.turnId,
      callId: input.callId,
      reservationId: input.reservationId,
      idempotencyKey: input.idempotencyKey,
    })
    .onConflictDoNothing({ target: creditLedger.idempotencyKey });
}

export async function recordReservedUsage(input: {
  reservationId: string;
  idempotencyKey: string;
  credits: number;
  reason: string;
  source: string;
  sessionId: string;
  turnId: string;
  callId?: string;
  details: CostDetails;
}) {
  if (input.credits <= 0) return;
  return firstRow<UsageRow>(
    await db.execute(sql`
      select * from app.record_reserved_credit_usage(
        ${input.reservationId}::uuid,
        ${input.credits},
        ${input.idempotencyKey},
        ${input.reason},
        ${input.source},
        ${input.sessionId},
        ${input.turnId},
        ${input.callId ?? null},
        ${JSON.stringify(input.details)}::jsonb
      )
    `),
  );
}

export async function recordDirectUsage(input: {
  userId: string;
  idempotencyKey: string;
  credits: number;
  reason: string;
  source: string;
  sessionId?: string;
  turnId?: string;
  callId?: string;
  details: CostDetails;
}) {
  if (input.credits <= 0) return;
  return firstRow<UsageRow>(
    await db.execute(sql`
      select * from app.record_direct_credit_usage(
        ${input.userId},
        ${input.credits},
        ${input.idempotencyKey},
        ${input.reason},
        ${input.source},
        ${input.sessionId ?? null},
        ${input.turnId ?? null},
        ${input.callId ?? null},
        ${JSON.stringify(input.details)}::jsonb
      )
    `),
  );
}
