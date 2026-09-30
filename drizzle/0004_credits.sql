CREATE TABLE "app"."credit_ledger" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"delta" integer NOT NULL,
	"type" text NOT NULL,
	"reason" text,
	"source" text,
	"cost_details" jsonb,
	"session_id" text,
	"turn_id" text,
	"call_id" text,
	"idempotency_key" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "credit_ledger_idempotency_key" UNIQUE("idempotency_key"),
	CONSTRAINT "credit_ledger_type_check" CHECK ("app"."credit_ledger"."type" in ('grant', 'usage', 'refund', 'adjustment', 'expiration'))
);
--> statement-breakpoint
CREATE TABLE "app"."user_credits" (
	"user_id" text PRIMARY KEY NOT NULL,
	"balance" integer DEFAULT 0 NOT NULL,
	"total_granted" integer DEFAULT 0 NOT NULL,
	"total_used" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "idx_credit_ledger_user_created" ON "app"."credit_ledger" USING btree ("user_id","created_at");