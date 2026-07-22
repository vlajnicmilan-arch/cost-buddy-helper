
-- =========================================================================
-- FAZA 1: SIDRO/RECONCILIATION TEMELJ
-- Uvodi anchor_source (porijeklo sidra), anchor_audit tablicu,
-- backfill svih nesidranih novčanika, auto-seed nove novčanike,
-- reconciliation_state kolonu na imported_statements.
--
-- HARD PRAVILO: anchor_source NE UTJEČE na izračun salda.
-- Formula ostaje UVIJEK: anchor_balance + SUM(post-anchor tx).
-- =========================================================================

-- 1) Enum tipova porijekla sidra
DO $$ BEGIN
  CREATE TYPE public.anchor_source_type AS ENUM (
    'user_confirmed',      -- korisnik osobno postavio kroz Korekciju salda
    'migration',           -- automatski backfill (Faza 1)
    'bank_reconciliation', -- automatsko poravnavanje s bankinim saldom
    'system_initial'       -- auto-seed pri kreiranju novog novčanika
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- 2) Kolona anchor_source na custom_payment_sources (nullable dok se ne populatira)
ALTER TABLE public.custom_payment_sources
  ADD COLUMN IF NOT EXISTS anchor_source public.anchor_source_type;

-- 3) Anchor audit tablica
CREATE TABLE IF NOT EXISTS public.anchor_audit (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_id uuid NOT NULL REFERENCES public.custom_payment_sources(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  old_anchor_date timestamptz,
  old_anchor_balance numeric(12,2),
  old_balance numeric(12,2),
  new_anchor_date timestamptz NOT NULL,
  new_anchor_balance numeric(12,2) NOT NULL,
  anchor_source public.anchor_source_type NOT NULL,
  reason text NOT NULL,
  actor uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_anchor_audit_source ON public.anchor_audit (source_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_anchor_audit_user ON public.anchor_audit (user_id, created_at DESC);

GRANT SELECT ON public.anchor_audit TO authenticated;
GRANT ALL ON public.anchor_audit TO service_role;

ALTER TABLE public.anchor_audit ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users view own anchor audit" ON public.anchor_audit;
CREATE POLICY "Users view own anchor audit"
  ON public.anchor_audit FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

-- 4) BACKFILL — postojeća sidra (user_confirmed)
UPDATE public.custom_payment_sources
   SET anchor_source = 'user_confirmed'
 WHERE anchor_source IS NULL
   AND correction_anchor_date IS NOT NULL
   AND correction_anchor_balance IS NOT NULL;

-- 5) BACKFILL — nesidrani novčanici (migration)
--    Formula: anchor_balance = current_balance - sum(post-anchor tx effect)
--    Rezultat: recompute(anchor + sum) = current_balance → delta 0,00
--    Guard triggeri (trg_cps_balance_guard_*) firaju samo ON UPDATE OF balance,
--    a ovaj UPDATE ne dira balance → guard se ne aktivira.
WITH tx AS (
  SELECT
    cps.id AS source_id,
    cps.user_id,
    cps.balance AS current_balance,
    cps.created_at,
    COALESCE(SUM(
      CASE
        WHEN e.type='income'   AND public._extract_custom_source_id(e.payment_source)=cps.id THEN e.amount
        WHEN e.type='expense'  AND public._extract_custom_source_id(e.payment_source)=cps.id THEN -e.amount
        WHEN e.type='transfer' AND public._extract_custom_source_id(e.payment_source)=cps.id THEN -e.amount
        WHEN e.type='transfer' AND e.income_source_id=cps.id THEN e.amount
        ELSE 0
      END
    ), 0) AS sum_effect,
    MIN(e.date) AS min_tx_date
  FROM public.custom_payment_sources cps
  LEFT JOIN public.expenses e
    ON e.deleted_at IS NULL
   AND COALESCE(e.expense_nature,'regular') <> 'correction'
   AND (public._extract_custom_source_id(e.payment_source)=cps.id OR e.income_source_id=cps.id)
  WHERE cps.correction_anchor_date IS NULL
    AND cps.anchor_source IS NULL   -- idempotency guard
  GROUP BY cps.id, cps.user_id, cps.balance, cps.created_at
),
proposed AS (
  SELECT
    source_id,
    user_id,
    current_balance,
    (current_balance - sum_effect)::numeric(12,2) AS new_anchor_balance,
    COALESCE(min_tx_date - INTERVAL '1 day', created_at) AS new_anchor_date
  FROM tx
),
upd AS (
  UPDATE public.custom_payment_sources cps
     SET correction_anchor_date    = p.new_anchor_date,
         correction_anchor_balance = p.new_anchor_balance,
         anchor_source             = 'migration',
         updated_at                = now()
    FROM proposed p
   WHERE cps.id = p.source_id
  RETURNING cps.id, cps.user_id, cps.balance AS current_balance,
            cps.correction_anchor_date AS new_anchor_date,
            cps.correction_anchor_balance AS new_anchor_balance
)
INSERT INTO public.anchor_audit
  (source_id, user_id, old_anchor_date, old_anchor_balance, old_balance,
   new_anchor_date, new_anchor_balance, anchor_source, reason, actor)
SELECT
  upd.id, upd.user_id, NULL, NULL, upd.current_balance,
  upd.new_anchor_date, upd.new_anchor_balance, 'migration',
  'Faza 1 backfill: opening balance = current - sum(post-anchor tx)',
  NULL
FROM upd;

-- 6) Audit za postojeća user_confirmed sidra (jednokratno, radi kompletnosti povijesti)
INSERT INTO public.anchor_audit
  (source_id, user_id, old_anchor_date, old_anchor_balance, old_balance,
   new_anchor_date, new_anchor_balance, anchor_source, reason, actor)
