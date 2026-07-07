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

-- Always roll back the harness transaction.
ROLLBACK;
