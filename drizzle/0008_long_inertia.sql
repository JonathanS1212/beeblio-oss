CREATE TABLE "app"."billing_addons" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"product_id" uuid,
	"provider" text NOT NULL,
	"provider_reference_id" text NOT NULL,
	"storage_bytes" bigint NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"current_period_start" timestamp with time zone,
	"current_period_end" timestamp with time zone,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "billing_addons_provider_reference_id" UNIQUE("provider","provider_reference_id"),
	CONSTRAINT "billing_addons_provider_check" CHECK ("app"."billing_addons"."provider" in ('lemonsqueezy', 'mayar')),
	CONSTRAINT "billing_addons_status_check" CHECK ("app"."billing_addons"."status" in ('on_trial', 'active', 'past_due', 'unpaid', 'paused', 'cancelled', 'expired')),
	CONSTRAINT "billing_addons_storage_bytes_check" CHECK ("app"."billing_addons"."storage_bytes" > 0)
);
--> statement-breakpoint
CREATE TABLE "app"."billing_customers" (
	"user_id" text NOT NULL,
	"provider" text NOT NULL,
	"provider_customer_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "billing_customers_user_id_provider_pk" PRIMARY KEY("user_id","provider"),
	CONSTRAINT "billing_customers_provider_customer_id" UNIQUE("provider","provider_customer_id"),
	CONSTRAINT "billing_customers_provider_check" CHECK ("app"."billing_customers"."provider" in ('lemonsqueezy', 'mayar'))
);
--> statement-breakpoint
CREATE TABLE "app"."billing_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"provider" text NOT NULL,
	"provider_event_id" text NOT NULL,
	"event_type" text NOT NULL,
	"user_id" text,
	"payload" jsonb NOT NULL,
	"processed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "billing_events_provider_event_id" UNIQUE("provider","provider_event_id"),
	CONSTRAINT "billing_events_provider_check" CHECK ("app"."billing_events"."provider" in ('lemonsqueezy', 'mayar'))
);
--> statement-breakpoint
CREATE TABLE "app"."billing_settings" (
	"key" text PRIMARY KEY NOT NULL,
	"value" jsonb NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "app"."billing_subscriptions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"provider" text NOT NULL,
	"provider_subscription_id" text NOT NULL,
	"provider_customer_id" text,
	"provider_variant_id" text NOT NULL,
	"plan_key" text NOT NULL,
	"status" text NOT NULL,
	"current_period_start" timestamp with time zone,
	"current_period_end" timestamp with time zone,
	"cancel_at_period_end" boolean DEFAULT false NOT NULL,
	"ended_at" timestamp with time zone,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "billing_subscriptions_provider_subscription_id" UNIQUE("provider","provider_subscription_id"),
	CONSTRAINT "billing_subscriptions_provider_check" CHECK ("app"."billing_subscriptions"."provider" in ('lemonsqueezy', 'mayar')),
	CONSTRAINT "billing_subscriptions_plan_key_check" CHECK ("app"."billing_subscriptions"."plan_key" in ('plus', 'pro')),
	CONSTRAINT "billing_subscriptions_status_check" CHECK ("app"."billing_subscriptions"."status" in ('on_trial', 'active', 'past_due', 'unpaid', 'paused', 'cancelled', 'expired'))
);
--> statement-breakpoint
CREATE TABLE "app"."credit_products" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"provider" text NOT NULL,
	"provider_price_id" text NOT NULL,
	"name" text NOT NULL,
	"credits" integer NOT NULL,
	"amount_minor" bigint NOT NULL,
	"currency" text NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "credit_products_provider_price_id" UNIQUE("provider","provider_price_id"),
	CONSTRAINT "credit_products_provider_check" CHECK ("app"."credit_products"."provider" in ('lemonsqueezy', 'mayar')),
	CONSTRAINT "credit_products_credits_check" CHECK ("app"."credit_products"."credits" >= 0),
	CONSTRAINT "credit_products_amount_check" CHECK ("app"."credit_products"."amount_minor" >= 0)
);
--> statement-breakpoint
CREATE TABLE "app"."payments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"product_id" uuid,
	"provider" text NOT NULL,
	"provider_payment_id" text,
	"provider_checkout_id" text,
	"provider_invoice_id" text,
	"status" text DEFAULT 'pending' NOT NULL,
	"amount_minor" bigint NOT NULL,
	"currency" text NOT NULL,
	"credits_granted" integer DEFAULT 0 NOT NULL,
	"provider_event_id" text,
	"paid_at" timestamp with time zone,
	"refunded_at" timestamp with time zone,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "payments_provider_payment_id" UNIQUE("provider","provider_payment_id"),
	CONSTRAINT "payments_provider_checkout_id" UNIQUE("provider","provider_checkout_id"),
	CONSTRAINT "payments_provider_invoice_id" UNIQUE("provider","provider_invoice_id"),
	CONSTRAINT "payments_provider_event_id" UNIQUE("provider","provider_event_id"),
	CONSTRAINT "payments_provider_check" CHECK ("app"."payments"."provider" in ('lemonsqueezy', 'mayar')),
	CONSTRAINT "payments_status_check" CHECK ("app"."payments"."status" in ('pending', 'paid', 'failed', 'refunded', 'disputed')),
	CONSTRAINT "payments_amount_check" CHECK ("app"."payments"."amount_minor" >= 0),
	CONSTRAINT "payments_credits_granted_check" CHECK ("app"."payments"."credits_granted" >= 0)
);
--> statement-breakpoint
CREATE TABLE "app"."user_billing_profiles" (
	"user_id" text PRIMARY KEY NOT NULL,
	"mobile" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "app"."billing_addons" ADD CONSTRAINT "billing_addons_product_id_credit_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "app"."credit_products"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."payments" ADD CONSTRAINT "payments_product_id_credit_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "app"."credit_products"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "billing_addons_user_status_idx" ON "app"."billing_addons" USING btree ("user_id","status","current_period_end");--> statement-breakpoint
CREATE INDEX "billing_events_user_created_idx" ON "app"."billing_events" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE INDEX "billing_subscriptions_user_status_idx" ON "app"."billing_subscriptions" USING btree ("user_id","status","current_period_end");--> statement-breakpoint
CREATE INDEX "credit_products_active_idx" ON "app"."credit_products" USING btree ("active","created_at");--> statement-breakpoint
CREATE INDEX "payments_user_created_idx" ON "app"."payments" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE INDEX "payments_status_created_idx" ON "app"."payments" USING btree ("status","created_at");
--> statement-breakpoint
INSERT INTO "app"."billing_settings" ("key", "value")
VALUES ('pricing.idr', '{"usdToIdr":15000,"roundTo":1000,"roundMode":"floorPlus900"}'::jsonb)
ON CONFLICT ("key") DO UPDATE SET "value" = EXCLUDED."value", "updated_at" = now();
--> statement-breakpoint
INSERT INTO "app"."credit_products"
  ("provider", "provider_price_id", "name", "credits", "amount_minor", "currency", "metadata")
VALUES
  ('lemonsqueezy', 'ls-test:plus', 'Plus', 4000, 1200, 'USD',
   '{"productType":"subscription","planKey":"plus","market":"global","renewal":"automatic","testMode":true}'::jsonb),
  ('lemonsqueezy', 'ls-test:pro', 'Pro', 12000, 2900, 'USD',
   '{"productType":"subscription","planKey":"pro","market":"global","renewal":"automatic","testMode":true}'::jsonb),
  ('lemonsqueezy', 'ls-test:topup-1000', '1,000 credits', 1000, 1000, 'USD',
   '{"productType":"topup","market":"global","renewal":"automatic","testMode":true}'::jsonb),
  ('lemonsqueezy', 'ls-test:topup-5000', '5,000 credits', 5000, 4500, 'USD',
   '{"productType":"topup","market":"global","renewal":"automatic","testMode":true}'::jsonb),
  ('lemonsqueezy', 'ls-test:topup-20000', '20,000 credits', 20000, 16000, 'USD',
   '{"productType":"topup","market":"global","renewal":"automatic","testMode":true}'::jsonb),
  ('lemonsqueezy', 'ls-test:storage-5gb', '+5 GB', 0, 300, 'USD',
   '{"productType":"storage_addon","market":"global","renewal":"automatic","storageBytes":5368709120,"testMode":true}'::jsonb),
  ('lemonsqueezy', 'ls-test:storage-25gb', '+25 GB', 0, 1200, 'USD',
   '{"productType":"storage_addon","market":"global","renewal":"automatic","storageBytes":26843545600,"testMode":true}'::jsonb),
  ('lemonsqueezy', 'ls-live:plus', 'Plus', 4000, 1200, 'USD',
   '{"productType":"subscription","planKey":"plus","market":"global","renewal":"automatic","testMode":false}'::jsonb),
  ('lemonsqueezy', 'ls-live:pro', 'Pro', 12000, 2900, 'USD',
   '{"productType":"subscription","planKey":"pro","market":"global","renewal":"automatic","testMode":false}'::jsonb),
  ('lemonsqueezy', 'ls-live:topup-1000', '1,000 credits', 1000, 1000, 'USD',
   '{"productType":"topup","market":"global","renewal":"automatic","testMode":false}'::jsonb),
  ('lemonsqueezy', 'ls-live:topup-5000', '5,000 credits', 5000, 4500, 'USD',
   '{"productType":"topup","market":"global","renewal":"automatic","testMode":false}'::jsonb),
  ('lemonsqueezy', 'ls-live:topup-20000', '20,000 credits', 20000, 16000, 'USD',
   '{"productType":"topup","market":"global","renewal":"automatic","testMode":false}'::jsonb),
  ('lemonsqueezy', 'ls-live:storage-5gb', '+5 GB', 0, 300, 'USD',
   '{"productType":"storage_addon","market":"global","renewal":"automatic","storageBytes":5368709120,"testMode":false}'::jsonb),
  ('lemonsqueezy', 'ls-live:storage-25gb', '+25 GB', 0, 1200, 'USD',
   '{"productType":"storage_addon","market":"global","renewal":"automatic","storageBytes":26843545600,"testMode":false}'::jsonb),
  ('mayar', 'plan:plus', 'Plus', 4000, 180900, 'IDR',
   '{"productType":"subscription","planKey":"plus","market":"indonesia","renewal":"manual"}'::jsonb),
  ('mayar', 'plan:pro', 'Pro', 12000, 435900, 'IDR',
   '{"productType":"subscription","planKey":"pro","market":"indonesia","renewal":"manual"}'::jsonb),
  ('mayar', 'topup:1000', '1,000 credits', 1000, 150900, 'IDR',
   '{"productType":"topup","market":"indonesia","renewal":"manual"}'::jsonb),
  ('mayar', 'topup:5000', '5,000 credits', 5000, 675900, 'IDR',
   '{"productType":"topup","market":"indonesia","renewal":"manual"}'::jsonb),
  ('mayar', 'topup:20000', '20,000 credits', 20000, 2400900, 'IDR',
   '{"productType":"topup","market":"indonesia","renewal":"manual"}'::jsonb),
  ('mayar', 'storage:5gb', '+5 GB', 0, 45900, 'IDR',
   '{"productType":"storage_addon","market":"indonesia","renewal":"manual","storageBytes":5368709120}'::jsonb),
  ('mayar', 'storage:25gb', '+25 GB', 0, 180900, 'IDR',
   '{"productType":"storage_addon","market":"indonesia","renewal":"manual","storageBytes":26843545600}'::jsonb)
ON CONFLICT ("provider", "provider_price_id") DO UPDATE SET
  "name" = EXCLUDED."name",
  "credits" = EXCLUDED."credits",
  "amount_minor" = EXCLUDED."amount_minor",
  "currency" = EXCLUDED."currency",
  "metadata" = EXCLUDED."metadata",
  "updated_at" = now();