SELECT
  cps.id, cps.user_id, NULL, NULL, cps.balance,
  cps.correction_anchor_date, cps.correction_anchor_balance, 'user_confirmed',
  'Faza 1 backfill: postojeće korisničko sidro dokumentirano u auditu',
  cps.user_id
FROM public.custom_payment_sources cps
WHERE cps.anchor_source = 'user_confirmed'
  AND NOT EXISTS (
    SELECT 1 FROM public.anchor_audit aa
    WHERE aa.source_id = cps.id
  );

-- 7) AUTO-SEED trigger za nove novčanike
CREATE OR REPLACE FUNCTION public._cps_autoseed_anchor()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.correction_anchor_date IS NULL THEN
    NEW.correction_anchor_date    := NEW.created_at;
    NEW.correction_anchor_balance := COALESCE(NEW.balance, 0);
    NEW.anchor_source             := 'system_initial';
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_cps_autoseed_anchor ON public.custom_payment_sources;
CREATE TRIGGER trg_cps_autoseed_anchor
  BEFORE INSERT ON public.custom_payment_sources
  FOR EACH ROW EXECUTE FUNCTION public._cps_autoseed_anchor();

-- Audit za sve buduće auto-seed inserte
CREATE OR REPLACE FUNCTION public._cps_autoseed_anchor_audit()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.anchor_source = 'system_initial' THEN
    INSERT INTO public.anchor_audit
      (source_id, user_id, old_anchor_date, old_anchor_balance, old_balance,
       new_anchor_date, new_anchor_balance, anchor_source, reason, actor)
    VALUES
      (NEW.id, NEW.user_id, NULL, NULL, NULL,
       NEW.correction_anchor_date, NEW.correction_anchor_balance, 'system_initial',
       'Auto-seed pri kreiranju novčanika', auth.uid());
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_cps_autoseed_anchor_audit ON public.custom_payment_sources;
CREATE TRIGGER trg_cps_autoseed_anchor_audit
  AFTER INSERT ON public.custom_payment_sources
  FOR EACH ROW EXECUTE FUNCTION public._cps_autoseed_anchor_audit();

-- 8) Prošireni set_source_anchor: dodaje audit + postavlja anchor_source='user_confirmed'
--    (backward-compatible: potpis i ponašanje ostaju identični, dodano je audit + source)
CREATE OR REPLACE FUNCTION public.set_source_anchor(p_source_id uuid, p_anchor_ts timestamp with time zone, p_anchor_balance numeric, p_correction jsonb DEFAULT NULL::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_caller       uuid := auth.uid();
  v_owner        uuid;
  v_correction_id uuid;
  v_balance_after numeric(12,2);
  v_type         text;
  v_amount       numeric(12,2);
  v_old_anchor_date timestamptz;
  v_old_anchor_balance numeric(12,2);
  v_old_balance numeric(12,2);
  v_old_source public.anchor_source_type;
BEGIN
  IF v_caller IS NULL THEN
    RAISE EXCEPTION 'set_source_anchor: unauthenticated' USING ERRCODE = '42501';
  END IF;

  SELECT user_id, correction_anchor_date, correction_anchor_balance, balance, anchor_source
    INTO v_owner, v_old_anchor_date, v_old_anchor_balance, v_old_balance, v_old_source
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
         anchor_source             = 'user_confirmed',
         updated_at                = now()
   WHERE id = p_source_id;
  PERFORM set_config('app.balance_writer', '', true);

  -- Audit zapis o promjeni sidra
  INSERT INTO public.anchor_audit
    (source_id, user_id, old_anchor_date, old_anchor_balance, old_balance,
     new_anchor_date, new_anchor_balance, anchor_source, reason, actor)
  VALUES
    (p_source_id, v_owner, v_old_anchor_date, v_old_anchor_balance, v_old_balance,
     p_anchor_ts, p_anchor_balance, 'user_confirmed',
     'Korisnička Korekcija salda kroz set_source_anchor', v_caller);

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
$function$;

-- 9) Reconciliation state na imported_statements
DO $$ BEGIN
  CREATE TYPE public.reconciliation_state_type AS ENUM (
    'pending',        -- treba korisnička odluka
    'aligned',        -- korisnik potvrdio poravnanje s bankinim saldom (novo sidro)
    'user_override',  -- korisnik zadržao svoj saldo
    'skipped'         -- razlika ispod praga ili preskočeno
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

ALTER TABLE public.imported_statements
  ADD COLUMN IF NOT EXISTS reconciliation_state public.reconciliation_state_type;

ALTER TABLE public.imported_statements
  ADD COLUMN IF NOT EXISTS reconciliation_meta jsonb;
