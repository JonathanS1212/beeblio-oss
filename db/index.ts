import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";

import * as schema from "./schema";

if (!process.env.DATABASE_URL) {
  throw new Error(
    "DATABASE_URL is not set. Add it to .env.local (see .env.example).",
  );
}

/**
 * The single Drizzle client for the application database.
 *
 * DATABASE_URL is a Neon pooled connection string. The neon() HTTP client is
 * stateless and works in both the Next.js server runtime and the long-lived eve
 * agent VM, so one client serves the whole split stack.
 */
const queryClient = neon(process.env.DATABASE_URL);

export const db = drizzle(queryClient, { schema });

export { schema };
