CREATE TABLE "app"."knowledge_documents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"store_id" uuid NOT NULL,
	"file_path" text NOT NULL,
	"display_name" text NOT NULL,
	"source_etag" text,
	"source_size_bytes" bigint NOT NULL,
	"provider_document_name" text,
	"operation_name" text,
	"status" text DEFAULT 'indexing' NOT NULL,
	"last_error" text,
	"indexed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "knowledge_documents_provider_document_name_unique" UNIQUE("provider_document_name"),
	CONSTRAINT "knowledge_documents_project_path_key" UNIQUE("project_id","file_path"),
	CONSTRAINT "knowledge_documents_status_check" CHECK ("app"."knowledge_documents"."status" in ('indexing', 'ready', 'failed', 'removing'))
);
--> statement-breakpoint
CREATE TABLE "app"."knowledge_stores" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"provider_store_name" text NOT NULL,
	"embedding_model" text DEFAULT 'models/gemini-embedding-2' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "knowledge_stores_project_id_unique" UNIQUE("project_id"),
	CONSTRAINT "knowledge_stores_provider_store_name_unique" UNIQUE("provider_store_name")
);
--> statement-breakpoint
ALTER TABLE "app"."knowledge_documents" ADD CONSTRAINT "knowledge_documents_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "app"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."knowledge_documents" ADD CONSTRAINT "knowledge_documents_store_id_knowledge_stores_id_fk" FOREIGN KEY ("store_id") REFERENCES "app"."knowledge_stores"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."knowledge_stores" ADD CONSTRAINT "knowledge_stores_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "app"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "knowledge_documents_project_status_idx" ON "app"."knowledge_documents" USING btree ("project_id","status");