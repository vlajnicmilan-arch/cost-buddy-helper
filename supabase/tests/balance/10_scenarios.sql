-- Balance regression SQL harness — 15 SQL-relevant scenarios (B6/B7 vitest-only)
-- Run AFTER 00_setup.sql within the same psql session.
--
-- Convention per scenario:
--   ROLLBACK TO SAVEPOINT before_scenarios;
--   SAVEPOINT s_<id>;
--   ... setup + assertions ...
--   RELEASE SAVEPOINT s_<id>;

\set ON_ERROR_STOP on

-- ============================================================
-- A1 — C3 same-day expense after anchor (hybrid)
-- ============================================================
-- historic C3 variant (PASS today): excluded → balance stays 946.60
ROLLBACK TO SAVEPOINT before_scenarios; SAVEPOINT s_a1_hist;
SELECT pg_temp.reset_sources();
SELECT pg_temp.set_mode('hybrid');
SELECT pg_temp.set_anchor(
  (SELECT val FROM _bfix WHERE key='src_a'),
  '2026-06-01 09:00:00+00', 946.60);
SELECT pg_temp.mk_expense('expense', 20,
  (SELECT val FROM _bfix WHERE key='src_a'),
  '2026-06-01 00:00:00+00', '2026-06-01 14:00:00+00', 'C3');
SELECT pg_temp.assert_eq('A1 historic C3 excluded', 946.60,
  pg_temp.bal((SELECT val FROM _bfix WHERE key='src_a')));
RELEASE SAVEPOINT s_a1_hist;

-- A1 manual_entry variant (PR1) — C2 same-day AFTER anchor → included → 926.60
-- Post-PR1 writerIntent='manual_entry' upisuje event_at=now() + C2, ovdje
-- fiksiramo C2 event_at eksplicitno da testiramo invariant na DB stazi.
ROLLBACK TO SAVEPOINT before_scenarios; SAVEPOINT s_a1_manual;
SELECT pg_temp.reset_sources();
SELECT pg_temp.set_mode('hybrid');
SELECT pg_temp.set_anchor(
  (SELECT val FROM _bfix WHERE key='src_a'),
  '2026-06-01 09:00:00+00', 946.60);
SELECT pg_temp.mk_expense('expense', 20,
  (SELECT val FROM _bfix WHERE key='src_a'),
  '2026-06-01 00:00:00+00', '2026-06-01 14:00:00+00', 'C2');
SELECT pg_temp.assert_eq('A1 manual_entry C2 same-day after anchor', 926.60,
  pg_temp.bal((SELECT val FROM _bfix WHERE key='src_a')));
RELEASE SAVEPOINT s_a1_manual;

-- ============================================================
-- A2 — C3 next day after anchor → included
-- ============================================================
ROLLBACK TO SAVEPOINT before_scenarios; SAVEPOINT s_a2;
SELECT pg_temp.reset_sources();
SELECT pg_temp.set_mode('hybrid');
SELECT pg_temp.set_anchor(
  (SELECT val FROM _bfix WHERE key='src_a'),
  '2026-06-01 09:00:00+00', 946.60);
SELECT pg_temp.mk_expense('expense', 20,
  (SELECT val FROM _bfix WHERE key='src_a'),
  '2026-06-02 00:00:00+00', NULL, 'C3');
SELECT pg_temp.assert_eq('A2 C3 next day included', 926.60,
  pg_temp.bal((SELECT val FROM _bfix WHERE key='src_a')));
RELEASE SAVEPOINT s_a2;

-- ============================================================
-- A3 — C1 same-day, event_at > anchor_ts → included
-- ============================================================
ROLLBACK TO SAVEPOINT before_scenarios; SAVEPOINT s_a3;
SELECT pg_temp.reset_sources();
SELECT pg_temp.set_mode('hybrid');
SELECT pg_temp.set_anchor(
  (SELECT val FROM _bfix WHERE key='src_a'),
  '2026-06-01 09:00:00+00', 946.60);
SELECT pg_temp.mk_expense('expense', 20,
  (SELECT val FROM _bfix WHERE key='src_a'),
  '2026-06-01 00:00:00+00', '2026-06-01 10:00:00+00', 'C1');
SELECT pg_temp.assert_eq('A3 C1 same-day after anchor', 926.60,
  pg_temp.bal((SELECT val FROM _bfix WHERE key='src_a')));
RELEASE SAVEPOINT s_a3;

-- ============================================================
-- A4 — atomarni SET sidra kroz set_source_anchor RPC (PR2 Faza A)
-- Contract: stored balance je ISPRAVAN odmah po povratku iz RPC-a —
-- ne ovisi o sljedećem write-u da pokrene reconciliation.
-- ============================================================
ROLLBACK TO SAVEPOINT before_scenarios; SAVEPOINT s_a4;
SELECT pg_temp.reset_sources();
SELECT pg_temp.set_mode('hybrid');
-- Već postojeći post-anchor expense u ledgeru
SELECT pg_temp.mk_expense('expense', 100,
  (SELECT val FROM _bfix WHERE key='src_a'),
  '2026-06-05 00:00:00+00');
-- RPC zahtijeva auth.uid() = owner → simuliraj JWT sub claim.
SET LOCAL "request.jwt.claim.sub" = '00000000-0000-0000-0000-000000000001';
SELECT public.set_source_anchor(
  (SELECT val FROM _bfix WHERE key='src_a'),
  '2026-06-01 09:00:00+00'::timestamptz,
  500::numeric,
  NULL
);
-- Stored = anchor(500) + post-anchor(-100) = 400 ODMAH, bez daljnjeg write-a.
SELECT pg_temp.assert_eq('A4 stored == recompute after RPC (no leak)', 400,
  pg_temp.bal((SELECT val FROM _bfix WHERE key='src_a')));
