import dotenv from "dotenv";
import { defineConfig } from "drizzle-kit";

// Next.js keeps secrets in .env.local; drizzle-kit only auto-loads .env, so
// load .env.local explicitly to pick up DATABASE_URL for push/migrate/studio.
dotenv.config({ path: ".env.local" });

export default defineConfig({
  schema: "./db/schema.ts",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: {
    url: process.env.DATABASE_URL!,
  },
});
