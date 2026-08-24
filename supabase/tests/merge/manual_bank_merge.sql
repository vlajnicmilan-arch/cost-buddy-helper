-- Manual ↔ bank merge SQL harness.
--
-- Authoritative guard for `merge_manual_with_bank`: proves the happy path,
-- every defense-in-depth guard, the fingerprint move, and — most importantly —
-- that the merge does NOT change the wallet balance.
--
-- Runs inside one transaction and ROLLBACKs; nothing survives.

\set ON_ERROR_STOP on
BEGIN;

CREATE TEMP TABLE _mfix (key text PRIMARY KEY, val uuid NOT NULL);
INSERT INTO _mfix VALUES
  ('src_a', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'),
  ('src_b', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'),
  ('user',  '00000000-0000-0000-0000-000000000001'),
  ('other', '00000000-0000-0000-0000-000000000002');

INSERT INTO auth.users (id, email) VALUES
  ('00000000-0000-0000-0000-000000000001', 'merge-owner@example.test'),
  ('00000000-0000-0000-0000-000000000002', 'merge-other@example.test')
ON CONFLICT DO NOTHING;

CREATE OR REPLACE FUNCTION pg_temp.assert_eq(label text, expected numeric, actual numeric)
RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  IF abs(COALESCE(actual,0) - COALESCE(expected,0)) < 0.005 THEN
    RAISE NOTICE 'PASS % — expected=%, actual=%', label, expected, actual;
  ELSE
    RAISE EXCEPTION 'FAIL % — expected=%, actual=%', label, expected, actual;
  END IF;
END; $$;

CREATE OR REPLACE FUNCTION pg_temp.assert_text(label text, expected text, actual text)
RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  IF COALESCE(expected,'<null>') = COALESCE(actual,'<null>') THEN
    RAISE NOTICE 'PASS % — %', label, COALESCE(actual,'<null>');
  ELSE
    RAISE EXCEPTION 'FAIL % — expected=%, actual=%', label, expected, actual;
  END IF;
END; $$;

/** Asserts the RPC raises exactly the expected error code (message text). */
CREATE OR REPLACE FUNCTION pg_temp.assert_raises(label text, p_manual uuid, p_bank uuid, expected text)
RETURNS void LANGUAGE plpgsql AS $$
DECLARE v_msg text;
BEGIN
  BEGIN
    PERFORM public.merge_manual_with_bank(p_manual, p_bank);
    RAISE EXCEPTION 'FAIL % — expected error "%" but merge succeeded', label, expected;
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS v_msg = MESSAGE_TEXT;
    IF v_msg LIKE 'FAIL %' THEN RAISE; END IF;
    IF v_msg <> expected THEN
      RAISE EXCEPTION 'FAIL % — expected error "%", got "%"', label, expected, v_msg;
    END IF;
    RAISE NOTICE 'PASS % — %', label, v_msg;
  END;
END; $$;

CREATE OR REPLACE FUNCTION pg_temp.reset_world()
RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  DELETE FROM public.expenses
   WHERE user_id IN ('00000000-0000-0000-0000-000000000001',
                     '00000000-0000-0000-0000-000000000002');
  DELETE FROM public.custom_payment_sources
   WHERE id IN ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
                'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb');
  INSERT INTO public.custom_payment_sources (id, user_id, name, balance, currency)
  VALUES ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','00000000-0000-0000-0000-000000000001','Wallet A',0,'EUR'),
         ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb','00000000-0000-0000-0000-000000000001','Wallet B',0,'EUR');
END; $$;

/** Manual/scanned row (no fingerprint) — carries the user's content. */
CREATE OR REPLACE FUNCTION pg_temp.mk_manual(
  p_user uuid, p_src text, p_type text, p_amount numeric, p_date timestamptz,
  p_nature text DEFAULT 'regular'
) RETURNS uuid LANGUAGE plpgsql AS $$
DECLARE v_id uuid;
BEGIN
  INSERT INTO public.expenses (user_id, type, amount, payment_source, date, currency,
                               description, category, merchant_name, receipt_url,
                               expense_nature, bank_match_status)
  VALUES (p_user, p_type, p_amount, p_src, p_date, 'EUR',
          'Pevex — silikon i vijci', 'home', 'Pevex', 'local:receipt-1.jpg',
          p_nature, 'manual')
  RETURNING id INTO v_id;
  RETURN v_id;
END; $$;

/** Bank/import row — carries the statement identity. */
CREATE OR REPLACE FUNCTION pg_temp.mk_bank(
  p_user uuid, p_src text, p_type text, p_amount numeric, p_date timestamptz,
  p_fp text, p_nature text DEFAULT 'regular'
) RETURNS uuid LANGUAGE plpgsql AS $$
DECLARE v_id uuid;
BEGIN
  INSERT INTO public.expenses (user_id, type, amount, payment_source, date, currency,
                               description, expense_nature,
                               bank_transaction_id, bank_match_status,
                               balance_after, bank_row_seq, bank_raw_line, bank_raw_line_source)
  VALUES (p_user, p_type, p_amount, p_src, p_date, 'EUR',
          'POS 1234 PEVEX', p_nature,
          p_fp, 'bank_only',
          958.50, 17, '18.08. POS 1234 PEVEX 21,50', 'pdf')
  RETURNING id INTO v_id;
  RETURN v_id;
END; $$;

SET LOCAL "request.jwt.claim.sub" = '00000000-0000-0000-0000-000000000001';

-- ===========================================================================
-- 1) HAPPY PATH — live case: scan 21,50 on 17.08. vs bank row 21,50 on 18.08.
-- ===========================================================================
DO $$
DECLARE v_m uuid; v_b uuid; v_row record; v_alive int; v_bal numeric;
BEGIN
  PERFORM pg_temp.reset_world();
  v_m := pg_temp.mk_manual('00000000-0000-0000-0000-000000000001','custom:aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','expense',21.50,'2026-08-17 10:00+00');
  v_b := pg_temp.mk_bank  ('00000000-0000-0000-0000-000000000001','custom:aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','expense',21.50,'2026-08-18 00:00+00','imp2:pevex');

  SELECT balance INTO v_bal FROM public.custom_payment_sources WHERE id='aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
  PERFORM pg_temp.assert_eq('1.0 both rows counted before merge', -43.00, v_bal);

  PERFORM public.merge_manual_with_bank(v_m, v_b);

  SELECT count(*) INTO v_alive FROM public.expenses
   WHERE user_id='00000000-0000-0000-0000-000000000001' AND deleted_at IS NULL;
  PERFORM pg_temp.assert_eq('1.1 exactly one surviving row', 1, v_alive);

  SELECT * INTO v_row FROM public.expenses WHERE id = v_m;
  PERFORM pg_temp.assert_text('1.2 keeps user description', 'Pevex — silikon i vijci', v_row.description);
  PERFORM pg_temp.assert_text('1.3 keeps user category', 'home', v_row.category);
  PERFORM pg_temp.assert_text('1.4 keeps receipt', 'local:receipt-1.jpg', v_row.receipt_url);
  PERFORM pg_temp.assert_text('1.5 inherits fingerprint', 'imp2:pevex', v_row.bank_transaction_id);
  PERFORM pg_temp.assert_text('1.6 inherits raw statement line', '18.08. POS 1234 PEVEX 21,50', v_row.bank_raw_line);
  PERFORM pg_temp.assert_eq('1.7 inherits balance_after', 958.50, v_row.balance_after);
  PERFORM pg_temp.assert_eq('1.8 inherits bank_row_seq', 17, v_row.bank_row_seq);
  PERFORM pg_temp.assert_text('1.9 marked confirmed', 'confirmed', v_row.bank_match_status);
  PERFORM pg_temp.assert_text('1.10 inherits booking date', '2026-08-18', to_char(v_row.date AT TIME ZONE 'UTC','YYYY-MM-DD'));

  SELECT * INTO v_row FROM public.expenses WHERE id = v_b;
  PERFORM pg_temp.assert_text('1.11 bank row archived', 'yes', CASE WHEN v_row.deleted_at IS NOT NULL THEN 'yes' ELSE 'no' END);
  PERFORM pg_temp.assert_text('1.12 bank row released the fingerprint', '<null>', COALESCE(v_row.bank_transaction_id,'<null>'));

  SELECT balance INTO v_bal FROM public.custom_payment_sources WHERE id='aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
  PERFORM pg_temp.assert_eq('1.13 balance = one expense (no double revert)', -21.50, v_bal);
