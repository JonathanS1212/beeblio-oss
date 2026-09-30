import "server-only";

import { and, eq } from "drizzle-orm";

import { db } from "@/db";
import { billingEvents } from "@/db/schema";

import type { BillingProvider } from "./types";

export async function claimBillingEvent(input: {
  provider: BillingProvider;
  eventId: string;
  eventType: string;
  userId?: string | null;
  payload: Record<string, unknown>;
}): Promise<{ duplicate: boolean }> {
  const inserted = await db
    .insert(billingEvents)
    .values({
      provider: input.provider,
      providerEventId: input.eventId,
      eventType: input.eventType,
      userId: input.userId ?? null,
      payload: input.payload,
    })
    .onConflictDoNothing({
      target: [billingEvents.provider, billingEvents.providerEventId],
    })
    .returning({ id: billingEvents.id });

  if (inserted[0]) return { duplicate: false };

  const existing = await db.query.billingEvents.findFirst({
    where: and(
      eq(billingEvents.provider, input.provider),
      eq(billingEvents.providerEventId, input.eventId),
    ),
  });
  if (existing?.processedAt) return { duplicate: true };
  return { duplicate: false };
}

export async function markBillingEventProcessed(input: {
  provider: BillingProvider;
  eventId: string;
  userId?: string | null;
}) {
  await db
    .update(billingEvents)
    .set({
      userId: input.userId ?? null,
      processedAt: new Date(),
    })
    .where(
      and(
        eq(billingEvents.provider, input.provider),
        eq(billingEvents.providerEventId, input.eventId),
      ),
    );
}
