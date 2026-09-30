import "server-only";

import { eq } from "drizzle-orm";

import { db } from "@/db";
import { userBillingProfiles } from "@/db/schema";

import { billingError } from "./http";

export function normalizeIndonesianMobile(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const normalized = value.replace(/[\s()+-]/g, "").replace(/^0/, "62");
  return /^62\d{8,13}$/.test(normalized) ? normalized : null;
}

export async function getBillingMobile(userId: string): Promise<string> {
  const row = await db.query.userBillingProfiles.findFirst({
    where: eq(userBillingProfiles.userId, userId),
  });
  return row?.mobile ?? "";
}

/**
 * Best-known Indonesian mobile for Mayar checkout. The phone on the Neon Auth
 * user (edited at /account) is canonical; the billing profile row remains as
 * the fallback for numbers collected before that field was used.
 */
export async function getMayarMobile(user: {
  id: string;
  phoneNumber?: string | null;
}): Promise<string> {
  return (
    normalizeIndonesianMobile(user.phoneNumber) ??
    (await getBillingMobile(user.id))
  );
}

export async function updateBillingMobile(userId: string, mobile: unknown): Promise<string> {
  const normalized = normalizeIndonesianMobile(mobile);
  if (!normalized) {
    throw billingError("Enter a valid Indonesian mobile number", 400);
  }
  await db
    .insert(userBillingProfiles)
    .values({ userId, mobile: normalized })
    .onConflictDoUpdate({
      target: userBillingProfiles.userId,
      set: { mobile: normalized, updatedAt: new Date() },
    });
  return normalized;
}