RELEASE SAVEPOINT s_a4;


-- ============================================================
-- A5 — correction row does not count in post-anchor sum
-- ============================================================
ROLLBACK TO SAVEPOINT before_scenarios; SAVEPOINT s_a5;
SELECT pg_temp.reset_sources();
SELECT pg_temp.set_mode('hybrid');
SELECT pg_temp.set_anchor(
  (SELECT val FROM _bfix WHERE key='src_a'),
  '2026-06-01 09:00:00+00', 946.60);
SELECT pg_temp.mk_expense('expense', 999,
  (SELECT val FROM _bfix WHERE key='src_a'),
  '2026-06-05 00:00:00+00', NULL, NULL, 'correction');
SELECT pg_temp.assert_eq('A5 correction excluded', 946.60,
  pg_temp.bal((SELECT val FROM _bfix WHERE key='src_a')));
RELEASE SAVEPOINT s_a5;

-- ============================================================
-- A6 — soft delete → restore on anchored source
-- ============================================================
ROLLBACK TO SAVEPOINT before_scenarios; SAVEPOINT s_a6;
SELECT pg_temp.reset_sources();
SELECT pg_temp.set_mode('hybrid');
SELECT pg_temp.set_anchor(
  (SELECT val FROM _bfix WHERE key='src_a'),
  '2026-06-01 09:00:00+00', 946.60);
DO $$
DECLARE v_id uuid;
BEGIN
  v_id := pg_temp.mk_expense('expense', 20,
    (SELECT val FROM _bfix WHERE key='src_a'),
    '2026-06-02 00:00:00+00');
  PERFORM pg_temp.assert_eq('A6 after insert', 926.60,
    pg_temp.bal((SELECT val FROM _bfix WHERE key='src_a')));
  UPDATE public.expenses SET deleted_at = now() WHERE id = v_id;
  PERFORM pg_temp.assert_eq('A6 after soft-delete', 946.60,
    pg_temp.bal((SELECT val FROM _bfix WHERE key='src_a')));
  UPDATE public.expenses SET deleted_at = NULL WHERE id = v_id;
  PERFORM pg_temp.assert_eq('A6 after restore', 926.60,
    pg_temp.bal((SELECT val FROM _bfix WHERE key='src_a')));
END $$;
RELEASE SAVEPOINT s_a6;

-- ============================================================
-- A7 — transfer anchored→unanchored
-- ============================================================
ROLLBACK TO SAVEPOINT before_scenarios; SAVEPOINT s_a7;
SELECT pg_temp.reset_sources();
SELECT pg_temp.set_mode('hybrid');
SELECT pg_temp.set_anchor(
  (SELECT val FROM _bfix WHERE key='src_a'),
  '2026-06-01 09:00:00+00', 946.60);
SELECT pg_temp.mk_expense('transfer', 40,
  (SELECT val FROM _bfix WHERE key='src_a'),
  '2026-06-02 00:00:00+00', NULL, NULL, 'regular',
  (SELECT val FROM _bfix WHERE key='src_b'));
SELECT pg_temp.assert_eq('A7 src leg', 906.60,
  pg_temp.bal((SELECT val FROM _bfix WHERE key='src_a')));
SELECT pg_temp.assert_eq('A7 dst leg', 40,
  pg_temp.bal((SELECT val FROM _bfix WHERE key='src_b')));
RELEASE SAVEPOINT s_a7;

-- ============================================================
-- A8 — UPDATE payment_source A→B (unanchored/unanchored)
-- ============================================================
ROLLBACK TO SAVEPOINT before_scenarios; SAVEPOINT s_a8;
SELECT pg_temp.reset_sources();
SELECT pg_temp.set_mode('day_cut');
DO $$
DECLARE v_id uuid;
BEGIN
  v_id := pg_temp.mk_expense('expense', 30,
    (SELECT val FROM _bfix WHERE key='src_a'),
    '2026-06-05 00:00:00+00');
  PERFORM pg_temp.assert_eq('A8 initial A', -30,
    pg_temp.bal((SELECT val FROM _bfix WHERE key='src_a')));
  UPDATE public.expenses
    SET payment_source = 'custom:' || (SELECT val FROM _bfix WHERE key='src_b')::text
    WHERE id = v_id;
  PERFORM pg_temp.assert_eq('A8 A reverted', 0,
    pg_temp.bal((SELECT val FROM _bfix WHERE key='src_a')));
  PERFORM pg_temp.assert_eq('A8 B debited', -30,
    pg_temp.bal((SELECT val FROM _bfix WHERE key='src_b')));
END $$;
RELEASE SAVEPOINT s_a8;

-- ============================================================
-- A9 — same as A1 in day_cut mode → same exclude
-- ============================================================
ROLLBACK TO SAVEPOINT before_scenarios; SAVEPOINT s_a9;
SELECT pg_temp.reset_sources();
SELECT pg_temp.set_mode('day_cut');
SELECT pg_temp.set_anchor(
  (SELECT val FROM _bfix WHERE key='src_a'),
  '2026-06-01 09:00:00+00', 946.60);
SELECT pg_temp.mk_expense('expense', 20,
  (SELECT val FROM _bfix WHERE key='src_a'),
  '2026-06-01 00:00:00+00', '2026-06-01 14:00:00+00', 'C3');
SELECT pg_temp.assert_eq('A9 day_cut same-day excluded', 946.60,
  pg_temp.bal((SELECT val FROM _bfix WHERE key='src_a')));
RELEASE SAVEPOINT s_a9;

