INSERT INTO "app"."credit_products"
  ("provider", "provider_price_id", "name", "credits", "amount_minor", "currency", "metadata")
VALUES
  ('mayar', 'promo:plus', 'Plus', 5, 1000, 'IDR',
   '{"productType":"subscription","planKey":"plus","market":"indonesia","renewal":"manual","hidden":true,"purpose":"productionTest","minimumAmountSource":"Mayar payment-request API examples"}'::jsonb),
  ('mayar', 'promo:pro', 'Pro', 5, 1000, 'IDR',
   '{"productType":"subscription","planKey":"pro","market":"indonesia","renewal":"manual","hidden":true,"purpose":"productionTest","minimumAmountSource":"Mayar payment-request API examples"}'::jsonb),
  ('mayar', 'promo:topup', 'Promo', 5, 1000, 'IDR',
   '{"productType":"topup","market":"indonesia","renewal":"manual","hidden":true,"purpose":"productionTest","minimumAmountSource":"Mayar payment-request API examples"}'::jsonb)
ON CONFLICT ("provider", "provider_price_id") DO UPDATE SET
  "name" = EXCLUDED."name",
  "credits" = EXCLUDED."credits",
  "amount_minor" = EXCLUDED."amount_minor",
  "currency" = EXCLUDED."currency",
  "metadata" = EXCLUDED."metadata",
  "updated_at" = now();
