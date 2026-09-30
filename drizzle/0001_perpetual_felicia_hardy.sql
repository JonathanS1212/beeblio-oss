ALTER TABLE "app"."user_identities" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "app"."users" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP TABLE "app"."user_identities" CASCADE;--> statement-breakpoint
DROP TABLE "app"."users" CASCADE;--> statement-breakpoint
ALTER TABLE "app"."projects" ALTER COLUMN "user_id" SET DATA TYPE text;