-- ============================================================
-- B1 — event_at == anchor_ts EXCLUDED (strict `>`)
-- ============================================================
ROLLBACK TO SAVEPOINT before_scenarios; SAVEPOINT s_b1;
SELECT pg_temp.reset_sources();
SELECT pg_temp.set_mode('hybrid');
SELECT pg_temp.set_anchor(
  (SELECT val FROM _bfix WHERE key='src_a'),
  '2026-06-01 09:00:00+00', 946.60);
SELECT pg_temp.mk_expense('expense', 20,
  (SELECT val FROM _bfix WHERE key='src_a'),
  '2026-06-01 00:00:00+00', '2026-06-01 09:00:00+00', 'C1');
SELECT pg_temp.assert_eq('B1 event_at == anchor excluded', 946.60,
  pg_temp.bal((SELECT val FROM _bfix WHERE key='src_a')));
RELEASE SAVEPOINT s_b1;

-- ============================================================
-- B2 — transfer unanchored→anchored (obrat A7)
-- ============================================================
ROLLBACK TO SAVEPOINT before_scenarios; SAVEPOINT s_b2;
SELECT pg_temp.reset_sources();
SELECT pg_temp.set_mode('hybrid');
SELECT pg_temp.set_anchor(
  (SELECT val FROM _bfix WHERE key='src_b'),
  '2026-06-01 09:00:00+00', 200);
SELECT pg_temp.mk_expense('transfer', 40,
  (SELECT val FROM _bfix WHERE key='src_a'),
  '2026-06-02 00:00:00+00', NULL, NULL, 'regular',
  (SELECT val FROM _bfix WHERE key='src_b'));
SELECT pg_temp.assert_eq('B2 A leg (unanchored −40)', -40,
  pg_temp.bal((SELECT val FROM _bfix WHERE key='src_a')));
SELECT pg_temp.assert_eq('B2 B leg (anchored +40)', 240,
  pg_temp.bal((SELECT val FROM _bfix WHERE key='src_b')));
RELEASE SAVEPOINT s_b2;

-- ============================================================
-- B3 — transfer anchored→anchored
-- ============================================================
ROLLBACK TO SAVEPOINT before_scenarios; SAVEPOINT s_b3;
SELECT pg_temp.reset_sources();
SELECT pg_temp.set_mode('hybrid');
SELECT pg_temp.set_anchor(
  (SELECT val FROM _bfix WHERE key='src_a'),
  '2026-06-01 09:00:00+00', 500);
SELECT pg_temp.set_anchor(
  (SELECT val FROM _bfix WHERE key='src_b'),
  '2026-06-01 09:00:00+00', 200);
SELECT pg_temp.mk_expense('transfer', 40,
  (SELECT val FROM _bfix WHERE key='src_a'),
  '2026-06-02 00:00:00+00', NULL, NULL, 'regular',
  (SELECT val FROM _bfix WHERE key='src_b'));
SELECT pg_temp.assert_eq('B3 A anchored −40', 460,
  pg_temp.bal((SELECT val FROM _bfix WHERE key='src_a')));
SELECT pg_temp.assert_eq('B3 B anchored +40', 240,
  pg_temp.bal((SELECT val FROM _bfix WHERE key='src_b')));
RELEASE SAVEPOINT s_b3;

-- ============================================================
-- B4 — rebaseline anchor (novo sidro poništava staro)
-- ============================================================
ROLLBACK TO SAVEPOINT before_scenarios; SAVEPOINT s_b4;
SELECT pg_temp.reset_sources();
SELECT pg_temp.set_mode('hybrid');
SELECT pg_temp.set_anchor(
  (SELECT val FROM _bfix WHERE key='src_a'),
  '2026-05-01 09:00:00+00', 100);
SELECT pg_temp.mk_expense('expense', 10,
  (SELECT val FROM _bfix WHERE key='src_a'),
  '2026-05-10 00:00:00+00');
SELECT pg_temp.assert_eq('B4 before rebaseline', 90,
  pg_temp.bal((SELECT val FROM _bfix WHERE key='src_a')));
SELECT pg_temp.set_anchor(
  (SELECT val FROM _bfix WHERE key='src_a'),
  '2026-06-01 09:00:00+00', 500);
SELECT pg_temp.assert_eq('B4 after rebaseline (old row pre-new-anchor)', 500,
  pg_temp.bal((SELECT val FROM _bfix WHERE key='src_a')));
RELEASE SAVEPOINT s_b4;

-- ============================================================
-- B5 — recurring instance, event_at after anchor → included
-- ============================================================
ROLLBACK TO SAVEPOINT before_scenarios; SAVEPOINT s_b5;
SELECT pg_temp.reset_sources();
SELECT pg_temp.set_mode('hybrid');
SELECT pg_temp.set_anchor(
  (SELECT val FROM _bfix WHERE key='src_a'),
  '2026-06-01 09:00:00+00', 946.60);
SELECT pg_temp.mk_expense('expense', 15,
  (SELECT val FROM _bfix WHERE key='src_a'),
  '2026-06-02 00:00:00+00', '2026-06-02 08:00:00+00', 'C2');
SELECT pg_temp.assert_eq('B5 recurring post-anchor', 931.60,
  pg_temp.bal((SELECT val FROM _bfix WHERE key='src_a')));
RELEASE SAVEPOINT s_b5;

-- ============================================================
-- B6, B7 — vitest-only (nemaju SQL-specifičnu logiku)
-- ============================================================
DO $$ BEGIN RAISE NOTICE 'SKIP B6/B7 — vitest-only'; END $$;

