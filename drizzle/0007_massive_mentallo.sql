CREATE TABLE "app"."user_plans" (
	"user_id" text PRIMARY KEY NOT NULL,
	"plan" text DEFAULT 'free' NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"updated_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "user_plans_plan_check" CHECK ("app"."user_plans"."plan" in ('free', 'plus', 'pro')),
	CONSTRAINT "user_plans_status_check" CHECK ("app"."user_plans"."status" in ('active', 'lapsed'))
);
--> statement-breakpoint
CREATE TABLE "app"."user_roles" (
	"user_id" text NOT NULL,
	"role" text NOT NULL,
	"granted_by" text,
	"granted_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "user_roles_user_id_role_pk" PRIMARY KEY("user_id","role"),
	CONSTRAINT "user_roles_role_check" CHECK ("app"."user_roles"."role" in ('admin'))
);
--> statement-breakpoint
ALTER TABLE "app"."user_credits" ADD COLUMN "included_balance" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "app"."user_credits" ADD COLUMN "topup_balance" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
-- No top-ups have ever been sold, so the existing balance is entirely
-- included credits: the bucket split backfill is exact (docs/entitlements-plan.md §7.2).
UPDATE "app"."user_credits" SET "included_balance" = "balance" WHERE "included_balance" = 0 AND "balance" > 0;--> statement-breakpoint
-- Signature and return type change (bucket param + bucket columns), so the
-- old function must be dropped rather than replaced in place.
DROP FUNCTION IF EXISTS app.grant_credits(text, integer, text, text, text);--> statement-breakpoint
CREATE FUNCTION app.grant_credits(
	p_user_id text,
	p_amount integer,
	p_idempotency_key text,
	p_reason text,
	p_source text,
	p_bucket text DEFAULT 'included'
) RETURNS TABLE(included_balance integer, topup_balance integer, balance integer, reserved integer, granted boolean)
LANGUAGE plpgsql
AS $$
DECLARE
	v_granted boolean := false;
BEGIN
	IF p_amount <= 0 THEN
		RAISE EXCEPTION 'Credit grant amount must be positive';
	END IF;

	PERFORM pg_advisory_xact_lock(hashtextextended(p_user_id, 0));
	INSERT INTO app.user_credits (user_id) VALUES (p_user_id)
	ON CONFLICT (user_id) DO NOTHING;

	INSERT INTO app.credit_ledger (
		user_id, delta, type, reason, source, idempotency_key
	) VALUES (
		p_user_id, p_amount, 'grant', p_reason, p_source, p_idempotency_key
	)
	ON CONFLICT (idempotency_key) DO NOTHING
	RETURNING true INTO v_granted;

	IF v_granted THEN
		UPDATE app.user_credits AS uc
		SET included_balance = CASE WHEN p_bucket = 'topup' THEN uc.included_balance ELSE uc.included_balance + p_amount END,
			topup_balance = CASE WHEN p_bucket = 'topup' THEN uc.topup_balance + p_amount ELSE uc.topup_balance END,
			balance = uc.balance + p_amount,
			total_granted = uc.total_granted + p_amount,
			updated_at = now()
		WHERE uc.user_id = p_user_id;
	END IF;

	RETURN QUERY
	SELECT uc.included_balance, uc.topup_balance, uc.balance, uc.reserved, v_granted
	FROM app.user_credits AS uc
	WHERE uc.user_id = p_user_id;
END;
$$;--> statement-breakpoint
CREATE OR REPLACE FUNCTION app.ensure_monthly_allowance(
	p_user_id text,
	p_allowance integer,
	p_idempotency_key text,
	p_reason text,
	p_source text
) RETURNS TABLE(included_balance integer, topup_balance integer, balance integer, reserved integer, granted boolean)
LANGUAGE plpgsql
AS $$
DECLARE
	v_row app.user_credits%ROWTYPE;
	v_delta integer;
	v_granted boolean := false;
BEGIN
	IF p_allowance <= 0 THEN
		RAISE EXCEPTION 'Plan allowance must be positive';
	END IF;

	PERFORM pg_advisory_xact_lock(hashtextextended(p_user_id, 0));
	INSERT INTO app.user_credits (user_id) VALUES (p_user_id)
	ON CONFLICT (user_id) DO NOTHING;

	SELECT * INTO v_row FROM app.user_credits AS uc
	WHERE uc.user_id = p_user_id
	FOR UPDATE;

	-- Floor top-up: included := max(included, allowance). Purchased credits in
	-- the topup bucket are never spent covering the monthly floor.
	v_delta := p_allowance - v_row.included_balance;
	IF v_delta > 0 THEN
		INSERT INTO app.credit_ledger (
			user_id, delta, type, reason, source, idempotency_key
		) VALUES (
			p_user_id, v_delta, 'grant', p_reason, p_source, p_idempotency_key
		)
		ON CONFLICT (idempotency_key) DO NOTHING
		RETURNING true INTO v_granted;

		IF v_granted THEN
			UPDATE app.user_credits AS uc
			SET included_balance = uc.included_balance + v_delta,
				balance = uc.balance + v_delta,
				total_granted = uc.total_granted + v_delta,
				updated_at = now()
			WHERE uc.user_id = p_user_id;
		END IF;
	END IF;

	RETURN QUERY
	SELECT uc.included_balance, uc.topup_balance, uc.balance, uc.reserved, v_granted
	FROM app.user_credits AS uc
	WHERE uc.user_id = p_user_id;
