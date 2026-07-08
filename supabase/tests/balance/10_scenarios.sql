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
-- Expected = 2: initial backfill (25 @ Jun-01) + forward (40 @ Jun-06).
-- Retroactive (40 @ Jun-03) raised inside DO block → row rolled back, not counted.
SELECT pg_temp.assert_eq('P9 forward-only allowed', 2,
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

-- ------------------------------------------------------------
-- P14 — server-side notification: single create_worker_payout inserts
--       exactly one notifications row for the linked worker.user_id.
--       Regression for "payout kreiran ali notifikacija nije" bug.
-- ------------------------------------------------------------
ROLLBACK TO SAVEPOINT before_scenarios; SAVEPOINT s_p14;
SELECT pg_temp.seed_payout_fixtures(25, 4, 2, 1000);
DO $$
DECLARE
  v_worker_user uuid := '99999999-aaaa-bbbb-cccc-000000000014';
  v_before int;
  v_after int;
BEGIN
  INSERT INTO auth.users (id, email) VALUES (v_worker_user, 'p14@test')
    ON CONFLICT (id) DO NOTHING;
  UPDATE public.project_workers
     SET user_id = v_worker_user
   WHERE id = (SELECT val FROM _bfix WHERE key='wrk');

  DELETE FROM public.notifications WHERE user_id = v_worker_user;
  SELECT COUNT(*) INTO v_before FROM public.notifications WHERE user_id = v_worker_user;

  PERFORM public.create_worker_payout(
    (SELECT val FROM _bfix WHERE key='wrk'),
    (SELECT val FROM _bfix WHERE key='proj'),
    DATE '2026-06-02', DATE '2026-06-03', 100,
    'custom:' || (SELECT val FROM _bfix WHERE key='src_a')::text,
    '2026-06-03 12:00:00+00', 'P14', true
  );

  SELECT COUNT(*) INTO v_after
    FROM public.notifications
   WHERE user_id = v_worker_user
     AND type = 'worker_payout_created';

  IF v_after <> v_before + 1 THEN
    RAISE EXCEPTION 'FAIL P14 single-payout notification — expected=%, actual=%',
      v_before + 1, v_after;
  END IF;
  RAISE NOTICE 'PASS P14 — single payout inserted worker_payout_created notification';
END $$;
RELEASE SAVEPOINT s_p14;

-- ------------------------------------------------------------
-- P15 — batch create_worker_payout_batch inserts EXACTLY ONE
--       aggregated notification per linked recipient (not N per project).
--       Direct regression for the production bug (batch of 2 -> 0 notifs).
-- ------------------------------------------------------------
ROLLBACK TO SAVEPOINT before_scenarios; SAVEPOINT s_p15;
SELECT pg_temp.seed_payout_fixtures(25, 4, 2, 1000);
DO $$
DECLARE
  v_user uuid := (SELECT val FROM _bfix WHERE key='user');
  v_proj2 uuid := '11111111-2222-3333-4444-000000000010';
  v_wrk2  uuid := '11111111-2222-3333-4444-000000000011';
  v_worker_user uuid := '99999999-aaaa-bbbb-cccc-000000000015';
  v_notif_count int;
  v_batch uuid;
  v_notif_batch_id uuid;
BEGIN
  INSERT INTO auth.users (id, email) VALUES (v_worker_user, 'p15@test')
    ON CONFLICT (id) DO NOTHING;
  DELETE FROM public.project_work_entries WHERE project_id = v_proj2;
  DELETE FROM public.project_workers WHERE project_id = v_proj2;
  DELETE FROM public.projects WHERE id = v_proj2;
  INSERT INTO public.projects (id, user_id, name) VALUES (v_proj2, v_user, 'P2');
  INSERT INTO public.project_workers (id, project_id, first_name, last_name, hourly_rate, user_id)
    VALUES (v_wrk2, v_proj2, 'Test', 'Worker', 25, v_worker_user);
  INSERT INTO public.project_work_entries (project_id, worker_id, work_date, actual_hours)
    VALUES (v_proj2, v_wrk2, DATE '2026-06-02', 4);

  UPDATE public.project_workers
     SET user_id = v_worker_user
   WHERE id = (SELECT val FROM _bfix WHERE key='wrk');

  DELETE FROM public.notifications WHERE user_id = v_worker_user;

  SELECT (public.create_worker_payout_batch(
    jsonb_build_array(
      jsonb_build_object(
        'project_id', (SELECT val FROM _bfix WHERE key='proj'),
        'worker_id',  (SELECT val FROM _bfix WHERE key='wrk'),
        'period_start','2026-06-02','period_end','2026-06-03','paid_amount', 100
      ),
      jsonb_build_object(
        'project_id', v_proj2, 'worker_id', v_wrk2,
        'period_start','2026-06-02','period_end','2026-06-02','paid_amount', 50
      )
    ),
    'custom:' || (SELECT val FROM _bfix WHERE key='src_a')::text,
    '2026-06-03 12:00:00+00', 'P15 batch', true
  )->>'batch_id')::uuid INTO v_batch;

  SELECT COUNT(*) INTO v_notif_count
    FROM public.notifications
   WHERE user_id = v_worker_user AND type = 'worker_payout_created';

  IF v_notif_count <> 1 THEN
    RAISE EXCEPTION 'FAIL P15 batch notification — expected=1 aggregated, actual=%', v_notif_count;
  END IF;

  SELECT (data->>'batch_id')::uuid INTO v_notif_batch_id
    FROM public.notifications
   WHERE user_id = v_worker_user AND type = 'worker_payout_created'
   LIMIT 1;

  IF v_notif_batch_id IS DISTINCT FROM v_batch THEN
    RAISE EXCEPTION 'FAIL P15 batch_id mismatch — expected=%, actual=%', v_batch, v_notif_batch_id;
  END IF;

  RAISE NOTICE 'PASS P15 — batch produced 1 aggregated notification with batch_id=%', v_batch;
END $$;
RELEASE SAVEPOINT s_p15;

-- ------------------------------------------------------------
-- P16 — actor==recipient suppression: owner who is also linked as their
--       own worker (edge case) does NOT get self-notified.
-- ------------------------------------------------------------
ROLLBACK TO SAVEPOINT before_scenarios; SAVEPOINT s_p16;
SELECT pg_temp.seed_payout_fixtures(25, 4, 2, 1000);
DO $$
DECLARE
  v_user uuid := (SELECT val FROM _bfix WHERE key='user');
  v_before int;
  v_after int;
BEGIN
  UPDATE public.project_workers
     SET user_id = v_user
   WHERE id = (SELECT val FROM _bfix WHERE key='wrk');

  SELECT COUNT(*) INTO v_before
    FROM public.notifications WHERE user_id = v_user AND type = 'worker_payout_created';

  PERFORM public.create_worker_payout(
    (SELECT val FROM _bfix WHERE key='wrk'),
    (SELECT val FROM _bfix WHERE key='proj'),
    DATE '2026-06-02', DATE '2026-06-03', 100,
    'custom:' || (SELECT val FROM _bfix WHERE key='src_a')::text,
    '2026-06-03 12:00:00+00', 'P16', true
  );

  SELECT COUNT(*) INTO v_after
    FROM public.notifications WHERE user_id = v_user AND type = 'worker_payout_created';

  IF v_after <> v_before THEN
    RAISE EXCEPTION 'FAIL P16 self-notify suppression — before=%, after=%', v_before, v_after;
  END IF;
  RAISE NOTICE 'PASS P16 — actor==recipient did NOT self-notify';
END $$;
RELEASE SAVEPOINT s_p16;

-- ------------------------------------------------------------
-- P17 — Attribution race guard: unique index (user_id, worker_payout_id)
--       WHERE worker_payout_id IS NOT NULL blokira dvostruki pripis iste
--       isplate od strane istog korisnika. Regresija za "worker klikne
--       dvije notifikacije" slučaj iz plana (odjeljak 4e).
-- ------------------------------------------------------------
ROLLBACK TO SAVEPOINT before_scenarios; SAVEPOINT s_p17;
SELECT pg_temp.seed_payout_fixtures(25, 4, 2, 1000);
DO $$
DECLARE
  v_worker_user uuid := '99999999-aaaa-bbbb-cccc-000000000017';
  v_payout_id uuid;
  v_dup_error text;
BEGIN
  INSERT INTO auth.users (id, email) VALUES (v_worker_user, 'p17@test')
    ON CONFLICT (id) DO NOTHING;
  UPDATE public.project_workers
     SET user_id = v_worker_user
   WHERE id = (SELECT val FROM _bfix WHERE key='wrk');

  PERFORM public.create_worker_payout(
    (SELECT val FROM _bfix WHERE key='wrk'),
    (SELECT val FROM _bfix WHERE key='proj'),
    DATE '2026-06-02', DATE '2026-06-03', 100,
    'custom:' || (SELECT val FROM _bfix WHERE key='src_a')::text,
    '2026-06-03 12:00:00+00', 'P17', true
  );

  SELECT project_worker_payouts.id INTO v_payout_id
    FROM public.project_worker_payouts
    JOIN public.project_workers w ON w.id = project_worker_payouts.worker_id
    WHERE w.user_id = v_worker_user
    ORDER BY project_worker_payouts.created_at DESC
    LIMIT 1;

  -- Simuliraj radnikov attribution insert #1 (custom user, ne owner).
  INSERT INTO public.expenses (user_id, amount, type, payment_source, description, worker_payout_id)
    VALUES (v_worker_user, 100, 'income', 'custom:' || (SELECT val FROM _bfix WHERE key='src_a')::text, 'radnikov attribution', v_payout_id);

  -- Pokušaj #2 — mora pasti na uniq_expenses_user_worker_payout.
  BEGIN
    INSERT INTO public.expenses (user_id, amount, type, payment_source, description, worker_payout_id)
      VALUES (v_worker_user, 100, 'income', 'custom:' || (SELECT val FROM _bfix WHERE key='src_a')::text, 'race duplikat', v_payout_id);
    RAISE EXCEPTION 'FAIL P17 — druga attribution insertacija je uspjela (unique index ne radi)';
  EXCEPTION WHEN unique_violation THEN
    RAISE NOTICE 'PASS P17 — race guard blokirao dvostruki pripis (23505)';
  END;
END $$;
RELEASE SAVEPOINT s_p17;

-- ------------------------------------------------------------
-- P18 — Attribution batch race guard: unique index (user_id, worker_payout_batch_id)
--       WHERE worker_payout_batch_id IS NOT NULL blokira dvostruki pripis
--       istog batcha.
-- ------------------------------------------------------------
ROLLBACK TO SAVEPOINT before_scenarios; SAVEPOINT s_p18;
DO $$
DECLARE
  v_worker_user uuid := '99999999-aaaa-bbbb-cccc-000000000018';
  v_batch uuid := gen_random_uuid();
BEGIN
  INSERT INTO auth.users (id, email) VALUES (v_worker_user, 'p18@test')
    ON CONFLICT (id) DO NOTHING;

  INSERT INTO public.expenses (user_id, amount, type, payment_source, description, worker_payout_batch_id)
    VALUES (v_worker_user, 250, 'income', 'custom:' || (SELECT val FROM _bfix WHERE key='src_a')::text, 'batch attribution #1', v_batch);

  BEGIN
    INSERT INTO public.expenses (user_id, amount, type, payment_source, description, worker_payout_batch_id)
      VALUES (v_worker_user, 250, 'income', 'custom:' || (SELECT val FROM _bfix WHERE key='src_a')::text, 'batch attribution #2 (duplikat)', v_batch);
    RAISE EXCEPTION 'FAIL P18 — druga batch attribution insertacija je uspjela';
  EXCEPTION WHEN unique_violation THEN
    RAISE NOTICE 'PASS P18 — batch race guard blokirao dvostruki pripis (23505)';
  END;

  -- Različiti batch → mora proći (partial index, samo istina za isti batch).
  INSERT INTO public.expenses (user_id, amount, type, payment_source, description, worker_payout_batch_id)
    VALUES (v_worker_user, 250, 'income', 'custom:' || (SELECT val FROM _bfix WHERE key='src_a')::text, 'drugi batch', gen_random_uuid());
  RAISE NOTICE 'PASS P18 — različit batch dopušten';
END $$;
RELEASE SAVEPOINT s_p18;

-- ------------------------------------------------------------
-- P19 — get_my_incoming_payouts SECURITY DEFINER:
--       (a) vraća SAMO payoute čiji je worker.user_id = auth.uid()
--       (b) NE curi ownerov `note`, `payment_source`, `voided_by`
-- ------------------------------------------------------------
ROLLBACK TO SAVEPOINT before_scenarios; SAVEPOINT s_p19;
SELECT pg_temp.seed_payout_fixtures(25, 4, 2, 1000);
DO $$
DECLARE
  v_owner uuid := (SELECT val FROM _bfix WHERE key='user');
  v_worker_user uuid := '99999999-aaaa-bbbb-cccc-000000000019';
  v_other_worker_user uuid := '99999999-aaaa-bbbb-cccc-00000000001A';
  v_payout_id uuid;
  v_rows int;
  v_cols text[];
BEGIN
  INSERT INTO auth.users (id, email) VALUES (v_worker_user, 'p19@test')
    ON CONFLICT (id) DO NOTHING;
  INSERT INTO auth.users (id, email) VALUES (v_other_worker_user, 'p19other@test')
    ON CONFLICT (id) DO NOTHING;

  UPDATE public.project_workers
     SET user_id = v_worker_user
   WHERE id = (SELECT val FROM _bfix WHERE key='wrk');

  PERFORM public.create_worker_payout(
    (SELECT val FROM _bfix WHERE key='wrk'),
    (SELECT val FROM _bfix WHERE key='proj'),
    DATE '2026-06-02', DATE '2026-06-03', 100,
    'custom:' || (SELECT val FROM _bfix WHERE key='src_a')::text,
    '2026-06-03 12:00:00+00', 'ownerov note (ne smije curiti)', true
  );

  SELECT project_worker_payouts.id INTO v_payout_id
    FROM public.project_worker_payouts
    JOIN public.project_workers w ON w.id = project_worker_payouts.worker_id
    WHERE w.user_id = v_worker_user
    ORDER BY project_worker_payouts.created_at DESC
    LIMIT 1;

  -- (a) glumi radnika: postavi request.jwt.claim.sub → get_my_incoming_payouts vidi jedan red
  PERFORM set_config('request.jwt.claim.sub', v_worker_user::text, true);
  SELECT COUNT(*) INTO v_rows FROM public.get_my_incoming_payouts(ARRAY[v_payout_id]);
  IF v_rows <> 1 THEN
    RAISE EXCEPTION 'FAIL P19a — očekivano 1 red za radnika, dobiveno %', v_rows;
  END IF;
  RAISE NOTICE 'PASS P19a — radnik dobio svoj payout';

  -- (a2) glumi DRUGOG radnika (nije povezan s payoutom) → 0 redova
  PERFORM set_config('request.jwt.claim.sub', v_other_worker_user::text, true);
  SELECT COUNT(*) INTO v_rows FROM public.get_my_incoming_payouts(ARRAY[v_payout_id]);
  IF v_rows <> 0 THEN
    RAISE EXCEPTION 'FAIL P19a2 — drugi radnik ne smije vidjeti tuđi payout, dobiveno %', v_rows;
  END IF;
  RAISE NOTICE 'PASS P19a2 — drugi korisnik ne vidi tuđi payout';

  -- (b) whitelist: kolone RPC-a ne uključuju ownerova osjetljiva polja
  SELECT array_agg(attname::text ORDER BY attnum)
    INTO v_cols
    FROM pg_attribute
   WHERE attrelid = 'public.project_worker_payouts'::regclass
     AND attnum > 0
     AND attname IN ('note', 'payment_source', 'voided_by', 'void_reason', 'created_by');

  -- Provjera kroz introspekciju povratnog tipa RPC-a.
  PERFORM 1
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public' AND p.proname = 'get_my_incoming_payouts';
  IF NOT FOUND THEN
    RAISE EXCEPTION 'FAIL P19b — get_my_incoming_payouts nije registrirana';
  END IF;

  -- SEKUNDARNA provjera: dohvati OID i argumente povratnih kolona.
  IF EXISTS (
    SELECT 1
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    JOIN unnest(p.proargnames) WITH ORDINALITY AS a(name, ord) ON true
    WHERE n.nspname = 'public'
      AND p.proname = 'get_my_incoming_payouts'
      AND a.name IN ('note', 'payment_source', 'voided_by', 'void_reason', 'created_by')
  ) THEN
    RAISE EXCEPTION 'FAIL P19b — RPC izlaže ownerova osjetljiva polja';
  END IF;
  RAISE NOTICE 'PASS P19b — RPC ne izlaže note/payment_source/voided_by/void_reason/created_by';

  -- (c) anon NEMA execute pravo
  IF has_function_privilege('anon', 'public.get_my_incoming_payouts(uuid[])', 'EXECUTE') THEN
    RAISE EXCEPTION 'FAIL P19c — anon smije zvati get_my_incoming_payouts';
  END IF;
  RAISE NOTICE 'PASS P19c — anon revoked';
END $$;
RELEASE SAVEPOINT s_p19;

-- ------------------------------------------------------------
-- P20 — _guard_expense_payout_write suženje (BUG C):
--       (a) ownerov auto-expense — direktan DELETE odbijen (42501)
--       (b) radnikov attribution red — soft-delete od strane radnika PROLAZI
--       (c) radnikov attribution red — hard DELETE od strane radnika PROLAZI
--       (d) batch attribution — soft-delete od strane radnika PROLAZI
-- ------------------------------------------------------------
ROLLBACK TO SAVEPOINT before_scenarios; SAVEPOINT s_p20;
SELECT pg_temp.seed_payout_fixtures(25, 4, 2, 1000);
DO $$
DECLARE
  v_worker_user uuid := '99999999-aaaa-bbbb-cccc-000000000020';
  v_payout_id uuid;
  v_owner_expense_id uuid;
  v_worker_expense_id uuid;
  v_batch_expense_id uuid;
  v_batch uuid := gen_random_uuid();
BEGIN
  INSERT INTO auth.users (id, email) VALUES (v_worker_user, 'p20@test')
    ON CONFLICT (id) DO NOTHING;

  UPDATE public.project_workers
     SET user_id = v_worker_user
   WHERE id = (SELECT val FROM _bfix WHERE key='wrk');

  -- Kreiraj ownerov auto-expense preko create_worker_payout.
  PERFORM public.create_worker_payout(
    (SELECT val FROM _bfix WHERE key='wrk'),
    (SELECT val FROM _bfix WHERE key='proj'),
    DATE '2026-06-02', DATE '2026-06-03', 100,
    'custom:' || (SELECT val FROM _bfix WHERE key='src_a')::text,
    '2026-06-03 12:00:00+00', 'P20', true
  );

  SELECT id, expense_id
    INTO v_payout_id, v_owner_expense_id
    FROM public.project_worker_payouts
    WHERE created_by = (SELECT val FROM _bfix WHERE key='user')
    ORDER BY created_at DESC LIMIT 1;

  -- Reset guard bypass koji je create_worker_payout upalio (SET LOCAL traje do kraja tx).
  -- U produkciji svaki HTTP poziv je zasebna tx pa se ovo ne događa; u SQL suite unutar
  -- iste tx moramo eksplicitno vratiti flag da guard opet čuva DELETE/UPDATE.
  PERFORM set_config('app.allow_payout_write', 'off', true);

  -- (a) DELETE ownerovog auto-expense mora pasti (42501).
  BEGIN
    DELETE FROM public.expenses WHERE id = v_owner_expense_id;
    RAISE EXCEPTION 'FAIL P20a — DELETE ownerovog payout expense-a je prošao (guard neaktivan)';
  EXCEPTION WHEN insufficient_privilege THEN
    RAISE NOTICE 'PASS P20a — DELETE ownerovog auto-expense blokiran (42501)';
  END;

  -- (a2) Soft-delete (UPDATE deleted_at) ownerovog auto-expense mora pasti.
  BEGIN
    UPDATE public.expenses SET deleted_at = now() WHERE id = v_owner_expense_id;
    RAISE EXCEPTION 'FAIL P20a2 — soft-delete ownerovog payout expense-a je prošao (guard neaktivan)';
  EXCEPTION WHEN insufficient_privilege THEN
    RAISE NOTICE 'PASS P20a2 — soft-delete ownerovog auto-expense blokiran (42501)';
  END;

  -- (b) Radnikov attribution red — insert pa soft-delete kao radnik.
  --     `uniq_expenses_user_worker_payout` (partial WHERE worker_payout_id IS NOT NULL)
  --     ne isključuje soft-deleted redove, pa (c) hard-deleta ISTI red umjesto
  --     drugog inserta.
  INSERT INTO public.expenses (user_id, amount, type, payment_source, description, worker_payout_id, date, event_at, time_confidence)
    VALUES (v_worker_user, 100, 'income',
            'custom:' || (SELECT val FROM _bfix WHERE key='src_a')::text,
            'radnikov attribution P20b', v_payout_id,
            '2026-06-03', '2026-06-03 12:05:00+00', 'C2')
    RETURNING id INTO v_worker_expense_id;

  UPDATE public.expenses
    SET deleted_at = now()
    WHERE id = v_worker_expense_id;
  IF (SELECT deleted_at FROM public.expenses WHERE id = v_worker_expense_id) IS NULL THEN
    RAISE EXCEPTION 'FAIL P20b — soft-delete radnikovog attribution reda nije primijenjen';
  END IF;
  RAISE NOTICE 'PASS P20b — radnikov soft-delete attribution reda dopušten';

  -- (c) Hard DELETE istog radnikovog attribution reda.
  DELETE FROM public.expenses WHERE id = v_worker_expense_id;
  IF EXISTS (SELECT 1 FROM public.expenses WHERE id = v_worker_expense_id) THEN
    RAISE EXCEPTION 'FAIL P20c — hard DELETE radnikovog attribution reda nije prošao';
  END IF;
  RAISE NOTICE 'PASS P20c — hard DELETE radnikovog attribution reda dopušten';



  -- (d) Batch attribution — insert pa soft-delete.
  INSERT INTO public.expenses (user_id, amount, type, payment_source, description, worker_payout_batch_id, date, event_at, time_confidence)
    VALUES (v_worker_user, 250, 'income',
            'custom:' || (SELECT val FROM _bfix WHERE key='src_a')::text,
            'radnikov batch attribution P20d', v_batch,
            '2026-06-03', '2026-06-03 12:07:00+00', 'C2')
    RETURNING id INTO v_batch_expense_id;

  UPDATE public.expenses
    SET deleted_at = now()
    WHERE id = v_batch_expense_id;
  IF (SELECT deleted_at FROM public.expenses WHERE id = v_batch_expense_id) IS NULL THEN
    RAISE EXCEPTION 'FAIL P20d — soft-delete batch attribution reda nije primijenjen';
  END IF;
  RAISE NOTICE 'PASS P20d — radnikov soft-delete batch attribution reda dopušten';
END $$;
RELEASE SAVEPOINT s_p20;

-- ------------------------------------------------------------
-- P21 — preview_worker_earnings RPC (WS1/1.2):
--   (a) dva rate segmenta u periodu → točan gross (per-day rate_at)
--   (b) anon NEMA execute pravo
--   (c) unauthenticated poziv → 42501
-- ------------------------------------------------------------
ROLLBACK TO SAVEPOINT before_scenarios; SAVEPOINT s_p21;
SELECT pg_temp.seed_payout_fixtures(20, 4, 2, 1000);
-- seed_payout_fixtures kreira: worker rate=20, 2 entries × 4h na 2026-06-02 i 2026-06-03.
-- Dodajemo rate history s promjenom mid-period: 20→30 od 2026-06-03.
--   entry 2026-06-02 (4h) × 20 = 80
--   entry 2026-06-03 (4h) × 30 = 120
--   Očekivano: hours=8, gross=200
DO $$
DECLARE
  v_worker uuid := (SELECT val FROM _bfix WHERE key='wrk');
  v_owner  uuid := (SELECT val FROM _bfix WHERE key='user');
  v_res jsonb;
  v_hours numeric;
  v_gross numeric;
BEGIN
  -- Backfill iz migracije (koji dodaje redak u rate_history za nove workere)
  -- se izvodi samo jednom pri migraciji, ne za dinamički kreirane workere iz
  -- seed_payout_fixtures. Ovdje sami postavimo dva reda uz bypass flag.

  PERFORM set_config('app.allow_rate_write', 'on', true);
  DELETE FROM public.project_worker_rate_history WHERE worker_id = v_worker;
  INSERT INTO public.project_worker_rate_history (worker_id, rate, effective_from, created_by)
    VALUES
      (v_worker, 20, DATE '2026-06-01', v_owner),
      (v_worker, 30, DATE '2026-06-03', v_owner);
  PERFORM set_config('app.allow_rate_write', 'off', true);

  -- (a) Owner poziv → očekuj hours=8, gross=200
  PERFORM set_config('request.jwt.claim.sub', v_owner::text, true);
  v_res := public.preview_worker_earnings(
    v_worker,
    (SELECT val FROM _bfix WHERE key='proj'),
    DATE '2026-06-01',
    DATE '2026-06-05'
  );
  v_hours := (v_res->>'hours')::numeric;
  v_gross := (v_res->>'gross')::numeric;
  IF v_hours <> 8 THEN
    RAISE EXCEPTION 'FAIL P21a — očekivan hours=8, dobiveno %', v_hours;
  END IF;
  IF v_gross <> 200 THEN
    RAISE EXCEPTION 'FAIL P21a — očekivan gross=200, dobiveno %', v_gross;
  END IF;
  RAISE NOTICE 'PASS P21a — preview_worker_earnings vraća točan gross za 2 rate segmenta';

  -- (b) anon nema EXECUTE
  IF has_function_privilege(
       'anon',
       'public.preview_worker_earnings(uuid, uuid, date, date)',
       'EXECUTE'
     ) THEN
    RAISE EXCEPTION 'FAIL P21b — anon smije zvati preview_worker_earnings';
  END IF;
  RAISE NOTICE 'PASS P21b — anon revoked';

  -- (c) unauthenticated (auth.uid() NULL) → 42501
  PERFORM set_config('request.jwt.claim.sub', '', true);
  BEGIN
    PERFORM public.preview_worker_earnings(
      v_worker,
      (SELECT val FROM _bfix WHERE key='proj'),
      DATE '2026-06-01', DATE '2026-06-05'
    );
    RAISE EXCEPTION 'FAIL P21c — unauthenticated poziv je prošao';
  EXCEPTION WHEN insufficient_privilege THEN
    RAISE NOTICE 'PASS P21c — unauthenticated poziv odbijen (42501)';
  END;
END $$;
RELEASE SAVEPOINT s_p21;

-- ------------------------------------------------------------
-- P22 — contract_value baseline lock (WS1/1.3):
--   (a) projekt bez amendments → UPDATE contract_value prolazi
--   (b) projekt s amendment → UPDATE contract_value blokiran (42501)
--   (c) bypass flag (`app.allow_contract_baseline_write='on'`) → prolazi
-- ------------------------------------------------------------
ROLLBACK TO SAVEPOINT before_scenarios; SAVEPOINT s_p22;
DO $$
DECLARE
  v_user uuid := (SELECT val FROM _bfix WHERE key='user');
  v_proj uuid;
BEGIN
  -- Fresh projekt bez amendments
  v_proj := gen_random_uuid();
  INSERT INTO public.projects (id, user_id, name, contract_value)
    VALUES (v_proj, v_user, 'P22-a', 10000);

  -- (a) bez amendments — UPDATE prolazi
  UPDATE public.projects SET contract_value = 12000 WHERE id = v_proj;
  IF (SELECT contract_value FROM public.projects WHERE id = v_proj) <> 12000 THEN
    RAISE EXCEPTION 'FAIL P22a — UPDATE contract_value bez amendments nije primijenjen';
  END IF;
  RAISE NOTICE 'PASS P22a — UPDATE contract_value bez amendments prolazi';

  -- Dodaj amendment
  INSERT INTO public.project_contract_amendments (project_id, user_id, amendment_amount, note)
    VALUES (v_proj, v_user, 500, 'P22 aneks');

  -- (b) s amendment — UPDATE mora pasti
  BEGIN
    UPDATE public.projects SET contract_value = 15000 WHERE id = v_proj;
    RAISE EXCEPTION 'FAIL P22b — UPDATE contract_value s amendments je prošao (guard neaktivan)';
  EXCEPTION WHEN insufficient_privilege THEN
    RAISE NOTICE 'PASS P22b — UPDATE contract_value s amendments blokiran (42501)';
  END;
  -- Vrijednost mora ostati 12000 (guard je odbio)
  IF (SELECT contract_value FROM public.projects WHERE id = v_proj) <> 12000 THEN
    RAISE EXCEPTION 'FAIL P22b — contract_value se ipak promijenio unatoč guardu';
  END IF;

  -- (b2) UPDATE koji NE mijenja contract_value (npr. rename) mora proći
  UPDATE public.projects SET name = 'P22-renamed' WHERE id = v_proj;
  RAISE NOTICE 'PASS P22b2 — UPDATE koji ne dira contract_value prolazi s amendments';

  -- (c) bypass flag prolazi
  PERFORM set_config('app.allow_contract_baseline_write', 'on', true);
  UPDATE public.projects SET contract_value = 15000 WHERE id = v_proj;
  PERFORM set_config('app.allow_contract_baseline_write', 'off', true);
  IF (SELECT contract_value FROM public.projects WHERE id = v_proj) <> 15000 THEN
    RAISE EXCEPTION 'FAIL P22c — bypass flag nije dopustio UPDATE';
  END IF;
  RAISE NOTICE 'PASS P22c — bypass flag app.allow_contract_baseline_write prolazi';
END $$;
RELEASE SAVEPOINT s_p22;

-- ------------------------------------------------------------
-- P23 — WS2 / Faza 2.2: enqueue_worker_payout_notifications proširenje
--   (a) void s pripisom (single) → notifications.data.worker_attribution_expense_id postoji
--   (b) void bez pripisa → polje se ne dodaje
--   (c) void batch s pripisom → polje pokazuje na batch attribution red
--   (d) actor==recipient → nema obavijesti (owner ne šalje samom sebi)
-- ------------------------------------------------------------
ROLLBACK TO SAVEPOINT before_scenarios; SAVEPOINT s_p23;
SELECT pg_temp.seed_payout_fixtures(25, 4, 2, 1000);
DO $$
DECLARE
  v_owner   uuid := (SELECT val FROM _bfix WHERE key='user');
  v_worker_user uuid := '99999999-aaaa-bbbb-cccc-000000000023';
  v_payout_id uuid;
  v_expense_id uuid;
  v_batch uuid := gen_random_uuid();
  v_batch_expense_id uuid;
  v_delivered integer;
  v_data jsonb;
BEGIN
  INSERT INTO auth.users (id, email) VALUES (v_worker_user, 'p23@test')
    ON CONFLICT (id) DO NOTHING;

  UPDATE public.project_workers
     SET user_id = v_worker_user
   WHERE id = (SELECT val FROM _bfix WHERE key='wrk');

  -- Ownerov auto-payout kroz RPC (kreira project_worker_payouts + ownerov expense)
  PERFORM public.create_worker_payout(
    (SELECT val FROM _bfix WHERE key='wrk'),
    (SELECT val FROM _bfix WHERE key='proj'),
    DATE '2026-06-02', DATE '2026-06-03', 100,
    'custom:' || (SELECT val FROM _bfix WHERE key='src_a')::text,
    '2026-06-03 12:00:00+00', 'P23', true
  );
  SELECT id INTO v_payout_id FROM public.project_worker_payouts
    WHERE created_by = v_owner ORDER BY created_at DESC LIMIT 1;

  -- Očisti obavijesti koje su nastale iz created triggera (irelevantne za P23)
  DELETE FROM public.notifications WHERE user_id = v_worker_user;

  -- (b) Void BEZ pripisa → polje se ne dodaje
  v_delivered := public.enqueue_worker_payout_notifications(
    ARRAY[v_payout_id]::uuid[], 'voided', v_owner, NULL
  );
  IF v_delivered <> 1 THEN
    RAISE EXCEPTION 'FAIL P23b — očekivano 1 dostavljena obavijest, dobiveno %', v_delivered;
  END IF;
  SELECT data INTO v_data FROM public.notifications
    WHERE user_id = v_worker_user ORDER BY created_at DESC LIMIT 1;
  IF v_data ? 'worker_attribution_expense_id' THEN
    RAISE EXCEPTION 'FAIL P23b — polje worker_attribution_expense_id ne bi smjelo postojati bez pripisa';
  END IF;
  RAISE NOTICE 'PASS P23b — void bez pripisa ne dodaje worker_attribution_expense_id';

  -- Radnikov attribution red za single payout
  INSERT INTO public.expenses (user_id, amount, type, payment_source, description, worker_payout_id, date, event_at, time_confidence)
    VALUES (v_worker_user, 100, 'income',
            'custom:' || (SELECT val FROM _bfix WHERE key='src_a')::text,
            'P23 single attribution', v_payout_id,
            '2026-06-03', '2026-06-03 12:05:00+00', 'C2')
    RETURNING id INTO v_expense_id;

  DELETE FROM public.notifications WHERE user_id = v_worker_user;

  -- (a) Void S pripisom (single) → polje pokazuje na expense
  v_delivered := public.enqueue_worker_payout_notifications(
    ARRAY[v_payout_id]::uuid[], 'voided', v_owner, NULL
  );
  IF v_delivered <> 1 THEN
    RAISE EXCEPTION 'FAIL P23a — očekivano 1 dostavljena obavijest, dobiveno %', v_delivered;
  END IF;
  SELECT data INTO v_data FROM public.notifications
    WHERE user_id = v_worker_user ORDER BY created_at DESC LIMIT 1;
  IF NOT (v_data ? 'worker_attribution_expense_id') THEN
    RAISE EXCEPTION 'FAIL P23a — nedostaje worker_attribution_expense_id: %', v_data;
  END IF;
  IF (v_data->>'worker_attribution_expense_id')::uuid <> v_expense_id THEN
    RAISE EXCEPTION 'FAIL P23a — worker_attribution_expense_id mismatch: %', v_data->>'worker_attribution_expense_id';
  END IF;
  RAISE NOTICE 'PASS P23a — void s pripisom (single) dodaje worker_attribution_expense_id';

  -- (c) Batch varijanta — radnikov batch attribution red
  INSERT INTO public.expenses (user_id, amount, type, payment_source, description, worker_payout_batch_id, date, event_at, time_confidence)
    VALUES (v_worker_user, 250, 'income',
            'custom:' || (SELECT val FROM _bfix WHERE key='src_a')::text,
            'P23 batch attribution', v_batch,
            '2026-06-03', '2026-06-03 12:07:00+00', 'C2')
    RETURNING id INTO v_batch_expense_id;

  DELETE FROM public.notifications WHERE user_id = v_worker_user;

  v_delivered := public.enqueue_worker_payout_notifications(
    ARRAY[v_payout_id]::uuid[], 'voided', v_owner, v_batch
  );
  IF v_delivered <> 1 THEN
    RAISE EXCEPTION 'FAIL P23c — očekivano 1 dostavljena obavijest, dobiveno %', v_delivered;
  END IF;
  SELECT data INTO v_data FROM public.notifications
    WHERE user_id = v_worker_user ORDER BY created_at DESC LIMIT 1;
  IF (v_data->>'worker_attribution_expense_id')::uuid <> v_batch_expense_id THEN
    RAISE EXCEPTION 'FAIL P23c — batch worker_attribution_expense_id mismatch (očekivan %, dobiveno %)',
      v_batch_expense_id, v_data->>'worker_attribution_expense_id';
  END IF;
  RAISE NOTICE 'PASS P23c — void s pripisom (batch) dodaje worker_attribution_expense_id';

  -- (d) actor==recipient → nema obavijesti
  DELETE FROM public.notifications WHERE user_id = v_worker_user;
  v_delivered := public.enqueue_worker_payout_notifications(
    ARRAY[v_payout_id]::uuid[], 'voided', v_worker_user, NULL
  );
  IF v_delivered <> 0 THEN
    RAISE EXCEPTION 'FAIL P23d — actor==recipient je poslao %', v_delivered;
  END IF;
  RAISE NOTICE 'PASS P23d — actor==recipient ne dobiva obavijest';
END $$;
RELEASE SAVEPOINT s_p23;

-- ============================================================
-- P24 — enqueue_worker_payout_notifications piše i18n ključeve, ne HR tekst
-- (WS3a-1: server catalog + resolveNotificationText na klijentu)
-- ============================================================
-- Očekivano: notifications.title/message = i18n ključ (npr.
-- 'notifications.worker_payout.created.single.title'), a data.title_vars /
-- data.message_vars sadrže interpolacijske vrijednosti. Provjeravamo:
--   (a) single created  → title/message keys + title_vars.project + message_vars {amount, period_start, period_end}
--   (b) single voided   → voided ključevi
--   (c) batch created   → batch ključevi + message_vars.count/project_names
--   Nijedan title/message ne smije sadržavati 'Nova isplata', 'Isplata poništena', 'Zbirna isplata'
--   (dokaz da HR fallback tekst više ne curi u DB).
ROLLBACK TO SAVEPOINT before_scenarios; SAVEPOINT s_p24;
SELECT pg_temp.seed_payout_fixtures(26, 4, 2, 1000);
DO $$
DECLARE
  v_owner       uuid := (SELECT val FROM _bfix WHERE key='user');
  v_worker_user uuid := '99999999-aaaa-bbbb-cccc-000000000024';
  v_payout_id   uuid;
  v_notif       RECORD;
  v_delivered   integer;
  v_proj2       uuid := gen_random_uuid();
  v_wrk2        uuid := gen_random_uuid();
  v_payout_id2  uuid;
BEGIN
  INSERT INTO auth.users (id, email) VALUES (v_worker_user, 'p24@test')
    ON CONFLICT (id) DO NOTHING;

  UPDATE public.project_workers
     SET user_id = v_worker_user
   WHERE id = (SELECT val FROM _bfix WHERE key='wrk');

  -- (a) single created
  PERFORM public.create_worker_payout(
    (SELECT val FROM _bfix WHERE key='wrk'),
    (SELECT val FROM _bfix WHERE key='proj'),
    DATE '2026-06-02', DATE '2026-06-03', 100,
    'custom:' || (SELECT val FROM _bfix WHERE key='src_a')::text,
    '2026-06-03 12:00:00+00', 'P24', true
  );
  SELECT id INTO v_payout_id FROM public.project_worker_payouts
    WHERE created_by = v_owner ORDER BY created_at DESC LIMIT 1;

  -- create trigger već enqueue-uje obavijest — očitaj najnoviju
  SELECT * INTO v_notif FROM public.notifications
   WHERE user_id = v_worker_user
   ORDER BY created_at DESC LIMIT 1;

  IF v_notif.title <> 'notifications.worker_payout.created.single.title' THEN
    RAISE EXCEPTION 'FAIL P24a — title nije i18n ključ: %', v_notif.title;
  END IF;
  IF v_notif.message <> 'notifications.worker_payout.created.single.message' THEN
    RAISE EXCEPTION 'FAIL P24a — message nije i18n ključ: %', v_notif.message;
  END IF;
  IF NOT (v_notif.data ? 'title_vars') OR NOT (v_notif.data ? 'message_vars') THEN
    RAISE EXCEPTION 'FAIL P24a — nedostaju title_vars/message_vars: %', v_notif.data;
  END IF;
  IF (v_notif.data->'title_vars'->>'project') IS NULL THEN
    RAISE EXCEPTION 'FAIL P24a — title_vars.project prazan: %', v_notif.data->'title_vars';
  END IF;
  IF (v_notif.data->'message_vars'->>'amount') IS NULL
     OR (v_notif.data->'message_vars'->>'period_start') IS NULL
     OR (v_notif.data->'message_vars'->>'period_end') IS NULL THEN
    RAISE EXCEPTION 'FAIL P24a — message_vars nedostaje amount/period_start/period_end: %',
      v_notif.data->'message_vars';
  END IF;
  RAISE NOTICE 'PASS P24a — single created upisuje i18n ključeve + title/message_vars';

  -- (b) single voided
  DELETE FROM public.notifications WHERE user_id = v_worker_user;
  v_delivered := public.enqueue_worker_payout_notifications(
    ARRAY[v_payout_id]::uuid[], 'voided', v_owner, NULL
  );
  IF v_delivered <> 1 THEN
    RAISE EXCEPTION 'FAIL P24b — očekivano 1 dostavljena obavijest, dobiveno %', v_delivered;
  END IF;
  SELECT * INTO v_notif FROM public.notifications
   WHERE user_id = v_worker_user ORDER BY created_at DESC LIMIT 1;
  IF v_notif.title <> 'notifications.worker_payout.voided.single.title' THEN
    RAISE EXCEPTION 'FAIL P24b — voided title nije i18n ključ: %', v_notif.title;
  END IF;
  IF v_notif.message <> 'notifications.worker_payout.voided.single.message' THEN
    RAISE EXCEPTION 'FAIL P24b — voided message nije i18n ključ: %', v_notif.message;
  END IF;
  RAISE NOTICE 'PASS P24b — single voided piše voided i18n ključeve';

  -- (c) batch created — dodaj drugi payout za drugi projekt kroz istog radnika
  -- Minimalne kolone koje curated baseline shema poznaje (identično kao P15).
  INSERT INTO public.projects (id, user_id, name)
    VALUES (v_proj2, v_owner, 'P24 drugi projekt');
  INSERT INTO public.project_workers (id, project_id, first_name, last_name, hourly_rate, user_id)
    VALUES (v_wrk2, v_proj2, 'P24', 'Batch', 20, v_worker_user);

  DELETE FROM public.notifications WHERE user_id = v_worker_user;

  PERFORM public.create_worker_payout(
    v_wrk2, v_proj2,
    DATE '2026-06-04', DATE '2026-06-05', 150,
    'custom:' || (SELECT val FROM _bfix WHERE key='src_a')::text,
    '2026-06-05 12:00:00+00', 'P24-2', true
  );
  SELECT id INTO v_payout_id2 FROM public.project_worker_payouts
    WHERE project_id = v_proj2 ORDER BY created_at DESC LIMIT 1;

  DELETE FROM public.notifications WHERE user_id = v_worker_user;
  v_delivered := public.enqueue_worker_payout_notifications(
    ARRAY[v_payout_id, v_payout_id2]::uuid[], 'created', v_owner, gen_random_uuid()
  );
  IF v_delivered <> 1 THEN
    RAISE EXCEPTION 'FAIL P24c — očekivano 1 dostavljena obavijest, dobiveno %', v_delivered;
  END IF;
  SELECT * INTO v_notif FROM public.notifications
   WHERE user_id = v_worker_user ORDER BY created_at DESC LIMIT 1;
  IF v_notif.title <> 'notifications.worker_payout.created.batch.title' THEN
    RAISE EXCEPTION 'FAIL P24c — batch title nije i18n ključ: %', v_notif.title;
  END IF;
  IF (v_notif.data->'message_vars'->>'count')::int <> 2 THEN
    RAISE EXCEPTION 'FAIL P24c — batch message_vars.count očekivan 2, dobiveno %',
      v_notif.data->'message_vars'->>'count';
  END IF;
  IF (v_notif.data->'message_vars'->>'project_names') IS NULL THEN
    RAISE EXCEPTION 'FAIL P24c — batch message_vars.project_names prazan';
  END IF;
  RAISE NOTICE 'PASS P24c — batch created piše batch i18n ključeve + count/project_names';

  -- (d) Anti-regresija: HR fallback tekst se NE smije pojaviti u polju title/message
  IF EXISTS (
    SELECT 1 FROM public.notifications
     WHERE user_id = v_worker_user
       AND (title ILIKE 'Nova isplata%'
         OR title ILIKE 'Isplata poništena%'
         OR title ILIKE 'Zbirna isplata%'
         OR message ILIKE 'Zaprimljen%'
         OR message ILIKE 'Vaša isplata%')
  ) THEN
    RAISE EXCEPTION 'FAIL P24d — HR pre-rendered tekst curi u title/message (WS3a-1 regresija)';
  END IF;
  RAISE NOTICE 'PASS P24d — HR pre-rendered tekst nije u title/message';
END $$;
RELEASE SAVEPOINT s_p24;

-- Always roll back the harness transaction.
ROLLBACK;







