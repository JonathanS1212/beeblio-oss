ALTER TABLE "app"."agent_sessions" ALTER COLUMN "eve_session_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "app"."agent_sessions" ADD COLUMN "state" jsonb;