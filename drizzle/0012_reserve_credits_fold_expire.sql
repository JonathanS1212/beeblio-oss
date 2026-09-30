-- Fold the pre-reservation expiry step into app.reserve_credits itself.
-- The app previously issued expire_credit_reservations as a separate round
-- trip before every reservation (lib/credits/reserve.ts); running it inside
-- the same transaction keeps the spendable check accurate while cutting one
-- WAN query from the turn hot path. The advisory lock above is reentrant
-- within a transaction, and the expiry cursor locks rows with SKIP LOCKED,
-- so concurrent reservations for the same user serialize here instead of
-- deadlocking.
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

	PERFORM app.expire_credit_reservations(p_user_id);

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