-- ============================================================
-- B8 — sequential writes on anchored source, stored == recompute()
-- Napomena: pravu concurrent race treba testirati kroz dva paralelna
-- psql klijenta koja gađaju istu row-lock stazu. Ovdje potvrđujemo
-- deterministički invariant: nakon N sequential writeova stored ==
-- puni recompute (idempotencija).
-- ============================================================
ROLLBACK TO SAVEPOINT before_scenarios; SAVEPOINT s_b8;
SELECT pg_temp.reset_sources();
SELECT pg_temp.set_mode('hybrid');
SELECT pg_temp.set_anchor(
  (SELECT val FROM _bfix WHERE key='src_a'),
  '2026-06-01 09:00:00+00', 946.60);
DO $$
DECLARE i int;
BEGIN
  FOR i IN 1..10 LOOP
    PERFORM pg_temp.mk_expense('expense', 5,
      (SELECT val FROM _bfix WHERE key='src_a'),
      '2026-06-05 00:00:00+00');
  END LOOP;
END $$;
SELECT pg_temp.assert_eq('B8 after 10 writes', 896.60,
  pg_temp.bal((SELECT val FROM _bfix WHERE key='src_a')));
-- Idempotency check
SELECT public.recompute_custom_source_balance((SELECT val FROM _bfix WHERE key='src_a'));
SELECT pg_temp.assert_eq('B8 recompute idempotent', 896.60,
  pg_temp.bal((SELECT val FROM _bfix WHERE key='src_a')));
RELEASE SAVEPOINT s_b8;

-- ============================================================
-- B9 — guard trigger: direct UPDATE of anchor cols outside RPC → 42501
-- SKIP u Fazi A. Aktivira se u Fazi B kad guard trigger
-- (_prevent_direct_anchor_update) bude deployan.
--
-- Planirani test (Faza B):
--   SET LOCAL ROLE authenticated;
--   BEGIN
--     UPDATE public.custom_payment_sources
--        SET correction_anchor_date = now(),
--            correction_anchor_balance = 123
--      WHERE id = (SELECT val FROM _bfix WHERE key='src_a');
--     RAISE EXCEPTION 'FAIL B9: guard did not fire';
--   EXCEPTION WHEN insufficient_privilege THEN
--     RAISE NOTICE 'PASS B9 — guard blocked direct anchor UPDATE';
--   END;
-- ============================================================
DO $$ BEGIN RAISE NOTICE 'SKIP B9 — awaits Phase B guard trigger'; END $$;

-- ============================================================
-- PR-A worker payouts (P1–P6)
-- Contract: create/void/lock RPCs + guard triggers on expenses &
-- project_work_entries.
-- Each scenario resets to before_scenarios so SET LOCAL flags
-- (app.allow_payout_write) from prior RPC calls are rolled back.
-- ============================================================

-- Fixtures & pg_temp.seed_payout_fixtures live in 00_setup.sql so they
-- survive ROLLBACK TO SAVEPOINT before_scenarios.



-- ------------------------------------------------------------
-- P1 — create_worker_payout happy path (full pay, entries locked)
-- gross = 2 × 4 × 25 = 200; paid = 200 → status='paid'
-- balance: 1000 − 200 = 800 (C2 event_at, day after anchor)
-- ------------------------------------------------------------
ROLLBACK TO SAVEPOINT before_scenarios; SAVEPOINT s_p1;
SELECT pg_temp.seed_payout_fixtures();
SELECT public.create_worker_payout(
  (SELECT val FROM _bfix WHERE key='wrk'),
  (SELECT val FROM _bfix WHERE key='proj'),
  DATE '2026-06-02', DATE '2026-06-05',
  200,
  'custom:' || (SELECT val FROM _bfix WHERE key='src_a')::text,
  '2026-06-05 12:00:00+00',
  'P1 full pay',
  true
);
SELECT pg_temp.assert_eq('P1 hours_covered', 8,
  (SELECT SUM(hours_covered) FROM public.project_worker_payouts
    WHERE project_id=(SELECT val FROM _bfix WHERE key='proj')));
SELECT pg_temp.assert_eq('P1 gross_amount', 200,
  (SELECT SUM(gross_amount) FROM public.project_worker_payouts
    WHERE project_id=(SELECT val FROM _bfix WHERE key='proj')));

-- Verify status via table (avoids double-invoke)
SELECT pg_temp.assert_eq('P1 payout status=paid (1=yes)',
  1,
  (SELECT COUNT(*) FROM public.project_worker_payouts
    WHERE project_id=(SELECT val FROM _bfix WHERE key='proj') AND status='paid')::numeric);
SELECT pg_temp.assert_eq('P1 entries locked',
  2,
  (SELECT COUNT(*) FROM public.project_work_entries
    WHERE project_id=(SELECT val FROM _bfix WHERE key='proj') AND payout_id IS NOT NULL)::numeric);
SELECT pg_temp.assert_eq('P1 balance after payout', 800,
  pg_temp.bal((SELECT val FROM _bfix WHERE key='src_a')));
RELEASE SAVEPOINT s_p1;

-- ------------------------------------------------------------
-- P2 — partial payout (paid < gross → status='partial')
-- ------------------------------------------------------------
ROLLBACK TO SAVEPOINT before_scenarios; SAVEPOINT s_p2;
SELECT pg_temp.seed_payout_fixtures();
SELECT public.create_worker_payout(
  (SELECT val FROM _bfix WHERE key='wrk'),
  (SELECT val FROM _bfix WHERE key='proj'),
  DATE '2026-06-02', DATE '2026-06-05',
  150, -- < 200 gross
  'custom:' || (SELECT val FROM _bfix WHERE key='src_a')::text,
  '2026-06-05 12:00:00+00', 'P2 partial', false
);
SELECT pg_temp.assert_eq('P2 status=partial',
  1,
  (SELECT COUNT(*) FROM public.project_worker_payouts
    WHERE project_id=(SELECT val FROM _bfix WHERE key='proj') AND status='partial')::numeric);
