CREATE SCHEMA "app";
--> statement-breakpoint
CREATE TABLE "app"."agent_sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"eve_session_id" text NOT NULL,
	"project_id" uuid NOT NULL,
	"title" text,
	"status" text DEFAULT 'active' NOT NULL,
	"deleted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_active_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "agent_sessions_eve_session_id_unique" UNIQUE("eve_session_id"),
	CONSTRAINT "agent_sessions_status_check" CHECK ("app"."agent_sessions"."status" in ('active', 'archived', 'deleted'))
);
--> statement-breakpoint
CREATE TABLE "app"."projects" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"slug" text NOT NULL,
	"name" text NOT NULL,
	"deleted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "projects_user_id_slug_key" UNIQUE("user_id","slug")
);
--> statement-breakpoint
CREATE TABLE "app"."user_identities" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"provider" text NOT NULL,
	"provider_subject" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "user_identities_provider_subject_key" UNIQUE("provider","provider_subject")
);
--> statement-breakpoint
CREATE TABLE "app"."users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"slug" text NOT NULL,
	"email" text NOT NULL,
	"name" text,
	"status" text DEFAULT 'active' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_slug_unique" UNIQUE("slug"),
	CONSTRAINT "users_email_unique" UNIQUE("email"),
	CONSTRAINT "users_status_check" CHECK ("app"."users"."status" in ('active', 'suspended', 'deleted'))
);
--> statement-breakpoint
ALTER TABLE "app"."agent_sessions" ADD CONSTRAINT "agent_sessions_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "app"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."projects" ADD CONSTRAINT "projects_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "app"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."user_identities" ADD CONSTRAINT "user_identities_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "app"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_agent_sessions_project_id" ON "app"."agent_sessions" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "idx_projects_user_id" ON "app"."projects" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "idx_user_identities_user_id" ON "app"."user_identities" USING btree ("user_id");