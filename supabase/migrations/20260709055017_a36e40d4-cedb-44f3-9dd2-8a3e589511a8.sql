-- Faza B: guard trigger za direktni write custom_payment_sources.balance.
--
-- Kontekst: Frontend edit izvora (CustomPaymentSourceDialog / handleSave)
-- šalje `balance` u UPDATE payloadu čak i kad korisnik samo mijenja ime.
-- Takav sirov UPDATE prepiše `balance` bez postavljanja sidra i bez audit
-- reda → sljedeći expenses trigger recomputea pregazi korisnički unos.
-- Verificirano na produkciji (Petar, 2026-07-08 → 2026-07-09).
--
-- Rješenje (Varijanta A — auto-anchor):
--   * BEFORE UPDATE OF balance guard: ako write dolazi iz engine konteksta
--     (interni recompute / set_source_anchor), propusti bez akcije. Inače
--     postavi NEW.correction_anchor_date := now(),
--            NEW.correction_anchor_balance := NEW.balance.
--   * AFTER  UPDATE OF balance guard: umetni audit correction red u
--     `expenses` s razlikom NEW.balance - OLD.balance (nature='correction',
--     event_at=now(), C2). Marker `app.balance_writer='engine'` postavlja
--     recompute funkcije, `set_source_anchor` i sam AFTER guard prije
--     svog INSERT-a, tako da recompute-nakon-INSERT-a bude propušten.
--
-- Semantika: identična `set_source_anchor` (strict `>` cut, correction
-- red isključen iz post-anchor sume).

-- ---------------------------------------------------------------------------
-- 1) Označi engine writere — svaki UPDATE balance kolone iz internog puta
--    mora postaviti marker koji guard čita.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.recompute_custom_source_balance(p_source_id uuid)
RETURNS numeric
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_anchor_date timestamptz;
  v_anchor_balance numeric(12,2);
  v_owner uuid;
  v_sum numeric(12,2) := 0;
  v_new_balance numeric(12,2);
  v_mode text;