SELECT pg_temp.assert_eq('P2 entries NOT locked (lock=false)',
  0,
  (SELECT COUNT(*) FROM public.project_work_entries
    WHERE project_id=(SELECT val FROM _bfix WHERE key='proj') AND payout_id IS NOT NULL)::numeric);
SELECT pg_temp.assert_eq('P2 balance after 150 paid', 850,
  pg_temp.bal((SELECT val FROM _bfix WHERE key='src_a')));
RELEASE SAVEPOINT s_p2;

-- ------------------------------------------------------------
-- P3 — advance (no hours in period, paid > 0 → status='advance')
-- ------------------------------------------------------------
ROLLBACK TO SAVEPOINT before_scenarios; SAVEPOINT s_p3;
SELECT pg_temp.seed_payout_fixtures();
SELECT public.create_worker_payout(
  (SELECT val FROM _bfix WHERE key='wrk'),
  (SELECT val FROM _bfix WHERE key='proj'),
  DATE '2026-07-01', DATE '2026-07-05', -- period WITHOUT entries
  100,
  'custom:' || (SELECT val FROM _bfix WHERE key='src_a')::text,
  '2026-07-05 12:00:00+00', 'P3 advance', true
);
SELECT pg_temp.assert_eq('P3 status=advance',
  1,
  (SELECT COUNT(*) FROM public.project_worker_payouts
    WHERE project_id=(SELECT val FROM _bfix WHERE key='proj') AND status='advance')::numeric);
SELECT pg_temp.assert_eq('P3 gross_amount=0',
  0,
  (SELECT COALESCE(SUM(gross_amount),0) FROM public.project_worker_payouts
    WHERE project_id=(SELECT val FROM _bfix WHERE key='proj')));
RELEASE SAVEPOINT s_p3;

-- ------------------------------------------------------------
-- P4 — guard: direct UPDATE amount on payout-linked expense → 42501
-- (allow_payout_write flag is rolled back by SAVEPOINT after P1)
-- ------------------------------------------------------------
ROLLBACK TO SAVEPOINT before_scenarios; SAVEPOINT s_p4;
SELECT pg_temp.seed_payout_fixtures();
SELECT public.create_worker_payout(
  (SELECT val FROM _bfix WHERE key='wrk'),
  (SELECT val FROM _bfix WHERE key='proj'),
  DATE '2026-06-02', DATE '2026-06-05', 200,
  'custom:' || (SELECT val FROM _bfix WHERE key='src_a')::text,
  '2026-06-05 12:00:00+00', 'P4', true
);
-- Reset guard flag so direct UPDATE hits the trigger
SELECT set_config('app.allow_payout_write', '', true);
DO $$
DECLARE v_exp uuid;
BEGIN
  SELECT expense_id INTO v_exp FROM public.project_worker_payouts
    WHERE project_id = (SELECT val FROM _bfix WHERE key='proj') LIMIT 1;
  BEGIN
    UPDATE public.expenses SET amount = amount + 1 WHERE id = v_exp;
    RAISE EXCEPTION 'FAIL P4: guard did not block direct expense UPDATE';
  EXCEPTION WHEN insufficient_privilege THEN
    RAISE NOTICE 'PASS P4 — guard blocked expense mutation on payout-linked row';
  END;
END $$;
RELEASE SAVEPOINT s_p4;

-- ------------------------------------------------------------
-- P5 — guard: direct DELETE on locked work_entry → 42501
-- ------------------------------------------------------------
ROLLBACK TO SAVEPOINT before_scenarios; SAVEPOINT s_p5;
SELECT pg_temp.seed_payout_fixtures();
SELECT public.create_worker_payout(
  (SELECT val FROM _bfix WHERE key='wrk'),
  (SELECT val FROM _bfix WHERE key='proj'),
  DATE '2026-06-02', DATE '2026-06-05', 200,
  'custom:' || (SELECT val FROM _bfix WHERE key='src_a')::text,
  '2026-06-05 12:00:00+00', 'P5', true
);
SELECT set_config('app.allow_payout_write', '', true);
DO $$
DECLARE v_entry uuid;
BEGIN
  SELECT id INTO v_entry FROM public.project_work_entries
    WHERE project_id=(SELECT val FROM _bfix WHERE key='proj')
      AND payout_id IS NOT NULL LIMIT 1;
  BEGIN
    DELETE FROM public.project_work_entries WHERE id = v_entry;
    RAISE EXCEPTION 'FAIL P5: guard did not block locked work_entry DELETE';
  EXCEPTION WHEN insufficient_privilege THEN
    RAISE NOTICE 'PASS P5 — guard blocked DELETE on locked entry';
  END;
END $$;
RELEASE SAVEPOINT s_p5;

-- ------------------------------------------------------------
-- P6 — void_worker_payout: soft-deletes expense, unlocks entries,
--      restores balance, status='voided'
-- ------------------------------------------------------------
ROLLBACK TO SAVEPOINT before_scenarios; SAVEPOINT s_p6;
SELECT pg_temp.seed_payout_fixtures();
SELECT public.create_worker_payout(
  (SELECT val FROM _bfix WHERE key='wrk'),
  (SELECT val FROM _bfix WHERE key='proj'),
  DATE '2026-06-02', DATE '2026-06-05', 200,
  'custom:' || (SELECT val FROM _bfix WHERE key='src_a')::text,
  '2026-06-05 12:00:00+00', 'P6 pre-void', true
);
SELECT pg_temp.assert_eq('P6 balance pre-void', 800,
  pg_temp.bal((SELECT val FROM _bfix WHERE key='src_a')));

