CREATE TABLE "app"."blog_posts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"slug" text NOT NULL,
	"title" text NOT NULL,
	"excerpt" text,
	"body_mdx" text DEFAULT '' NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"tags" text[] DEFAULT '{}'::text[] NOT NULL,
	"hero_image_url" text,
	"hero_image_alt" text,
	"seo_title" text,
	"seo_description" text,
	"og_image_url" text,
	"author_id" text NOT NULL,
	"author_name" text NOT NULL,
	"author_url" text,
	"published_at" timestamp with time zone,
	"deleted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "blog_posts_slug_key" UNIQUE("slug"),
	CONSTRAINT "blog_posts_status_check" CHECK ("app"."blog_posts"."status" in ('draft', 'published'))
);
--> statement-breakpoint
CREATE INDEX "idx_blog_posts_status_published_at" ON "app"."blog_posts" USING btree ("status","published_at");