BEGIN
  SELECT correction_anchor_date, correction_anchor_balance, user_id
    INTO v_anchor_date, v_anchor_balance, v_owner
    FROM public.custom_payment_sources
    WHERE id = p_source_id;

  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  -- Unanchored: recompute je no-op (delta-put pokriva). Vraća NULL.
  IF v_anchor_date IS NULL OR v_anchor_balance IS NULL THEN
    RETURN NULL;
  END IF;

  SELECT COALESCE(value #>> '{}', 'day_cut')
    INTO v_mode
    FROM public.app_settings
    WHERE key = 'anchor_engine_mode';
  IF v_mode IS NULL THEN v_mode := 'day_cut'; END IF;

  IF v_mode = 'hybrid' THEN
    SELECT COALESCE(SUM(
      CASE
        WHEN e.type='income'   AND public._extract_custom_source_id(e.payment_source)=p_source_id THEN e.amount
        WHEN e.type='expense'  AND public._extract_custom_source_id(e.payment_source)=p_source_id THEN -e.amount
        WHEN e.type='transfer' AND public._extract_custom_source_id(e.payment_source)=p_source_id THEN -e.amount
        WHEN e.type='transfer' AND e.income_source_id=p_source_id THEN e.amount
        ELSE 0
      END
    ), 0)
    INTO v_sum
    FROM public.expenses e
    WHERE e.deleted_at IS NULL
      AND COALESCE(e.expense_nature,'regular') <> 'correction'
      AND (
        public._extract_custom_source_id(e.payment_source) = p_source_id
        OR e.income_source_id = p_source_id
      )
      AND (
        (e.time_confidence IN ('C1','C2') AND e.event_at IS NOT NULL AND e.event_at > v_anchor_date)
        OR
        ((e.time_confidence IS NULL OR e.time_confidence IN ('C3','C4'))
          AND (e.date AT TIME ZONE 'UTC')::date > (v_anchor_date AT TIME ZONE 'UTC')::date)
      );
  ELSE
    SELECT COALESCE(SUM(
      CASE
        WHEN e.type='income'   AND public._extract_custom_source_id(e.payment_source)=p_source_id THEN e.amount
        WHEN e.type='expense'  AND public._extract_custom_source_id(e.payment_source)=p_source_id THEN -e.amount
        WHEN e.type='transfer' AND public._extract_custom_source_id(e.payment_source)=p_source_id THEN -e.amount
        WHEN e.type='transfer' AND e.income_source_id=p_source_id THEN e.amount
        ELSE 0
      END
    ), 0)
    INTO v_sum
    FROM public.expenses e
    WHERE e.deleted_at IS NULL
      AND COALESCE(e.expense_nature,'regular') <> 'correction'
      AND (e.date AT TIME ZONE 'UTC')::date > (v_anchor_date AT TIME ZONE 'UTC')::date
      AND (
        public._extract_custom_source_id(e.payment_source) = p_source_id
        OR e.income_source_id = p_source_id
      );
  END IF;

  v_new_balance := v_anchor_balance + v_sum;

  -- Engine marker → guard trigger propušta ovaj UPDATE bez pomicanja sidra.
  PERFORM set_config('app.balance_writer', 'engine', true);
  UPDATE public.custom_payment_sources
    SET balance = v_new_balance,
        updated_at = now()
    WHERE id = p_source_id;
  PERFORM set_config('app.balance_writer', '', true);

  RETURN v_new_balance;
END;
$$;


CREATE OR REPLACE FUNCTION public._expenses_recompute_source_balance()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_old_src uuid;
  v_new_src uuid;
  v_old_dst uuid;
  v_new_dst uuid;
  v_affected uuid[];
  v_id uuid;
  v_anchor_date timestamptz;
  v_delta numeric(12,2);
  v_old_sign numeric;
  v_new_sign numeric;
  v_old_amount numeric(12,2);
  v_new_amount numeric(12,2);
  v_old_is_correction boolean;
  v_new_is_correction boolean;
  v_old_deleted boolean;
  v_new_deleted boolean;
BEGIN
  IF TG_OP IN ('UPDATE','DELETE') THEN
    v_old_src := public._extract_custom_source_id(OLD.payment_source);
    v_old_dst := CASE WHEN OLD.type = 'transfer' THEN OLD.income_source_id ELSE NULL END;
    v_old_amount := OLD.amount;
    v_old_is_correction := COALESCE(OLD.expense_nature,'regular') = 'correction';
    v_old_deleted := OLD.deleted_at IS NOT NULL;
  END IF;
  IF TG_OP IN ('INSERT','UPDATE') THEN
    v_new_src := public._extract_custom_source_id(NEW.payment_source);
    v_new_dst := CASE WHEN NEW.type = 'transfer' THEN NEW.income_source_id ELSE NULL END;
    v_new_amount := NEW.amount;
    v_new_is_correction := COALESCE(NEW.expense_nature,'regular') = 'correction';
    v_new_deleted := NEW.deleted_at IS NOT NULL;
  END IF;

  v_affected := ARRAY(
    SELECT DISTINCT x FROM unnest(ARRAY[v_old_src, v_new_src, v_old_dst, v_new_dst]) AS t(x)
    WHERE x IS NOT NULL
  );

  FOREACH v_id IN ARRAY v_affected LOOP
    SELECT correction_anchor_date INTO v_anchor_date
      FROM public.custom_payment_sources WHERE id = v_id;

    IF v_anchor_date IS NOT NULL THEN
      PERFORM public.recompute_custom_source_balance(v_id);
    ELSE
      v_delta := 0;
      IF TG_OP IN ('UPDATE','DELETE') AND NOT v_old_deleted AND NOT v_old_is_correction THEN
        v_old_sign := CASE
          WHEN OLD.type='income'   AND v_old_src = v_id THEN  1
          WHEN OLD.type='expense'  AND v_old_src = v_id THEN -1
          WHEN OLD.type='transfer' AND v_old_src = v_id THEN -1
          WHEN OLD.type='transfer' AND v_old_dst = v_id THEN  1
          ELSE 0
        END;
        v_delta := v_delta - (v_old_sign * v_old_amount);
      END IF;
      IF TG_OP IN ('INSERT','UPDATE') AND NOT v_new_deleted AND NOT v_new_is_correction THEN
        v_new_sign := CASE
          WHEN NEW.type='income'   AND v_new_src = v_id THEN  1
          WHEN NEW.type='expense'  AND v_new_src = v_id THEN -1
          WHEN NEW.type='transfer' AND v_new_src = v_id THEN -1
          WHEN NEW.type='transfer' AND v_new_dst = v_id THEN  1
          ELSE 0
        END;
        v_delta := v_delta + (v_new_sign * v_new_amount);
      END IF;

      IF v_delta <> 0 THEN
        PERFORM set_config('app.balance_writer', 'engine', true);
        UPDATE public.custom_payment_sources
          SET balance = balance + v_delta,
              updated_at = now()
          WHERE id = v_id;
        PERFORM set_config('app.balance_writer', '', true);
      END IF;
    END IF;
  END LOOP;

  RETURN COALESCE(NEW, OLD);
END;
$$;


CREATE OR REPLACE FUNCTION public.set_source_anchor(
  p_source_id      uuid,
  p_anchor_ts      timestamptz,
  p_anchor_balance numeric,
  p_correction     jsonb DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller       uuid := auth.uid();
  v_owner        uuid;
  v_correction_id uuid;
  v_balance_after numeric(12,2);
  v_type         text;
  v_amount       numeric(12,2);
BEGIN
  IF v_caller IS NULL THEN
    RAISE EXCEPTION 'set_source_anchor: unauthenticated' USING ERRCODE = '42501';
  END IF;

  SELECT user_id INTO v_owner
    FROM public.custom_payment_sources
    WHERE id = p_source_id
    FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'set_source_anchor: source % not found', p_source_id USING ERRCODE = 'P0002';
  END IF;
  IF v_owner <> v_caller THEN
    RAISE EXCEPTION 'set_source_anchor: not owner' USING ERRCODE = '42501';
  END IF;

  PERFORM set_config('app.allow_anchor_write', 'on', true);

  -- Engine marker za guard trigger.
  PERFORM set_config('app.balance_writer', 'engine', true);
  UPDATE public.custom_payment_sources
     SET correction_anchor_date    = p_anchor_ts,
         correction_anchor_balance = p_anchor_balance,
         balance                   = p_anchor_balance,
         updated_at                = now()
   WHERE id = p_source_id;
  PERFORM set_config('app.balance_writer', '', true);

  IF p_correction IS NOT NULL
     AND (p_correction ? 'amount')
     AND (p_correction->>'amount')::numeric <> 0
  THEN
    v_amount := (p_correction->>'amount')::numeric;
    v_type := COALESCE(
      p_correction->>'type',
      CASE WHEN v_amount >= 0 THEN 'income' ELSE 'expense' END
    );
    v_correction_id := gen_random_uuid();

    -- Umetanje correction reda pokreće `trg_expenses_recompute_source_balance`
    -- koji radi UPDATE balance-a — mora ići kroz engine marker.
    PERFORM set_config('app.balance_writer', 'engine', true);
    INSERT INTO public.expenses (
      id, user_id, type, amount, payment_source,
      date, event_at, time_confidence, user_edited_event_at,
      expense_nature, description, category, note
    ) VALUES (
      v_correction_id, v_caller, v_type, abs(v_amount),
      'custom:' || p_source_id::text,
      p_anchor_ts, p_anchor_ts, 'C1', false,
      'correction',
      COALESCE(p_correction->>'description', 'Korekcija salda'),
      COALESCE(p_correction->>'category', 'other'),
      p_correction->>'note'
    );
    PERFORM set_config('app.balance_writer', '', true);
  END IF;

  PERFORM public.recompute_custom_source_balance(p_source_id);

  SELECT balance INTO v_balance_after
    FROM public.custom_payment_sources
    WHERE id = p_source_id;

  RETURN jsonb_build_object(
    'source_id',      p_source_id,
    'anchor_ts',      p_anchor_ts,
    'anchor_balance', p_anchor_balance,
    'correction_id',  v_correction_id,
    'balance_after',  v_balance_after
  );
END;
$$;

REVOKE ALL ON FUNCTION public.set_source_anchor(uuid, timestamptz, numeric, jsonb) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.set_source_anchor(uuid, timestamptz, numeric, jsonb) FROM anon;
GRANT EXECUTE ON FUNCTION public.set_source_anchor(uuid, timestamptz, numeric, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.set_source_anchor(uuid, timestamptz, numeric, jsonb) TO service_role;


-- ---------------------------------------------------------------------------
-- 2) Guard trigger — BEFORE UPDATE OF balance: pomakni sidro na (now, NEW.balance).
--    Ne dira ništa ako je writer engine ili delta=0.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public._cps_balance_guard_before()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_writer text;
BEGIN
  -- Skip: balance nije stvarno mijenjan.
  IF NEW.balance IS NOT DISTINCT FROM OLD.balance THEN
    RETURN NEW;
  END IF;

  -- Skip: interni writer (recompute / set_source_anchor).
  v_writer := current_setting('app.balance_writer', true);
  IF v_writer = 'engine' THEN
    RETURN NEW;
  END IF;

  -- Vanjski raw write → auto-anchor na now/NEW.balance.
  NEW.correction_anchor_date    := now();
  NEW.correction_anchor_balance := NEW.balance;
  NEW.updated_at                := now();

  RETURN NEW;
END;
$$;

-- ---------------------------------------------------------------------------
-- 3) Guard trigger — AFTER UPDATE OF balance: audit correction red.
--    INSERT ide s engine markerom kako recompute-trigger nad expenses ne bi
--    stvorio rekurzivni user-facing UPDATE.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public._cps_balance_guard_after()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_writer text;
  v_delta  numeric(12,2);
BEGIN
  IF NEW.balance IS NOT DISTINCT FROM OLD.balance THEN
    RETURN NULL;
  END IF;

  v_writer := current_setting('app.balance_writer', true);
  IF v_writer = 'engine' THEN
    RETURN NULL;
  END IF;

  v_delta := NEW.balance - OLD.balance;
  IF v_delta = 0 THEN
    RETURN NULL;
  END IF;

  PERFORM set_config('app.balance_writer', 'engine', true);
  INSERT INTO public.expenses (
    id, user_id, type, amount, payment_source,
    date, event_at, time_confidence, user_edited_event_at,
    expense_nature, description, category, note
  ) VALUES (
    gen_random_uuid(),
    NEW.user_id,
    CASE WHEN v_delta > 0 THEN 'income' ELSE 'expense' END,
    abs(v_delta),
    'custom:' || NEW.id::text,
    now(), now(), 'C2', false,
    'correction',
    'Auto-korekcija salda',
    'other',
    'auto_balance_correction: legacy direct write s ' || OLD.balance::text ||
      ' na ' || NEW.balance::text
  );
  PERFORM set_config('app.balance_writer', '', true);

  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_cps_balance_guard_before ON public.custom_payment_sources;
CREATE TRIGGER trg_cps_balance_guard_before
BEFORE UPDATE OF balance ON public.custom_payment_sources
FOR EACH ROW
EXECUTE FUNCTION public._cps_balance_guard_before();

DROP TRIGGER IF EXISTS trg_cps_balance_guard_after ON public.custom_payment_sources;
CREATE TRIGGER trg_cps_balance_guard_after
AFTER UPDATE OF balance ON public.custom_payment_sources
FOR EACH ROW
EXECUTE FUNCTION public._cps_balance_guard_after();
