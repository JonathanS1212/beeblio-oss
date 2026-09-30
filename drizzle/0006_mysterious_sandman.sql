CREATE TABLE "app"."public_files" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"file_path" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "public_files_project_path_key" UNIQUE("project_id","file_path")
);
--> statement-breakpoint
ALTER TABLE "app"."public_files" ADD CONSTRAINT "public_files_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "app"."projects"("id") ON DELETE cascade ON UPDATE no action;