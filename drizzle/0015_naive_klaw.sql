CREATE TABLE "app"."sandbox_bindings" (
	"session_key" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"project_slug" text NOT NULL,
	"sandbox_name" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
