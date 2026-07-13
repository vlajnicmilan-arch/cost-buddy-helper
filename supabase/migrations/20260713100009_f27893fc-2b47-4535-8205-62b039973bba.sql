CREATE OR REPLACE FUNCTION public.recompute_custom_source_balance(p_source_id uuid)
 RETURNS numeric
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
    WHERE id = p_source_id
    FOR UPDATE;

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
$function$;

CREATE OR REPLACE FUNCTION public._expenses_recompute_source_balance()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
    ORDER BY x
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
$function$;