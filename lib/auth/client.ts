"use client";

import { createAuthClient } from "@neondatabase/auth/next";

/**
 * Browser auth client. Talks same-origin to the /api/auth route handler, which
 * proxies to Neon Auth. Provides useSession(), signIn.social(), signOut(), ...
 */
export const authClient = createAuthClient();
