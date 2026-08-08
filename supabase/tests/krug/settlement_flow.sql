-- Krug settlement flow harness (Faza B popravak).
--
-- Ovaj test STVARNO IZVRŠAVA tok (raniji su provjeravali samo strukturu, pa je
-- mrtva brava `pg_advisory_xact_lock(bigint,bigint)` preživjela).
--
-- Pokriva:
--   S0  dokaz padanja na STAROJ bravi (bigint,bigint) → 42883
--   S1  dužnik označi podmirenje → redak u krug_settlement_ledger
--   S2  vjerovnik pokuša označiti → only_debtor_can_settle
--   S3  treći punopravni član pokuša → only_debtor_can_settle
--   S4  vjerovnik poništi s razlogom → voided_at postavljen
--   S5  treći član pokuša poništiti → only_party_can_void
--
-- Usage (iz run.sh):
--   psql -v krug_id=... -v debtor_id=... -v creditor_id=... -v third_id=... \
--        -f supabase/tests/krug/settlement_flow.sql

\set ON_ERROR_STOP on

-- Harness prep: stub ledger tablica iz baseline.sql nema pune stupce.
ALTER TABLE public.krug_settlement_ledger
  ADD COLUMN IF NOT EXISTS currency text NOT NULL DEFAULT 'EUR',
  ADD COLUMN IF NOT EXISTS note text,
  ADD COLUMN IF NOT EXISTS marked_by uuid,
  ADD COLUMN IF NOT EXISTS marked_at timestamptz NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS voided_at timestamptz,
  ADD COLUMN IF NOT EXISTS voided_by uuid,
  ADD COLUMN IF NOT EXISTS void_reason text,
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

CREATE OR REPLACE FUNCTION public.krug_is_full_member(_krug uuid, _user uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.krug_membership
     WHERE krug_id = _krug AND user_id = _user
       AND role = 'punopravni'::public.krug_membership_role
  );
$$;

-- Klon s POKVARENOM (starom) bravom — služi samo kao dokaz padanja.
CREATE OR REPLACE FUNCTION public.krug_mark_settled__oldlock(p_krug_id uuid, p_from_user uuid, p_to_user uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_a bigint; v_b bigint;
BEGIN
  v_a := hashtextextended(p_krug_id::text || ':' || LEAST(p_from_user, p_to_user)::text, 0);
  v_b := hashtextextended(p_krug_id::text || ':' || GREATEST(p_from_user, p_to_user)::text, 0);
  PERFORM pg_advisory_xact_lock(v_a, v_b);
END $$;

BEGIN;

SELECT set_config('test.krug_id', :'krug_id', false),
       set_config('test.debtor_id', :'debtor_id', false),
       set_config('test.creditor_id', :'creditor_id', false),
       set_config('test.third_id', :'third_id', false);

DO $$
DECLARE
  v_krug uuid := trim(both '''' from current_setting('test.krug_id'))::uuid;
  v_debtor uuid := trim(both '''' from current_setting('test.debtor_id'))::uuid;
  v_creditor uuid := trim(both '''' from current_setting('test.creditor_id'))::uuid;
  v_third uuid := trim(both '''' from current_setting('test.third_id'))::uuid;
  v_ledger uuid;
  v_json jsonb;
  v_cnt int;
BEGIN
  -- S0: stara brava mora puknuti na 42883 (undefined_function)
  BEGIN
    PERFORM public.krug_mark_settled__oldlock(v_krug, v_debtor, v_creditor);
    RAISE EXCEPTION 'FAIL S0: stara brava (bigint,bigint) nije pukla';
  EXCEPTION WHEN undefined_function THEN
    RAISE NOTICE 'PASS S0: stara brava puca na 42883 (dokaz kvara)';
  END;

  -- S1: dužnik označi podmirenje
  PERFORM set_config('request.jwt.claim.sub', v_debtor::text, true);
  v_json := public.krug_mark_settled(v_krug, v_debtor, v_creditor, 15.50, 'EUR', 'gotovina');
  v_ledger := (v_json->>'id')::uuid;
  IF v_ledger IS NULL THEN RAISE EXCEPTION 'FAIL S1: nema ledger id'; END IF;
  SELECT count(*) INTO v_cnt FROM public.krug_settlement_ledger
   WHERE id = v_ledger AND from_user = v_debtor AND to_user = v_creditor
     AND amount = 15.50 AND currency = 'EUR' AND voided_at IS NULL;
  IF v_cnt <> 1 THEN RAISE EXCEPTION 'FAIL S1: ledger redak nije ispravan'; END IF;
  RAISE NOTICE 'PASS S1: dužnik zabilježio podmirenje (%)', v_ledger;

  -- S2: vjerovnik ne smije označiti
  PERFORM set_config('request.jwt.claim.sub', v_creditor::text, true);
  BEGIN
    PERFORM public.krug_mark_settled(v_krug, v_debtor, v_creditor, 5, 'EUR', null);
    RAISE EXCEPTION 'FAIL S2: vjerovnik je smio označiti';
  EXCEPTION WHEN insufficient_privilege THEN
    IF SQLERRM NOT LIKE '%only_debtor_can_settle%' THEN
      RAISE EXCEPTION 'FAIL S2: krivi error kod: %', SQLERRM;
    END IF;
    RAISE NOTICE 'PASS S2: vjerovnik odbijen (only_debtor_can_settle)';
  END;

  -- S3: treći punopravni član ne smije označiti
  PERFORM set_config('request.jwt.claim.sub', v_third::text, true);
  BEGIN
    PERFORM public.krug_mark_settled(v_krug, v_debtor, v_creditor, 5, 'EUR', null);
    RAISE EXCEPTION 'FAIL S3: treći član je smio označiti';
  EXCEPTION WHEN insufficient_privilege THEN
    IF SQLERRM NOT LIKE '%only_debtor_can_settle%' THEN
      RAISE EXCEPTION 'FAIL S3: krivi error kod: %', SQLERRM;
    END IF;
    RAISE NOTICE 'PASS S3: treći član odbijen';
  END;

  -- S5: treći član ne smije poništiti (prije nego vjerovnik poništi)
  BEGIN
    PERFORM public.krug_void_settlement(v_ledger, 'nije moje');
    RAISE EXCEPTION 'FAIL S5: treći član je smio poništiti';
  EXCEPTION WHEN insufficient_privilege THEN
    IF SQLERRM NOT LIKE '%only_party_can_void%' THEN
      RAISE EXCEPTION 'FAIL S5: krivi error kod: %', SQLERRM;
    END IF;
    RAISE NOTICE 'PASS S5: treći član odbijen na poništenju';
  END;

  -- S4: vjerovnik poništava s razlogom
  PERFORM set_config('request.jwt.claim.sub', v_creditor::text, true);
  PERFORM public.krug_void_settlement(v_ledger, 'nisam primio novac');
  SELECT count(*) INTO v_cnt FROM public.krug_settlement_ledger
   WHERE id = v_ledger AND voided_at IS NOT NULL AND voided_by = v_creditor
     AND void_reason = 'nisam primio novac';
  IF v_cnt <> 1 THEN RAISE EXCEPTION 'FAIL S4: poništenje nije zabilježeno'; END IF;
  RAISE NOTICE 'PASS S4: vjerovnik poništio podmirenje';

  RAISE NOTICE '--- SETTLEMENT FLOW: ALL PASS ---';
END $$;

ROLLBACK;

DROP FUNCTION IF EXISTS public.krug_mark_settled__oldlock(uuid, uuid, uuid);
