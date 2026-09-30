import { auth } from "@/lib/auth/server";

// Proxies all Neon Auth / Better Auth client calls to the Neon Auth server.
export const { GET, POST } = auth.handler();
