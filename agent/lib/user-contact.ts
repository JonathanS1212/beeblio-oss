import { sql } from "drizzle-orm";
import { db } from "@/db";

/**
 * The user's contact email from their Neon Auth identity, used as the
 * OpenAlex polite-pool address by host-side data tools. Cached for the
 * process (emails effectively never change mid-session) and failure-safe:
 * lookup problems degrade to anonymous requests, never a tool error.
 */
const emailCache = new Map<string, string | null>();
const emailPattern = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

export async function getUserContactEmail(
  principalId: string | undefined,
): Promise<string | null> {
  if (!principalId) return null;
  const cached = emailCache.get(principalId);
  if (cached !== undefined) return cached;
  try {
    const result = await db.execute(
      sql`select email from neon_auth.user where id = ${principalId}::uuid limit 1`,
    );
    const rows = (
      result && typeof result === "object" && "rows" in result ? result.rows : []
    ) as Array<{ email?: unknown }>;
    const email = typeof rows[0]?.email === "string" ? rows[0].email.trim() : "";
    const valid = emailPattern.test(email) ? email : null;
    emailCache.set(principalId, valid);
    return valid;
  } catch {
    // Transient lookup failures are not cached; the next call retries.
    return null;
  }
}