END $$;

-- ===========================================================================
-- 2) Re-import of the same statement row still dedups on the merged row
-- ===========================================================================
DO $$
DECLARE v_msg text; v_ok boolean := false;
BEGIN
  BEGIN
    INSERT INTO public.expenses (user_id, type, amount, payment_source, date, bank_transaction_id)
    VALUES ('00000000-0000-0000-0000-000000000001','expense',21.50,'custom:aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','2026-08-18 00:00+00','imp2:pevex');
  EXCEPTION WHEN unique_violation THEN
    v_ok := true;
  END;
  IF NOT v_ok THEN
    RAISE EXCEPTION 'FAIL 2.0 re-import of the merged fingerprint was NOT deduped';
  END IF;
  RAISE NOTICE 'PASS 2.0 re-import hits uniq_expenses_user_bank_tx on the merged row';
END $$;

-- ===========================================================================
-- 3) Anchored source — the merge itself must not move the balance
-- ===========================================================================
DO $$
DECLARE v_m uuid; v_b uuid; v_before numeric; v_after numeric;
BEGIN
  PERFORM pg_temp.reset_world();
  -- Sanctioned anchor path (a raw balance UPDATE would auto-anchor to now()).
  PERFORM public.set_source_anchor(
    'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'::uuid,
    '2026-08-01 00:00+00'::timestamptz,
    1000.00,
    NULL::jsonb
  );

  v_m := pg_temp.mk_manual('00000000-0000-0000-0000-000000000001','custom:aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','expense',21.50,'2026-08-17 10:00+00');
  v_b := pg_temp.mk_bank  ('00000000-0000-0000-0000-000000000001','custom:aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','expense',21.50,'2026-08-18 00:00+00','imp2:anchored');

  -- Two rows in the books, one of which is about to be archived by the merge.
  SELECT balance INTO v_before FROM public.custom_payment_sources WHERE id='aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';

  PERFORM public.merge_manual_with_bank(v_m, v_b);

  SELECT balance INTO v_after FROM public.custom_payment_sources WHERE id='aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
  -- Exactly ONE expense effect disappears (the archived duplicate) — never two.
  PERFORM pg_temp.assert_eq('3.0 anchored source: two rows before merge', 957.00, v_before);
  PERFORM pg_temp.assert_eq('3.1 anchored source: merge removes exactly one 21.50 effect',
                            978.50, v_after);
