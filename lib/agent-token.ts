import { createHmac } from "node:crypto";
import { integerEnv } from "@/lib/env-config";
import { localAgentSecret } from "@/lib/local-secret";

/**
 * Short-lived HS256 JWT minted by the Next.js /eve proxy after it verifies the
 * Neon Auth session. The eve channel (agent/channels/eve.ts) verifies it with
 * the same EVE_AUTH_SECRET, so the agent backend trusts the same user id
 * (the JWT `sub`) without ever seeing Neon Auth credentials.
 *
 * Issued with a 60s lifetime because the proxy mints one per request.
 */

const ISSUER = "beeblio";
const AUDIENCE = "beeblio-agent";
const TTL_SECONDS = integerEnv("AGENT_TOKEN_TTL_SECONDS", 60, 5);

function b64url(value: string): string {
  return Buffer.from(value).toString("base64url");
}

export function mintAgentToken(userId: string): string {
  const secret = localAgentSecret();

  const header = b64url(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const now = Math.floor(Date.now() / 1000);
  const payload = b64url(
    JSON.stringify({
      iss: ISSUER,
      aud: AUDIENCE,
      sub: userId,
      iat: now,
      exp: now + TTL_SECONDS,
    }),
  );
  const data = `${header}.${payload}`;
  const signature = createHmac("sha256", secret).update(data).digest("base64url");
  return `${data}.${signature}`;
}
