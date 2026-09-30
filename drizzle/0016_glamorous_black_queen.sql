CREATE TABLE "app"."sandbox_compute_usage" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"reservation_id" uuid NOT NULL,
	"operation_id" text NOT NULL,
	"active_milliseconds" integer NOT NULL,
	"memory_mb" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "sandbox_compute_usage_reservation_operation_key" UNIQUE("reservation_id","operation_id"),
	CONSTRAINT "sandbox_compute_usage_active_milliseconds_check" CHECK ("app"."sandbox_compute_usage"."active_milliseconds" > 0),
	CONSTRAINT "sandbox_compute_usage_memory_mb_check" CHECK ("app"."sandbox_compute_usage"."memory_mb" > 0)
);
--> statement-breakpoint
ALTER TABLE "app"."credit_reservations" ADD COLUMN "sandbox_session_id" text;--> statement-breakpoint
ALTER TABLE "app"."sandbox_compute_usage" ADD CONSTRAINT "sandbox_compute_usage_reservation_id_credit_reservations_id_fk" FOREIGN KEY ("reservation_id") REFERENCES "app"."credit_reservations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_sandbox_compute_usage_reservation" ON "app"."sandbox_compute_usage" USING btree ("reservation_id");--> statement-breakpoint
CREATE INDEX "idx_credit_reservations_sandbox_status" ON "app"."credit_reservations" USING btree ("sandbox_session_id","status");
