CREATE TABLE "app"."user_openrouter_credentials" (
	"user_id" text PRIMARY KEY NOT NULL,
	"encrypted_key" text NOT NULL,
	"iv" text NOT NULL,
	"auth_tag" text NOT NULL,
	"key_version" integer DEFAULT 1 NOT NULL,
	"masked_key" text NOT NULL,
	"verified_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "app"."agent_sessions" ADD COLUMN "model_source" text DEFAULT 'system' NOT NULL;--> statement-breakpoint
ALTER TABLE "app"."agent_sessions" ADD COLUMN "model_id" text;--> statement-breakpoint
ALTER TABLE "app"."agent_sessions" ADD COLUMN "model_context_window_tokens" integer;--> statement-breakpoint
ALTER TABLE "app"."agent_sessions" ADD CONSTRAINT "agent_sessions_model_source_check" CHECK ("app"."agent_sessions"."model_source" in ('system', 'byok'));