END;
$$;--> statement-breakpoint
CREATE OR REPLACE FUNCTION app.record_reserved_credit_usage(
	p_reservation_id uuid,
	p_credits integer,
	p_idempotency_key text,
	p_reason text,
	p_source text,
	p_session_id text,
	p_turn_id text,
	p_call_id text,
	p_cost_details jsonb
) RETURNS TABLE(balance integer, reserved integer, charged integer, recorded boolean)
LANGUAGE plpgsql
AS $$
DECLARE
	v_reservation app.credit_reservations%ROWTYPE;
	v_balance integer;
	v_reserved integer;
	v_release integer;
BEGIN
	IF p_credits <= 0 THEN
		RAISE EXCEPTION 'Credit usage amount must be positive';
	END IF;

	SELECT * INTO v_reservation
	FROM app.credit_reservations AS cr
	WHERE cr.id = p_reservation_id
	FOR UPDATE;
	IF NOT FOUND OR v_reservation.status <> 'active' THEN RETURN; END IF;

	PERFORM pg_advisory_xact_lock(hashtextextended(v_reservation.user_id, 0));
	SELECT uc.balance, uc.reserved INTO v_balance, v_reserved
	FROM app.user_credits AS uc
	WHERE uc.user_id = v_reservation.user_id
	FOR UPDATE;

	IF EXISTS (
		SELECT 1 FROM app.credit_ledger AS cl
		WHERE cl.idempotency_key = p_idempotency_key
	) THEN
		RETURN QUERY SELECT v_balance, v_reserved, 0, false;
		RETURN;
	END IF;

	v_release := least(
		greatest(0, v_reservation.amount - v_reservation.settled_amount),
		p_credits
	);

	INSERT INTO app.credit_ledger (
		user_id, delta, type, reason, source, cost_details,
		session_id, turn_id, call_id, reservation_id, idempotency_key
	) VALUES (
		v_reservation.user_id, -p_credits, 'usage', p_reason, p_source, p_cost_details,
		p_session_id, p_turn_id, p_call_id, p_reservation_id, p_idempotency_key
	);

	-- Included credits burn first; only the spill touches never-expiring
	-- top-up credits. All right-hand expressions read the pre-update row.
	UPDATE app.user_credits AS uc
	SET included_balance = uc.included_balance - least(uc.included_balance, p_credits),
		topup_balance = uc.topup_balance - greatest(0, p_credits - least(uc.included_balance, p_credits)),
		balance = uc.balance - p_credits,
		reserved = greatest(0, uc.reserved - v_release),
		total_used = uc.total_used + p_credits,
		updated_at = now()
	WHERE uc.user_id = v_reservation.user_id
	RETURNING uc.balance, uc.reserved INTO v_balance, v_reserved;

	UPDATE app.credit_reservations AS cr
	SET settled_amount = cr.settled_amount + p_credits,
		session_id = coalesce(cr.session_id, p_session_id),
		turn_id = coalesce(cr.turn_id, p_turn_id),
		updated_at = now()
	WHERE cr.id = p_reservation_id;

	RETURN QUERY SELECT v_balance, v_reserved, p_credits, true;
END;
$$;--> statement-breakpoint
CREATE OR REPLACE FUNCTION app.record_direct_credit_usage(
	p_user_id text,
	p_credits integer,
	p_idempotency_key text,
	p_reason text,
	p_source text,
	p_session_id text,
	p_turn_id text,
	p_call_id text,
	p_cost_details jsonb
) RETURNS TABLE(balance integer, reserved integer, charged integer, recorded boolean)
LANGUAGE plpgsql
AS $$
DECLARE
	v_balance integer;
	v_reserved integer;
BEGIN
	IF p_credits <= 0 THEN
		RAISE EXCEPTION 'Credit usage amount must be positive';
	END IF;

	PERFORM pg_advisory_xact_lock(hashtextextended(p_user_id, 0));
	INSERT INTO app.user_credits (user_id) VALUES (p_user_id)
	ON CONFLICT (user_id) DO NOTHING;

	SELECT uc.balance, uc.reserved INTO v_balance, v_reserved
	FROM app.user_credits AS uc
	WHERE uc.user_id = p_user_id
	FOR UPDATE;

	IF EXISTS (
		SELECT 1 FROM app.credit_ledger AS cl
		WHERE cl.idempotency_key = p_idempotency_key
	) THEN
		RETURN QUERY SELECT v_balance, v_reserved, 0, false;
		RETURN;
	END IF;

	INSERT INTO app.credit_ledger (
		user_id, delta, type, reason, source, cost_details,
		session_id, turn_id, call_id, idempotency_key
	) VALUES (
		p_user_id, -p_credits, 'usage', p_reason, p_source, p_cost_details,
		p_session_id, p_turn_id, p_call_id, p_idempotency_key
	);

	UPDATE app.user_credits AS uc
	SET included_balance = uc.included_balance - least(uc.included_balance, p_credits),
		topup_balance = uc.topup_balance - greatest(0, p_credits - least(uc.included_balance, p_credits)),
		balance = uc.balance - p_credits,
		total_used = uc.total_used + p_credits,
		updated_at = now()
	WHERE uc.user_id = p_user_id
	RETURNING uc.balance, uc.reserved INTO v_balance, v_reserved;

	RETURN QUERY SELECT v_balance, v_reserved, p_credits, true;
END;
$$;