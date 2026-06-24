-- Fix: trigger must apply incremental delta for unanchored sources.
-- Recompute path (anchor + post-anchor sum) only runs for anchored sources.

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
  );

  FOREACH v_id IN ARRAY v_affected LOOP
    SELECT correction_anchor_date INTO v_anchor_date
      FROM public.custom_payment_sources WHERE id = v_id;

    IF v_anchor_date IS NOT NULL THEN
      -- Anchored: full recompute from anchor
      PERFORM public.recompute_custom_source_balance(v_id);
    ELSE
      -- Unanchored: apply incremental delta from OLD/NEW
      v_delta := 0;

      -- Subtract OLD contribution (UPDATE/DELETE), only if it was a live, non-correction row
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

      -- Add NEW contribution (INSERT/UPDATE), only if it is a live, non-correction row
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
        UPDATE public.custom_payment_sources
          SET balance = balance + v_delta,
              updated_at = now()
          WHERE id = v_id;
      END IF;
    END IF;
  END LOOP;

  RETURN COALESCE(NEW, OLD);
END;
$function$;

-- One-time data fix: apply the single transaction created after the previous
-- migration (2026-06-24 13:12:12+00) that never reached the balance because
-- the trigger was a no-op for unanchored sources.
UPDATE public.custom_payment_sources
  SET balance = balance + 100.00,
      updated_at = now()
  WHERE id = 'fbb2778b-e1ed-4aef-8716-99860b1d73a7'
    AND correction_anchor_date IS NULL;
