CREATE TABLE "app"."credit_reservations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"session_id" text,
	"turn_id" text,
	"amount" integer NOT NULL,
	"settled_amount" integer DEFAULT 0 NOT NULL,
	"execution_class" text NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"idempotency_key" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "credit_reservations_idempotency_key" UNIQUE("idempotency_key"),
	CONSTRAINT "credit_reservations_status_check" CHECK ("app"."credit_reservations"."status" in ('active', 'settled', 'released', 'expired')),
	CONSTRAINT "credit_reservations_amount_check" CHECK ("app"."credit_reservations"."amount" > 0),
	CONSTRAINT "credit_reservations_settled_amount_check" CHECK ("app"."credit_reservations"."settled_amount" >= 0)
);
--> statement-breakpoint
ALTER TABLE "app"."credit_ledger" ADD COLUMN "reservation_id" uuid;--> statement-breakpoint
ALTER TABLE "app"."user_credits" ADD COLUMN "reserved" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
CREATE INDEX "idx_credit_reservations_user_status" ON "app"."credit_reservations" USING btree ("user_id","status");--> statement-breakpoint
ALTER TABLE "app"."credit_ledger" ADD CONSTRAINT "credit_ledger_reservation_id_credit_reservations_id_fk" FOREIGN KEY ("reservation_id") REFERENCES "app"."credit_reservations"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION app.grant_credits(
	p_user_id text,
	p_amount integer,
	p_idempotency_key text,
	p_reason text,
	p_source text
) RETURNS TABLE(balance integer, reserved integer, granted boolean)
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
		SET balance = uc.balance + p_amount,
			total_granted = uc.total_granted + p_amount,
			updated_at = now()
		WHERE uc.user_id = p_user_id;
	END IF;

	RETURN QUERY
	SELECT uc.balance, uc.reserved, v_granted
	FROM app.user_credits AS uc
	WHERE uc.user_id = p_user_id;
END;
$$;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION app.reserve_credits(
	p_user_id text,
	p_amount integer,
	p_execution_class text,
	p_idempotency_key text,
	p_expires_at timestamptz
) RETURNS TABLE(
	reservation_id uuid,
	amount integer,
	balance integer,
	reserved integer,
	status text
)
LANGUAGE plpgsql
AS $$
DECLARE
	v_reservation_id uuid;
	v_balance integer;
	v_reserved integer;
BEGIN
	IF p_amount <= 0 THEN
		RAISE EXCEPTION 'Credit reservation amount must be positive';
	END IF;

	PERFORM pg_advisory_xact_lock(hashtextextended(p_user_id, 0));

	RETURN QUERY
	SELECT cr.id, cr.amount, uc.balance, uc.reserved, cr.status
	FROM app.credit_reservations AS cr
	JOIN app.user_credits AS uc ON uc.user_id = cr.user_id
	WHERE cr.user_id = p_user_id
		AND cr.idempotency_key = p_idempotency_key
		AND cr.status = 'active';
	IF FOUND THEN RETURN; END IF;
	-- A terminal reservation key represents an already accepted/released
	-- request and must never reserve a second time on a replay.
	IF EXISTS (
		SELECT 1 FROM app.credit_reservations AS cr
		WHERE cr.user_id = p_user_id AND cr.idempotency_key = p_idempotency_key
	) THEN RETURN; END IF;

	UPDATE app.user_credits AS uc
	SET reserved = uc.reserved + p_amount,
		updated_at = now()
	WHERE uc.user_id = p_user_id
		AND uc.balance - uc.reserved >= p_amount
	RETURNING uc.balance, uc.reserved INTO v_balance, v_reserved;
	IF NOT FOUND THEN RETURN; END IF;

	INSERT INTO app.credit_reservations (
		user_id, amount, execution_class, status, idempotency_key, expires_at
	) VALUES (
		p_user_id, p_amount, p_execution_class, 'active', p_idempotency_key, p_expires_at
	)
	RETURNING id INTO v_reservation_id;

	RETURN QUERY SELECT v_reservation_id, p_amount, v_balance, v_reserved, 'active'::text;
END;
$$;
--> statement-breakpoint
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

	UPDATE app.user_credits AS uc
	SET balance = uc.balance - p_credits,
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
$$;
--> statement-breakpoint
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
	SET balance = uc.balance - p_credits,
		total_used = uc.total_used + p_credits,
		updated_at = now()
	WHERE uc.user_id = p_user_id
	RETURNING uc.balance, uc.reserved INTO v_balance, v_reserved;

	RETURN QUERY SELECT v_balance, v_reserved, p_credits, true;
END;
$$;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION app.finish_credit_reservation(
	p_reservation_id uuid,
	p_outcome text
) RETURNS TABLE(balance integer, reserved integer, released integer)
LANGUAGE plpgsql
AS $$
DECLARE
	v_reservation app.credit_reservations%ROWTYPE;
	v_balance integer;
	v_reserved integer;
	v_release integer;
BEGIN
	SELECT * INTO v_reservation
	FROM app.credit_reservations AS cr
	WHERE cr.id = p_reservation_id
	FOR UPDATE;
	IF NOT FOUND THEN RETURN; END IF;

	PERFORM pg_advisory_xact_lock(hashtextextended(v_reservation.user_id, 0));
	IF v_reservation.status <> 'active' THEN
		RETURN QUERY
		SELECT uc.balance, uc.reserved, 0
		FROM app.user_credits AS uc
		WHERE uc.user_id = v_reservation.user_id;
		RETURN;
	END IF;

	v_release := greatest(0, v_reservation.amount - v_reservation.settled_amount);
	UPDATE app.user_credits AS uc
	SET reserved = greatest(0, uc.reserved - v_release),
		updated_at = now()
	WHERE uc.user_id = v_reservation.user_id
	RETURNING uc.balance, uc.reserved INTO v_balance, v_reserved;

	UPDATE app.credit_reservations AS cr
	SET status = CASE WHEN cr.settled_amount > 0 THEN 'settled' ELSE 'released' END,
		updated_at = now()
	WHERE cr.id = p_reservation_id;

	RETURN QUERY SELECT v_balance, v_reserved, v_release;
END;
$$;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION app.expire_credit_reservations(p_user_id text DEFAULT NULL)
RETURNS integer
LANGUAGE plpgsql
AS $$
DECLARE
	v_reservation app.credit_reservations%ROWTYPE;
	v_release integer;
	v_count integer := 0;
BEGIN
	FOR v_reservation IN
		SELECT * FROM app.credit_reservations AS cr
		WHERE cr.status = 'active'
			AND cr.expires_at <= now()
			AND (p_user_id IS NULL OR cr.user_id = p_user_id)
		FOR UPDATE SKIP LOCKED
	LOOP
		PERFORM pg_advisory_xact_lock(hashtextextended(v_reservation.user_id, 0));
		v_release := greatest(0, v_reservation.amount - v_reservation.settled_amount);
		UPDATE app.user_credits AS uc
		SET reserved = greatest(0, uc.reserved - v_release),
			updated_at = now()
		WHERE uc.user_id = v_reservation.user_id;
		UPDATE app.credit_reservations AS cr
		SET status = 'expired', updated_at = now()
		WHERE cr.id = v_reservation.id;
		v_count := v_count + 1;
	END LOOP;
	RETURN v_count;
END;
$$;
