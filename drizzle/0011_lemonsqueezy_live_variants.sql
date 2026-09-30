UPDATE "app"."credit_products"
SET "provider_price_id" = '2090319', "amount_minor" = 1199, "updated_at" = now()
WHERE "provider" = 'lemonsqueezy' AND "provider_price_id" = 'ls-live:plus';
--> statement-breakpoint
UPDATE "app"."credit_products"
SET "provider_price_id" = '2090321', "updated_at" = now()
WHERE "provider" = 'lemonsqueezy' AND "provider_price_id" = 'ls-live:pro';
--> statement-breakpoint
UPDATE "app"."credit_products"
SET "provider_price_id" = '2090325', "amount_minor" = 999, "updated_at" = now()
WHERE "provider" = 'lemonsqueezy' AND "provider_price_id" = 'ls-live:topup-1000';
--> statement-breakpoint
UPDATE "app"."credit_products"
SET "provider_price_id" = '2090326', "amount_minor" = 4499, "updated_at" = now()
WHERE "provider" = 'lemonsqueezy' AND "provider_price_id" = 'ls-live:topup-5000';
--> statement-breakpoint
UPDATE "app"."credit_products"
SET "provider_price_id" = '2090327', "amount_minor" = 15999, "updated_at" = now()
WHERE "provider" = 'lemonsqueezy' AND "provider_price_id" = 'ls-live:topup-20000';
--> statement-breakpoint
INSERT INTO "app"."credit_products"
  ("provider", "provider_price_id", "name", "credits", "amount_minor", "currency", "metadata")
VALUES
  ('lemonsqueezy', '2090318', 'Plus', 5, 50, 'USD',
   '{"productType":"subscription","planKey":"plus","market":"global","renewal":"automatic","testMode":false,"hidden":true,"purpose":"productionTest"}'::jsonb),
  ('lemonsqueezy', '2090324', 'Promo', 5, 50, 'USD',
   '{"productType":"topup","market":"global","renewal":"automatic","testMode":false,"hidden":true,"purpose":"productionTest"}'::jsonb)
ON CONFLICT ("provider", "provider_price_id") DO UPDATE SET
  "name" = EXCLUDED."name",
  "credits" = EXCLUDED."credits",
  "amount_minor" = EXCLUDED."amount_minor",
  "currency" = EXCLUDED."currency",
  "metadata" = EXCLUDED."metadata",
  "updated_at" = now();