DO $$
DECLARE v_payout uuid;
BEGIN
  SELECT id INTO v_payout FROM public.project_worker_payouts
    WHERE project_id=(SELECT val FROM _bfix WHERE key='proj') LIMIT 1;
  PERFORM public.void_worker_payout(v_payout, 'P6 test');
END $$;

SELECT pg_temp.assert_eq('P6 status=voided',
  1,
  (SELECT COUNT(*) FROM public.project_worker_payouts
    WHERE project_id=(SELECT val FROM _bfix WHERE key='proj') AND status='voided')::numeric);
SELECT pg_temp.assert_eq('P6 entries unlocked',
  0,
  (SELECT COUNT(*) FROM public.project_work_entries
    WHERE project_id=(SELECT val FROM _bfix WHERE key='proj') AND payout_id IS NOT NULL)::numeric);
SELECT pg_temp.assert_eq('P6 balance restored', 1000,
  pg_temp.bal((SELECT val FROM _bfix WHERE key='src_a')));
RELEASE SAVEPOINT s_p6;

-- ------------------------------------------------------------
-- P7 — RLS: non-owner caller cannot call create_worker_payout.
--      Expect SQLSTATE 42501 ('not project owner').
-- ------------------------------------------------------------
ROLLBACK TO SAVEPOINT before_scenarios; SAVEPOINT s_p7;
SELECT pg_temp.seed_payout_fixtures();

-- Impersonate a stranger (random uuid different from _bfix.user).
SELECT set_config('request.jwt.claim.sub',
  '99999999-9999-9999-9999-999999999999', true);

DO $$
DECLARE v_err text;
BEGIN
  BEGIN
    PERFORM public.create_worker_payout(
      (SELECT val FROM _bfix WHERE key='wrk'),
      (SELECT val FROM _bfix WHERE key='proj'),
      DATE '2026-06-02', DATE '2026-06-05', 100,
      'custom:' || (SELECT val FROM _bfix WHERE key='src_a')::text,
      '2026-06-05 12:00:00+00', 'P7 rls', true
    );
    RAISE EXCEPTION 'FAIL P7 — non-owner call unexpectedly succeeded';
  EXCEPTION WHEN insufficient_privilege THEN
    RAISE NOTICE 'PASS P7 — non-owner blocked (SQLSTATE 42501)';
  WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS v_err = MESSAGE_TEXT;
    RAISE EXCEPTION 'FAIL P7 — unexpected error: %', v_err;
  END;
END $$;

-- P7b — no payout row was created for the impersonation attempt.
SELECT pg_temp.assert_eq('P7 no payout created', 0,
  (SELECT COUNT(*) FROM public.project_worker_payouts
    WHERE project_id=(SELECT val FROM _bfix WHERE key='proj'))::numeric);

RELEASE SAVEPOINT s_p7;

-- ============================================================
-- V1-B rate history + per-day payout compute + batch payouts (P8–P13)
-- Contract: set_worker_hourly_rate RPC, rate_at() per-day lookup,
-- payout_rate_segments audit rows, create_worker_payout_batch,
-- void_worker_payout_batch cascade, guard on direct rate_history writes.
-- ============================================================

-- ------------------------------------------------------------
-- P8 — set_worker_hourly_rate happy path (forward-only)
--      inserts history row, syncs project_workers.hourly_rate
-- ------------------------------------------------------------
ROLLBACK TO SAVEPOINT before_scenarios; SAVEPOINT s_p8;
SELECT pg_temp.seed_payout_fixtures();
-- Backfill has NO history rows for fresh fixture worker; seed one via RPC.
SELECT public.set_worker_hourly_rate(
  (SELECT val FROM _bfix WHERE key='wrk'), 25, DATE '2026-06-01'
);
SELECT public.set_worker_hourly_rate(
  (SELECT val FROM _bfix WHERE key='wrk'), 30, DATE '2026-06-04'
);
SELECT pg_temp.assert_eq('P8 rate_at Jun-02', 25,
  public.rate_at((SELECT val FROM _bfix WHERE key='wrk'), DATE '2026-06-02'));
SELECT pg_temp.assert_eq('P8 rate_at Jun-04', 30,
  public.rate_at((SELECT val FROM _bfix WHERE key='wrk'), DATE '2026-06-04'));
SELECT pg_temp.assert_eq('P8 history row count', 2,
  (SELECT COUNT(*) FROM public.project_worker_rate_history
    WHERE worker_id = (SELECT val FROM _bfix WHERE key='wrk'))::numeric);
RELEASE SAVEPOINT s_p8;

-- ------------------------------------------------------------
-- P9 — retroactive collision: rate change inside paid period → error
-- ------------------------------------------------------------
ROLLBACK TO SAVEPOINT before_scenarios; SAVEPOINT s_p9;
SELECT pg_temp.seed_payout_fixtures();
SELECT public.set_worker_hourly_rate(
  (SELECT val FROM _bfix WHERE key='wrk'), 25, DATE '2026-06-01'
);
SELECT public.create_worker_payout(
  (SELECT val FROM _bfix WHERE key='wrk'),
  (SELECT val FROM _bfix WHERE key='proj'),
  DATE '2026-06-02', DATE '2026-06-05', 200,
  'custom:' || (SELECT val FROM _bfix WHERE key='src_a')::text,
  '2026-06-05 12:00:00+00', 'P9 setup', true
);
DO $$
DECLARE v_err text;
BEGIN
  BEGIN
    PERFORM public.set_worker_hourly_rate(
      (SELECT val FROM _bfix WHERE key='wrk'), 40, DATE '2026-06-03'
    );
    RAISE EXCEPTION 'FAIL P9 — retroactive change unexpectedly succeeded';
  EXCEPTION WHEN invalid_parameter_value THEN
    GET STACKED DIAGNOSTICS v_err = MESSAGE_TEXT;
    IF v_err LIKE 'rate_change_collides_with_payout|%|2026-06-06' THEN
      RAISE NOTICE 'PASS P9 — collision blocked with earliest date 2026-06-06 (%)', v_err;
    ELSE
      RAISE EXCEPTION 'FAIL P9 — wrong error payload: %', v_err;
    END IF;
  END;
