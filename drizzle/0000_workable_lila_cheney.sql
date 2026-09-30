CREATE TABLE `agent_sessions` (
	`id` text PRIMARY KEY NOT NULL,
	`eve_session_id` text,
	`state` text,
	`events` text,
	`project_id` text NOT NULL,
	`title` text,
	`status` text DEFAULT 'active' NOT NULL,
	`deleted_at` integer,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	`last_active_at` integer DEFAULT (unixepoch()) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "agent_sessions_status_check" CHECK("agent_sessions"."status" in ('active', 'archived', 'deleted'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `agent_sessions_eve_session_id_unique` ON `agent_sessions` (`eve_session_id`);--> statement-breakpoint
CREATE INDEX `idx_agent_sessions_project_id` ON `agent_sessions` (`project_id`);--> statement-breakpoint
CREATE TABLE `knowledge_documents` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text NOT NULL,
	`store_id` text NOT NULL,
	`file_path` text NOT NULL,
	`display_name` text NOT NULL,
	`source_etag` text,
	`source_size_bytes` integer NOT NULL,
	`provider_document_name` text,
	`operation_name` text,
	`status` text DEFAULT 'indexing' NOT NULL,
	`last_error` text,
	`indexed_at` integer,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`store_id`) REFERENCES `knowledge_stores`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "knowledge_documents_status_check" CHECK("knowledge_documents"."status" in ('indexing', 'ready', 'failed', 'removing'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `knowledge_documents_provider_document_name_unique` ON `knowledge_documents` (`provider_document_name`);--> statement-breakpoint
CREATE INDEX `knowledge_documents_project_status_idx` ON `knowledge_documents` (`project_id`,`status`);--> statement-breakpoint
CREATE UNIQUE INDEX `knowledge_documents_project_path_key` ON `knowledge_documents` (`project_id`,`file_path`);--> statement-breakpoint
CREATE TABLE `knowledge_stores` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text NOT NULL,
	`provider_store_name` text NOT NULL,
	`embedding_model` text DEFAULT 'models/gemini-embedding-2' NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `knowledge_stores_project_id_unique` ON `knowledge_stores` (`project_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `knowledge_stores_provider_store_name_unique` ON `knowledge_stores` (`provider_store_name`);--> statement-breakpoint
CREATE TABLE `projects` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`slug` text NOT NULL,
	`folder_path` text,
	`name` text NOT NULL,
	`description` text,
	`settings` text DEFAULT '{}' NOT NULL,
	`deleted_at` integer,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch()) NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_projects_user_id` ON `projects` (`user_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `projects_user_id_slug_key` ON `projects` (`user_id`,`slug`);--> statement-breakpoint
CREATE TABLE `public_files` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text NOT NULL,
	`file_path` text NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `public_files_project_path_key` ON `public_files` (`project_id`,`file_path`);