import { createHmac, timingSafeEqual } from "node:crypto";

import { integerEnv } from "@/lib/env-config";

type AccessClaims = {
  aud: "office-viewer-file";
  userId: string;
  projectId: string;
  path: string;
  exp: number;
};

const ACCESS_TOKEN_TTL_SECONDS = integerEnv(
  "OFFICE_VIEWER_ACCESS_TOKEN_TTL_SECONDS",
  60 * 60 * 12,
  60,
);

export function officeViewerPublicOrigin(requestUrl: string) {
  const configured = process.env.OFFICE_VIEWER_PUBLIC_ORIGIN?.trim();
  return new URL(configured || requestUrl).origin;
}

function secret() {
  // Keep the old name as a deployment-safe migration fallback. It can be
  // removed after OFFICE_VIEWER_SECRET is configured in every environment.
  const value = (
    process.env.OFFICE_VIEWER_SECRET || process.env.ONLYOFFICE_JWT_SECRET
  )?.trim();
  if (!value) throw new Error("OFFICE_VIEWER_SECRET is not configured");
  return value;
}

function encode(value: object) {
  return Buffer.from(JSON.stringify(value)).toString("base64url");
}

function signature(input: string) {
  return createHmac("sha256", secret()).update(input).digest("base64url");
}

export function signOfficeViewerAccess(
  claims: Omit<AccessClaims, "exp">,
  lifetimeSeconds = ACCESS_TOKEN_TTL_SECONDS,
) {
  const payload = {
    ...claims,
    exp: Math.floor(Date.now() / 1000) + lifetimeSeconds,
  };
  const input = `${encode({ alg: "HS256", typ: "JWT" })}.${encode(payload)}`;
  return `${input}.${signature(input)}`;
}

export function verifyOfficeViewerAccess(token: string): AccessClaims {
  const parts = token.split(".");
  if (parts.length !== 3) throw new Error("Invalid Office viewer access token");
  const input = `${parts[0]}.${parts[1]}`;
  const actual = Buffer.from(parts[2]);
  const expected = Buffer.from(signature(input));
  if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) {
    throw new Error("Invalid Office viewer access token");
  }
  const claims = JSON.parse(
    Buffer.from(parts[1], "base64url").toString("utf8"),
  ) as AccessClaims;
  if (
    claims.aud !== "office-viewer-file" ||
    claims.exp <= Math.floor(Date.now() / 1000)
  ) {
    throw new Error("Expired or invalid Office viewer access token");
  }
  if (!claims.userId || !claims.projectId || !claims.path) {
    throw new Error("Incomplete Office viewer access token");
  }
  return claims;
}