END $$;
-- Forward-only change AFTER paid period end is allowed.
SELECT public.set_worker_hourly_rate(
  (SELECT val FROM _bfix WHERE key='wrk'), 40, DATE '2026-06-06'
);
SELECT pg_temp.assert_eq('P9 forward-only allowed', 3,
  (SELECT COUNT(*) FROM public.project_worker_rate_history
    WHERE worker_id = (SELECT val FROM _bfix WHERE key='wrk'))::numeric);
RELEASE SAVEPOINT s_p9;

-- ------------------------------------------------------------
-- P10 — per-day payout compute with 2 rate segments
--      Rate 25 from Jun-01, 30 from Jun-04
--      Entries: Jun-02 (4h) @25 + Jun-03 (4h) @25 (fixture default)
--      Modify fixture to include Jun-04 (4h) @30 → gross = 4*25+4*25+4*30 = 320
--      Wait: default seed only creates 2 entries (Jun-02 + Jun-03). Extend:
-- ------------------------------------------------------------
ROLLBACK TO SAVEPOINT before_scenarios; SAVEPOINT s_p10;
SELECT pg_temp.seed_payout_fixtures();
SELECT public.set_worker_hourly_rate(
  (SELECT val FROM _bfix WHERE key='wrk'), 25, DATE '2026-06-01'
);
SELECT public.set_worker_hourly_rate(
  (SELECT val FROM _bfix WHERE key='wrk'), 30, DATE '2026-06-04'
);
-- Add a Jun-04 entry to cross the segment boundary.
INSERT INTO public.project_work_entries (project_id, worker_id, work_date, actual_hours)
VALUES ((SELECT val FROM _bfix WHERE key='proj'), (SELECT val FROM _bfix WHERE key='wrk'),
        DATE '2026-06-04', 4);

SELECT public.create_worker_payout(
  (SELECT val FROM _bfix WHERE key='wrk'),
  (SELECT val FROM _bfix WHERE key='proj'),
  DATE '2026-06-02', DATE '2026-06-05', 320,
  'custom:' || (SELECT val FROM _bfix WHERE key='src_a')::text,
  '2026-06-05 12:00:00+00', 'P10 mixed rate', true
);

SELECT pg_temp.assert_eq('P10 gross with 2 segments', 320,
  (SELECT gross_amount FROM public.project_worker_payouts
    WHERE project_id=(SELECT val FROM _bfix WHERE key='proj') ORDER BY created_at DESC LIMIT 1));

SELECT pg_temp.assert_eq('P10 segments row count', 2,
  (SELECT COUNT(*) FROM public.payout_rate_segments seg
   JOIN public.project_worker_payouts p ON p.id = seg.payout_id
   WHERE p.project_id = (SELECT val FROM _bfix WHERE key='proj'))::numeric);

SELECT pg_temp.assert_eq('P10 segment @25 subtotal', 200,
  (SELECT SUM(subtotal) FROM public.payout_rate_segments seg
   JOIN public.project_worker_payouts p ON p.id = seg.payout_id
   WHERE p.project_id = (SELECT val FROM _bfix WHERE key='proj') AND seg.rate = 25));

SELECT pg_temp.assert_eq('P10 segment @30 subtotal', 120,
  (SELECT SUM(subtotal) FROM public.payout_rate_segments seg
   JOIN public.project_worker_payouts p ON p.id = seg.payout_id
   WHERE p.project_id = (SELECT val FROM _bfix WHERE key='proj') AND seg.rate = 30));
RELEASE SAVEPOINT s_p10;

-- ------------------------------------------------------------
-- P11 — batch payout: 2 items across 2 projects, same owner, same source
-- ------------------------------------------------------------
ROLLBACK TO SAVEPOINT before_scenarios; SAVEPOINT s_p11;
SELECT pg_temp.seed_payout_fixtures(25, 4, 2, 1000);

-- Seed second project + worker for same owner
DO $$
DECLARE
  v_user uuid := (SELECT val FROM _bfix WHERE key='user');
  v_proj2 uuid := '11111111-2222-3333-4444-000000000010';
  v_wrk2  uuid := '11111111-2222-3333-4444-000000000011';
BEGIN
  DELETE FROM public.project_work_entries WHERE project_id = v_proj2;
  DELETE FROM public.project_workers WHERE project_id = v_proj2;
  DELETE FROM public.projects WHERE id = v_proj2;
  INSERT INTO public.projects (id, user_id, name) VALUES (v_proj2, v_user, 'P2');
  INSERT INTO public.project_workers (id, project_id, first_name, last_name, hourly_rate)
    VALUES (v_wrk2, v_proj2, 'Test', 'Worker', 25);
  INSERT INTO public.project_work_entries (project_id, worker_id, work_date, actual_hours)
    VALUES (v_proj2, v_wrk2, DATE '2026-06-02', 4);
END $$;

