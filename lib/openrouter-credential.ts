import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { userOpenRouterCredentials } from "@/db/schema";

const VERSION = 1;

function masterKey() {
  const raw = process.env.BYOK_ENCRYPTION_KEY;
  if (!raw) throw new Error("BYOK_ENCRYPTION_KEY is not configured");
  const key = Buffer.from(raw, "base64");
  if (key.length !== 32) throw new Error("BYOK_ENCRYPTION_KEY must be a base64-encoded 32-byte key");
  return key;
}

function aad(userId: string) {
  return Buffer.from(`beeblio:openrouter:${userId}:v${VERSION}`, "utf8");
}

export function encryptOpenRouterKey(userId: string, apiKey: string) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", masterKey(), iv);
  cipher.setAAD(aad(userId));
  const encrypted = Buffer.concat([cipher.update(apiKey, "utf8"), cipher.final()]);
  return {
    encryptedKey: encrypted.toString("base64"),
    iv: iv.toString("base64"),
    authTag: cipher.getAuthTag().toString("base64"),
    keyVersion: VERSION,
    maskedKey: `${apiKey.slice(0, 8)}…${apiKey.slice(-4)}`,
  };
}

export function decryptOpenRouterKey(userId: string, row: { encryptedKey: string; iv: string; authTag: string; keyVersion: number }) {
  if (row.keyVersion !== VERSION) throw new Error("Unsupported credential encryption version");
  const decipher = createDecipheriv("aes-256-gcm", masterKey(), Buffer.from(row.iv, "base64"));
  decipher.setAAD(aad(userId));
  decipher.setAuthTag(Buffer.from(row.authTag, "base64"));
  return Buffer.concat([
    decipher.update(Buffer.from(row.encryptedKey, "base64")),
    decipher.final(),
  ]).toString("utf8");
}

export async function getOpenRouterCredential(userId: string) {
  return db.query.userOpenRouterCredentials.findFirst({
    where: eq(userOpenRouterCredentials.userId, userId),
  });
}

// The eve agent service resolves the BYOK key on every model step
// (agent/agent.ts), and the web app resolves it per suggestion/equation
// request; this cache keeps the DB read + AES-GCM decrypt off those hot paths.
// Only successful decrypts are cached, so a user without a credential never
// has a cached miss block the turn that immediately follows connecting a key.
// Rotation can serve a stale key for at most the TTL in the eve service — a
// separate deployment from the routes that write credentials, so
// invalidation there cannot reach it; the failure mode is an OpenRouter 401
// on one turn, not a billing or security issue.
const DECRYPTED_KEY_CACHE_TTL_MS = 60_000;
const decryptedKeyCache = new Map<string, { expiresAt: number; value: string }>();

export function invalidateOpenRouterKeyCache(userId: string) {
  decryptedKeyCache.delete(userId);
}

export async function getDecryptedOpenRouterKey(userId: string): Promise<string | null> {
  const cached = decryptedKeyCache.get(userId);
  if (cached && cached.expiresAt > Date.now()) return cached.value;

  const row = await getOpenRouterCredential(userId);
  if (!row) return null;

  const apiKey = decryptOpenRouterKey(userId, row);
  decryptedKeyCache.set(userId, {
    expiresAt: Date.now() + DECRYPTED_KEY_CACHE_TTL_MS,
    value: apiKey,
  });
  return apiKey;
}
