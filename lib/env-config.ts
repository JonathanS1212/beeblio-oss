/**
 * Shared env parsing for product/operational limits. Mirrors the semantics of
 * lib/credits/catalog.ts: integer env vars fall back to a default and fail
 * loudly on invalid values. Kept dependency-free so both the Next.js app and
 * the eve agent bundle can import it.
 */
export function integerEnv(name: string, fallback: number, minimum = 0): number {
  const raw = process.env[name]?.trim();
  if (!raw) return fallback;
  const value = Number(raw);
  if (!Number.isSafeInteger(value) || value < minimum) {
    throw new Error(`${name} must be an integer greater than or equal to ${minimum}.`);
  }
  return value;
}
