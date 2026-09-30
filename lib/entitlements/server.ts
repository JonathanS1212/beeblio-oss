import { cache } from "react";
import { redirect } from "next/navigation";

import { getUser } from "@/lib/auth/session";
import { getUserEntitlements, isUserAdmin, type UserEntitlements } from "./user";

/**
 * Next.js-side entitlement resolution. React `cache()` dedupes lookups within
 * one request; the underlying user.ts module stays framework-free for the eve
 * agent to import.
 */
export const getEntitlements = cache(
  async (userId: string): Promise<UserEntitlements> => getUserEntitlements(userId),
);

export const getIsAdmin = cache(async (userId: string): Promise<boolean> =>
  isUserAdmin(userId),
);

/**
 * Admin gate for /admin routes: requires a signed-in user with the admin role
 * (ADMIN_USER_IDS env or an app.user_roles row). Non-admins are redirected to
 * the workspace without revealing that the console exists.
 */
export async function requireAdmin() {
  const user = await getUser();
  if (!user) redirect("/login");
  if (!(await isUserAdmin(user.id))) redirect("/workspace");
  return user;
}