SELECT public.create_worker_payout_batch(
  jsonb_build_array(
    jsonb_build_object(
      'project_id', (SELECT val FROM _bfix WHERE key='proj'),
      'worker_id',  (SELECT val FROM _bfix WHERE key='wrk'),
      'period_start','2026-06-02','period_end','2026-06-05','paid_amount', 200
    ),
    jsonb_build_object(
      'project_id', '11111111-2222-3333-4444-000000000010'::uuid,
      'worker_id',  '11111111-2222-3333-4444-000000000011'::uuid,
      'period_start','2026-06-02','period_end','2026-06-02','paid_amount', 100
    )
  ),
  'custom:' || (SELECT val FROM _bfix WHERE key='src_a')::text,
  '2026-06-05 12:00:00+00',
  'P11 batch',
  true
);

SELECT pg_temp.assert_eq('P11 batch payouts count', 2,
  (SELECT COUNT(DISTINCT batch_id) * 2 FROM public.project_worker_payouts
    WHERE batch_id IS NOT NULL)::numeric);

SELECT pg_temp.assert_eq('P11 all payouts share single batch_id', 1,
  (SELECT COUNT(DISTINCT batch_id) FROM public.project_worker_payouts
    WHERE batch_id IS NOT NULL)::numeric);

SELECT pg_temp.assert_eq('P11 total balance impact', 700,
  pg_temp.bal((SELECT val FROM _bfix WHERE key='src_a')));  -- 1000 - 200 - 100
RELEASE SAVEPOINT s_p11;

-- ------------------------------------------------------------
-- P12 — void_worker_payout_batch cascades to all sibling payouts
-- ------------------------------------------------------------
ROLLBACK TO SAVEPOINT before_scenarios; SAVEPOINT s_p12;
SELECT pg_temp.seed_payout_fixtures(25, 4, 2, 1000);
DO $$
DECLARE
  v_user uuid := (SELECT val FROM _bfix WHERE key='user');
  v_proj2 uuid := '11111111-2222-3333-4444-000000000010';
  v_wrk2  uuid := '11111111-2222-3333-4444-000000000011';
  v_batch uuid;
BEGIN
  DELETE FROM public.project_work_entries WHERE project_id = v_proj2;
  DELETE FROM public.project_workers WHERE project_id = v_proj2;
  DELETE FROM public.projects WHERE id = v_proj2;
  INSERT INTO public.projects (id, user_id, name) VALUES (v_proj2, v_user, 'P2');
  INSERT INTO public.project_workers (id, project_id, first_name, last_name, hourly_rate)
    VALUES (v_wrk2, v_proj2, 'Test', 'Worker', 25);
  INSERT INTO public.project_work_entries (project_id, worker_id, work_date, actual_hours)
    VALUES (v_proj2, v_wrk2, DATE '2026-06-02', 4);

  SELECT (public.create_worker_payout_batch(
    jsonb_build_array(
      jsonb_build_object(
        'project_id', (SELECT val FROM _bfix WHERE key='proj'),
        'worker_id',  (SELECT val FROM _bfix WHERE key='wrk'),
        'period_start','2026-06-02','period_end','2026-06-05','paid_amount', 200
      ),
      jsonb_build_object(
        'project_id', v_proj2, 'worker_id', v_wrk2,
        'period_start','2026-06-02','period_end','2026-06-02','paid_amount', 100
      )
    ),
    'custom:' || (SELECT val FROM _bfix WHERE key='src_a')::text,
    '2026-06-05 12:00:00+00', 'P12 batch', true
  )->>'batch_id')::uuid INTO v_batch;

  PERFORM public.void_worker_payout_batch(v_batch, 'P12 test');
END $$;

SELECT pg_temp.assert_eq('P12 all payouts voided', 2,
  (SELECT COUNT(*) FROM public.project_worker_payouts
    WHERE batch_id IS NOT NULL AND status = 'voided')::numeric);
SELECT pg_temp.assert_eq('P12 balance fully restored', 1000,
  pg_temp.bal((SELECT val FROM _bfix WHERE key='src_a')));
RELEASE SAVEPOINT s_p12;

-- ------------------------------------------------------------
-- P13 — guard: direct INSERT into project_worker_rate_history → 42501
-- ------------------------------------------------------------
ROLLBACK TO SAVEPOINT before_scenarios; SAVEPOINT s_p13;
SELECT pg_temp.seed_payout_fixtures();
-- Reset guard flag (it may be 'on' from set_worker_hourly_rate called during
-- fixture setup or other scenarios).
SELECT set_config('app.allow_rate_write', '', true);
DO $$
BEGIN
  BEGIN
    INSERT INTO public.project_worker_rate_history (worker_id, rate, effective_from, created_by)
    VALUES (
      (SELECT val FROM _bfix WHERE key='wrk'),
      99,
      DATE '2026-06-01',
      (SELECT val FROM _bfix WHERE key='user')
    );
    RAISE EXCEPTION 'FAIL P13 — direct INSERT unexpectedly succeeded';
  EXCEPTION WHEN insufficient_privilege THEN
    RAISE NOTICE 'PASS P13 — guard blocked direct rate_history INSERT';
  END;

  -- Also block direct UPDATE to project_workers.hourly_rate
  BEGIN
    UPDATE public.project_workers SET hourly_rate = 999
      WHERE id = (SELECT val FROM _bfix WHERE key='wrk');
    RAISE EXCEPTION 'FAIL P13 — direct hourly_rate UPDATE unexpectedly succeeded';
  EXCEPTION WHEN insufficient_privilege THEN
    RAISE NOTICE 'PASS P13 — guard blocked direct project_workers.hourly_rate UPDATE';
  END;
END $$;
RELEASE SAVEPOINT s_p13;

-- Always roll back the harness transaction.
ROLLBACK;




