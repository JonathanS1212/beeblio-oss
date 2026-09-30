import { redirect } from "next/navigation";
import { connection } from "next/server";

import { auth } from "@/lib/auth/server";

/**
 * Stops static prerendering before the Neon Auth SDK touches cookies. The SDK
 * wraps its cookie read in a try/catch that logs Next's DYNAMIC_SERVER_USAGE
 * bailout as a scary "Cookie validation error" warning during `next build`;
 * bailing out here instead keeps the switch to dynamic rendering silent.
 */
async function ensureRequestContext() {
  await connection();
}

/**
 * Returns the signed-in Neon Auth user, or redirects to /login.
 * Use in server components and server actions (the proxy already guards pages,
 * but this is the authoritative check for data access).
 */
export async function requireUser() {
  const user = await getUser();
  if (!user) redirect("/login");
  return user;
}

/**
 * Returns the signed-in Neon Auth user or null. Never redirects.
 * Use in route handlers that should respond with 401 rather than redirect.
 */
export async function getUser() {
  await ensureRequestContext();

  const { cookies } = await import("next/headers");
  const cookieStore = await cookies();
  const hasSession = cookieStore.getAll().some((c) =>
    c.name.includes("session_token") || c.name.startsWith("neon_auth_")
  );

  if (!hasSession) {
    return null;
  }

  try {
    const { data } = await auth.getSession();
    return data?.user ?? null;
  } catch (error: any) {
    if (error?.message?.includes("Cookies can only be modified")) {
      return null;
    }
    throw error;
  }
}