END $$;

-- ===========================================================================
-- 4) Guards (defense in depth)
-- ===========================================================================
DO $$
DECLARE v_m uuid; v_b uuid; v_m2 uuid; v_b2 uuid;
BEGIN
  PERFORM pg_temp.reset_world();

  -- 4.1 different payment source
  v_m := pg_temp.mk_manual('00000000-0000-0000-0000-000000000001','custom:aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','expense',21.50,'2026-08-17 10:00+00');
  v_b := pg_temp.mk_bank  ('00000000-0000-0000-0000-000000000001','custom:bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb','expense',21.50,'2026-08-18 00:00+00','imp2:g1');
  PERFORM pg_temp.assert_raises('4.1 different source', v_m, v_b, 'different_source');

  -- 4.2 five days apart rejected, four days accepted
  PERFORM pg_temp.reset_world();
  v_m := pg_temp.mk_manual('00000000-0000-0000-0000-000000000001','custom:aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','expense',21.50,'2026-08-17 10:00+00');
  v_b := pg_temp.mk_bank  ('00000000-0000-0000-0000-000000000001','custom:aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','expense',21.50,'2026-08-22 00:00+00','imp2:g2');
  PERFORM pg_temp.assert_raises('4.2 date too far (5 days)', v_m, v_b, 'date_too_far');

  PERFORM pg_temp.reset_world();
  v_m := pg_temp.mk_manual('00000000-0000-0000-0000-000000000001','custom:aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','expense',21.50,'2026-08-17 10:00+00');
  v_b := pg_temp.mk_bank  ('00000000-0000-0000-0000-000000000001','custom:aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','expense',21.50,'2026-08-21 00:00+00','imp2:g3');
  PERFORM public.merge_manual_with_bank(v_m, v_b);
  RAISE NOTICE 'PASS 4.3 exactly four days apart merges';

  -- 4.4 transfers
  PERFORM pg_temp.reset_world();
  v_m := pg_temp.mk_manual('00000000-0000-0000-0000-000000000001','custom:aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','transfer',21.50,'2026-08-17 10:00+00');
  v_b := pg_temp.mk_bank  ('00000000-0000-0000-0000-000000000001','custom:aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','transfer',21.50,'2026-08-18 00:00+00','imp2:g4');
  PERFORM pg_temp.assert_raises('4.4 transfer not allowed', v_m, v_b, 'transfer_not_allowed');

  -- 4.5 corrections
  PERFORM pg_temp.reset_world();
  v_m := pg_temp.mk_manual('00000000-0000-0000-0000-000000000001','custom:aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','expense',21.50,'2026-08-17 10:00+00','correction');
  v_b := pg_temp.mk_bank  ('00000000-0000-0000-0000-000000000001','custom:aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','expense',21.50,'2026-08-18 00:00+00','imp2:g5');
  PERFORM pg_temp.assert_raises('4.5 correction not allowed', v_m, v_b, 'correction_not_allowed');

  -- 4.6 different amount
  PERFORM pg_temp.reset_world();
  v_m := pg_temp.mk_manual('00000000-0000-0000-0000-000000000001','custom:aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','expense',21.50,'2026-08-17 10:00+00');
  v_b := pg_temp.mk_bank  ('00000000-0000-0000-0000-000000000001','custom:aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','expense',25.00,'2026-08-18 00:00+00','imp2:g6');
  PERFORM pg_temp.assert_raises('4.6 different amount', v_m, v_b, 'different_amount');

  -- 4.7 different type
  PERFORM pg_temp.reset_world();
  v_m := pg_temp.mk_manual('00000000-0000-0000-0000-000000000001','custom:aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','expense',21.50,'2026-08-17 10:00+00');
  v_b := pg_temp.mk_bank  ('00000000-0000-0000-0000-000000000001','custom:aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','income',21.50,'2026-08-18 00:00+00','imp2:g7');
  PERFORM pg_temp.assert_raises('4.7 different type', v_m, v_b, 'different_type');

  -- 4.8 both manual / both bank
  PERFORM pg_temp.reset_world();
  v_m := pg_temp.mk_manual('00000000-0000-0000-0000-000000000001','custom:aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','expense',21.50,'2026-08-17 10:00+00');
  v_m2:= pg_temp.mk_manual('00000000-0000-0000-0000-000000000001','custom:aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','expense',21.50,'2026-08-17 10:00+00');
  PERFORM pg_temp.assert_raises('4.8 bank side is manual', v_m, v_m2, 'bank_is_manual');

  PERFORM pg_temp.reset_world();
  v_b := pg_temp.mk_bank('00000000-0000-0000-0000-000000000001','custom:aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','expense',21.50,'2026-08-17 10:00+00','imp2:g8');
  v_b2:= pg_temp.mk_bank('00000000-0000-0000-0000-000000000001','custom:aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','expense',21.50,'2026-08-18 00:00+00','imp2:g9');
  PERFORM pg_temp.assert_raises('4.9 manual side is bank', v_b, v_b2, 'manual_is_bank');

  -- 4.10 advance protected
  PERFORM pg_temp.reset_world();
  v_m := pg_temp.mk_manual('00000000-0000-0000-0000-000000000001','custom:aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','expense',21.50,'2026-08-17 10:00+00');
  UPDATE public.expenses SET is_advance = true WHERE id = v_m;
  v_b := pg_temp.mk_bank('00000000-0000-0000-0000-000000000001','custom:aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','expense',21.50,'2026-08-18 00:00+00','imp2:g10');
  PERFORM pg_temp.assert_raises('4.10 advance protected', v_m, v_b, 'advance_protected');

  -- 4.11 already confirmed
  PERFORM pg_temp.reset_world();
  v_m := pg_temp.mk_manual('00000000-0000-0000-0000-000000000001','custom:aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','expense',21.50,'2026-08-17 10:00+00');
  UPDATE public.expenses SET bank_match_status = 'confirmed' WHERE id = v_m;
  v_b := pg_temp.mk_bank('00000000-0000-0000-0000-000000000001','custom:aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','expense',21.50,'2026-08-18 00:00+00','imp2:g11');
  PERFORM pg_temp.assert_raises('4.11 already confirmed', v_m, v_b, 'already_confirmed');

  -- 4.12 cross-user
  PERFORM pg_temp.reset_world();
  v_m := pg_temp.mk_manual('00000000-0000-0000-0000-000000000002','custom:aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','expense',21.50,'2026-08-17 10:00+00');
  v_b := pg_temp.mk_bank  ('00000000-0000-0000-0000-000000000001','custom:aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','expense',21.50,'2026-08-18 00:00+00','imp2:g12');
  PERFORM pg_temp.assert_raises('4.12 not authorized (other user manual row)', v_m, v_b, 'not_authorized');

  -- 4.13 deleted rows
  PERFORM pg_temp.reset_world();
  v_m := pg_temp.mk_manual('00000000-0000-0000-0000-000000000001','custom:aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','expense',21.50,'2026-08-17 10:00+00');
  v_b := pg_temp.mk_bank  ('00000000-0000-0000-0000-000000000001','custom:aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','expense',21.50,'2026-08-18 00:00+00','imp2:g13');
  UPDATE public.expenses SET deleted_at = now() WHERE id = v_b;
  PERFORM pg_temp.assert_raises('4.13 bank row deleted', v_m, v_b, 'bank_deleted');
END $$;

-- ===========================================================================
-- 5) Anonymous caller is rejected
-- ===========================================================================
DO $$
DECLARE v_m uuid; v_b uuid;
BEGIN
  PERFORM pg_temp.reset_world();
  v_m := pg_temp.mk_manual('00000000-0000-0000-0000-000000000001','custom:aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','expense',21.50,'2026-08-17 10:00+00');
  v_b := pg_temp.mk_bank  ('00000000-0000-0000-0000-000000000001','custom:aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','expense',21.50,'2026-08-18 00:00+00','imp2:g14');
  PERFORM set_config('request.jwt.claim.sub', '', true);
  PERFORM pg_temp.assert_raises('5.0 anonymous rejected', v_m, v_b, 'not_authenticated');
END $$;

ROLLBACK;
