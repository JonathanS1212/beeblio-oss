import { createNeonAuth } from "@neondatabase/auth/next/server";

/**
 * Server-side Neon Auth singleton.
 *
 * Used by React Server Components, server actions, route handlers, and the
 * proxy. Requires NEON_AUTH_BASE_URL and NEON_AUTH_COOKIE_SECRET (>= 32 chars)
 * in the environment; createNeonAuth throws otherwise.
 */
export const auth = createNeonAuth({
  baseUrl: process.env.NEON_AUTH_BASE_URL!,
  cookies: {
    secret: process.env.NEON_AUTH_COOKIE_SECRET!,
    // 'lax' (not the SDK default 'strict') is required for OAuth. The challenge
    // and session cookies must travel on the top-level cross-site redirect that
    // returns from Neon Auth so the verifier exchange can run. With 'strict',
    // the neon_auth_session_challenge cookie is withheld on that redirect and
    // login silently bounces back to /auth/sign-in.
    sameSite: "lax",
  },
});
