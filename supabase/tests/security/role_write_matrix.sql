-- ============================================================================
-- SECURITY SQL HARNESS — role write matrix (Korak D)
-- ============================================================================
-- Dokazuje matricu prava PISANJA po ulogama projekta izravno nad Postgresom,
-- bez ijednog secreta. Pandan Playwright specu e2e/security/specs/
-- 09-role-writes-matrix.spec.ts, koji zahtijeva service_role ključ.
--
-- Pokreće se nad: bootstrap.sql + role_write_baseline.sql (vidi
-- .github/workflows/balance-sql-suite.yml, job `security-sql`).
--
-- ----------------------------------------------------------------------------
-- ŠTO OVAJ HARNESS **NE** POKRIVA (granice — pročitaj prije nego se osloniš):
-- ----------------------------------------------------------------------------
--  1. Pravi JWT put kroz GoTrue. `auth.uid()` je ovdje stub nad
--     `request.jwt.claim.sub`. Ne dokazuje izdavanje, potpis, istek ni
--     osvježavanje tokena, ni `aud`/`role` claim mapiranje.
--  2. PostgREST sloj. Ne dokazuje `return=representation` ponašanje, tablične
--     ni stupčane GRANT-ove kakve PostgREST vidi, izloženost stupaca, embedded
--     resource filtriranje, ni `Prefer` zaglavlja.
--  3. Edge funkcije i sve što ide preko service_role ključa (taj ključ
--     zaobilazi RLS — ova datoteka o tome ne govori ništa).
--  4. Drift između migracija i produkcije. Baseline
--     (role_write_baseline.sql) je SNIMKA žive sheme u trenutku pisanja. Ako
--     se politika promijeni izravno u produkciji bez migracije, harness će i
--     dalje biti zelen. Baseline treba regenerirati kad se politike mijenjaju.
--  5. Storage RLS (bucket policies) i realtime autorizaciju.
--
-- ----------------------------------------------------------------------------
-- DVA MEHANIZMA RAZLIKOVANJA (razlog postojanja ove datoteke)
-- ----------------------------------------------------------------------------
--  A. Odbijanje se priznaje SAMO uz SQLSTATE 42501 (RLS ili trigger).
--     Kodovi sheme (42703 nepostojeći stupac, 23502 NOT NULL, 23503 FK,
--     22P02 kriv tip, 42P01 nema tablice, 42883 nema funkcije, 42601 sintaksa)
--     RUŠE test s porukom "SCHEMA BUG" — jer bi inače test tvrdio da zaštita
--     radi, a nikad je ne bi dotaknuo.
--  B. Kad pravilo ne baca grešku nego samo ne pogodi nijedan redak (USING
--     filtar na UPDATE/DELETE), isti zahvat s IDENTIČNIM podacima mora prvo
--     proći vlasniku (expect_ok) — dokaz da stupac i vrijednost postoje.
--
-- Svaka provjera se izvršava u vlastitoj pod-transakciji i uvijek se poništava,
-- pa fixture ostaje netaknut i redoslijed provjera ne utječe na rezultat.
-- Cijela datoteka završava ROLLBACK-om.
-- ============================================================================

\set ON_ERROR_STOP on
-- Okolišni preduvjet: bootstrap.sql stvara `auth` schemu, ali bez GRANT-ova
-- koje pravi Supabase image ima. Bez njih svaki poziv auth.uid() iz politike
-- pada s "permission denied for schema auth" — što je također 42501 i moglo bi
-- lažno "potvrditi" zaštitu. Zato grantovi + preflight provjera niže.
GRANT USAGE ON SCHEMA auth TO authenticated, anon;
GRANT SELECT ON auth.users TO authenticated;

BEGIN;

-- Preflight: auth.uid() mora biti pozivljiv kao `authenticated`, inače su svi
-- rezultati bezvrijedni.
DO $$
DECLARE v uuid;
BEGIN
  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-0000000000ff', true);
  SELECT auth.uid() INTO v;
  RESET ROLE;
  IF v IS NULL THEN
    RAISE EXCEPTION 'PREFLIGHT FAIL — auth.uid() ne vraća sub claim';
  END IF;
  RAISE NOTICE 'PREFLIGHT ok — auth.uid() radi kao authenticated';
END;
$$;

-- ---------------------------------------------------------------------------
-- Brojači i evidencija padova.
-- Provjere se NE prekidaju na prvom padu — svaka se izvrši, a na kraju
-- datoteka pukne ako ijedan pad postoji. Tako jedan nalaz ne sakrije ostale.
-- ---------------------------------------------------------------------------
CREATE TEMP TABLE _rwm_stats (passed int NOT NULL DEFAULT 0);
INSERT INTO _rwm_stats VALUES (0);
CREATE TEMP TABLE _rwm_failures (kind text NOT NULL, label text NOT NULL, reason text NOT NULL);

-- ---------------------------------------------------------------------------
-- Jezgra: izvrši p_sql kao korisnik p_user i uvijek poništi učinak.
-- Vraća: ('ok', <rowcount>) | ('err', <sqlstate>) uz p_msg.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION pg_temp.try_as(
  p_user uuid,
  p_sql  text,
  OUT outcome text,
  OUT rows_affected int,
  OUT sqlstate_code text,
  OUT err_message text
)
LANGUAGE plpgsql AS $$
DECLARE
  n int;
BEGIN
  outcome := NULL; rows_affected := NULL; sqlstate_code := NULL; err_message := NULL;
  BEGIN
    EXECUTE 'SET LOCAL ROLE authenticated';
    PERFORM set_config('request.jwt.claim.sub', p_user::text, true);
    PERFORM set_config('request.jwt.claim.role', 'authenticated', true);
    EXECUTE p_sql;
    GET DIAGNOSTICS n = ROW_COUNT;
    -- Namjerna iznimka: ruši pod-transakciju i time poništava zapis.
    RAISE EXCEPTION 'RWM_ROLLBACK:%', n USING ERRCODE = 'P0001';
  EXCEPTION WHEN OTHERS THEN
    IF SQLSTATE = 'P0001' AND SQLERRM LIKE 'RWM_ROLLBACK:%' THEN
      outcome := 'ok';
      rows_affected := split_part(SQLERRM, ':', 2)::int;
    ELSE
      outcome := 'err';
      sqlstate_code := SQLSTATE;
      err_message := SQLERRM;
    END IF;
  END;
  EXECUTE 'RESET ROLE';
  PERFORM set_config('request.jwt.claim.sub', '', true);
END;
$$;

-- Kodovi koji znače "test je pogriješio", ne "zaštita je proradila".
CREATE OR REPLACE FUNCTION pg_temp.is_schema_bug(p_code text, p_msg text DEFAULT '')
RETURNS boolean LANGUAGE sql IMMUTABLE AS $$
  SELECT p_code IN ('42703','23502','23503','22P02','42P01','42883','42601','42804','23505','22007','42P02','42P10')
      -- 42501 zna doći i iz nedostajućeg GRANT-a u baselineu, ne iz politike.
      -- To je kvar harnessa i mora rušiti test, ne "potvrditi" zaštitu.
      OR p_msg LIKE 'permission denied for %';
$$;

CREATE OR REPLACE FUNCTION pg_temp.pass(p_label text)
RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  UPDATE _rwm_stats SET passed = passed + 1;
  RAISE NOTICE 'PASS  %', p_label;
END;
$$;

CREATE OR REPLACE FUNCTION pg_temp.fail(p_kind text, p_label text, p_reason text)
RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  INSERT INTO _rwm_failures VALUES (p_kind, p_label, p_reason);
  RAISE WARNING '% %  — %', p_kind, p_label, p_reason;
END;
$$;

-- ---------------------------------------------------------------------------
-- expect_ok — zahvat MORA proći i pogoditi barem jedan redak.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION pg_temp.expect_ok(p_label text, p_user uuid, p_sql text)
RETURNS void LANGUAGE plpgsql AS $$
DECLARE r record;
BEGIN
  SELECT * INTO r FROM pg_temp.try_as(p_user, p_sql);
  IF r.outcome = 'err' THEN
    PERFORM pg_temp.fail('FAIL', p_label, format('očekivan prolaz, dobiveno %s: %s', r.sqlstate_code, r.err_message));
    RETURN;
  END IF;
  IF r.rows_affected = 0 THEN
    PERFORM pg_temp.fail('FAIL', p_label, 'očekivan prolaz, ali 0 redaka (politika je tiho odbila ili WHERE ne pogađa fixture)');
    RETURN;
  END IF;
  PERFORM pg_temp.pass(p_label);
END;
$$;

-- ---------------------------------------------------------------------------
-- expect_denied — zahvat MORA pasti sa 42501 (RLS WITH CHECK ili trigger).
-- Svaki kod sheme ruši test kao SCHEMA BUG.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION pg_temp.expect_denied(p_label text, p_user uuid, p_sql text)
RETURNS void LANGUAGE plpgsql AS $$
DECLARE r record;
BEGIN
  SELECT * INTO r FROM pg_temp.try_as(p_user, p_sql);
  IF r.outcome = 'ok' THEN
    PERFORM pg_temp.fail('FAIL', p_label, format('očekivano odbijanje (42501), zahvat je PROŠAO (%s redaka)', r.rows_affected));
    RETURN;
  END IF;
  IF pg_temp.is_schema_bug(r.sqlstate_code, r.err_message) THEN
    PERFORM pg_temp.fail('SCHEMA BUG', p_label,
      format('zahvat je pao na %s (%s), a ne na politici — test nikad nije dotaknuo zaštitu', r.sqlstate_code, r.err_message));
    RETURN;
  END IF;
  IF r.sqlstate_code <> '42501' THEN
    PERFORM pg_temp.fail('FAIL', p_label, format('očekivan 42501, dobiveno %s (%s)', r.sqlstate_code, r.err_message));
    RETURN;
  END IF;
  PERFORM pg_temp.pass(p_label || '  [42501: ' || left(r.err_message, 60) || ']');
END;
$$;

-- ---------------------------------------------------------------------------
-- expect_blocked_silently — mehanizam B.
-- USING filtar ne baca grešku, nego vrati 0 redaka. Zato:
--   1) identičan zahvat mora PROĆI kontrolnom korisniku (dokaz da stupac i
--      vrijednost postoje i da WHERE pogađa fixture)
--   2) ograničena uloga mora dobiti točno 0 redaka i nijednu grešku sheme
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION pg_temp.expect_blocked_silently(
  p_label text, p_user uuid, p_sql text, p_control uuid
)
RETURNS void LANGUAGE plpgsql AS $$
DECLARE r record; c record;
BEGIN
  -- (1) kontrolni korisnik — isti SQL, isti stupci, iste vrijednosti
  SELECT * INTO c FROM pg_temp.try_as(p_control, p_sql);
  IF c.outcome = 'err' THEN
    IF pg_temp.is_schema_bug(c.sqlstate_code, c.err_message) THEN
      PERFORM pg_temp.fail('SCHEMA BUG', p_label,
        format('kontrolni zahvat je pao na %s (%s) — stupac ili vrijednost ne postoje, pa provjera ograničene uloge ne znači ništa', c.sqlstate_code, c.err_message));
    ELSE
      PERFORM pg_temp.fail('FAIL', p_label, format('kontrolni zahvat odbijen (%s: %s)', c.sqlstate_code, c.err_message));
    END IF;
    RETURN;
  END IF;
  IF c.rows_affected = 0 THEN
    PERFORM pg_temp.fail('FAIL', p_label, 'kontrolni zahvat je pogodio 0 redaka; provjera bi bila bezvrijedna');
    RETURN;
  END IF;

  -- (2) ograničena uloga
  SELECT * INTO r FROM pg_temp.try_as(p_user, p_sql);
  IF r.outcome = 'err' THEN
    IF pg_temp.is_schema_bug(r.sqlstate_code, r.err_message) THEN
      PERFORM pg_temp.fail('SCHEMA BUG', p_label, format('%s (%s)', r.sqlstate_code, r.err_message));
      RETURN;
    END IF;
    IF r.sqlstate_code = '42501' THEN
      PERFORM pg_temp.pass(p_label || '  [42501 umjesto 0 redaka — jednako dobro]');
      RETURN;
    END IF;
    PERFORM pg_temp.fail('FAIL', p_label, format('neočekivana greška %s (%s)', r.sqlstate_code, r.err_message));
    RETURN;
  END IF;
  IF r.rows_affected <> 0 THEN
    PERFORM pg_temp.fail('FAIL', p_label, format('zahvat je promijenio %s redaka; zaštita ne drži', r.rows_affected));
    RETURN;
  END IF;
  PERFORM pg_temp.pass(p_label || '  [0 redaka, kontrolni zahvat prošao]');
END;
$$;


-- ===========================================================================
-- FIXTURE (upisuje se kao postgres → RLS se ne primjenjuje)
-- ===========================================================================
CREATE TEMP TABLE _rwm (key text PRIMARY KEY, val uuid NOT NULL);
INSERT INTO _rwm VALUES
  ('owner',      '10000000-0000-0000-0000-000000000001'),
  ('member',     '10000000-0000-0000-0000-000000000002'),
  ('viewer',     '10000000-0000-0000-0000-000000000003'),
  ('worker',     '10000000-0000-0000-0000-000000000004'),
  ('investor',   '10000000-0000-0000-0000-000000000005'),
  ('nosub',      '10000000-0000-0000-0000-000000000006'),
  ('p1',         '20000000-0000-0000-0000-000000000001'),
  ('p2',         '20000000-0000-0000-0000-000000000002'),
  ('m1',         '30000000-0000-0000-0000-000000000001'),
  ('m2',         '30000000-0000-0000-0000-000000000002'),
  ('w1',         '40000000-0000-0000-0000-000000000001');

INSERT INTO auth.users (id, email)
SELECT val, key || '@rwm.test' FROM _rwm WHERE key IN ('owner','member','viewer','worker','investor','nosub')
ON CONFLICT (id) DO NOTHING;

-- Pretplata na modul `projekti`: owner DA, nosub NE.
INSERT INTO public.user_entitlements (user_id, module, source, status, period_end)
VALUES ((SELECT val FROM _rwm WHERE key='owner'), 'projekti', 'test', 'active', NULL);

-- P1: vlasnik s pretplatom, sve četiri uloge.
INSERT INTO public.projects (id, user_id, name, contract_value)
VALUES ((SELECT val FROM _rwm WHERE key='p1'), (SELECT val FROM _rwm WHERE key='owner'), 'RWM P1', 10000);

-- P2: vlasnik BEZ pretplate, isti `member`.
INSERT INTO public.projects (id, user_id, name, contract_value)
VALUES ((SELECT val FROM _rwm WHERE key='p2'), (SELECT val FROM _rwm WHERE key='nosub'), 'RWM P2', 5000);

INSERT INTO public.project_members (project_id, user_id, role)
SELECT (SELECT val FROM _rwm WHERE key='p1'), val, key
FROM _rwm WHERE key IN ('member','viewer','worker','investor');

INSERT INTO public.project_members (project_id, user_id, role)
VALUES ((SELECT val FROM _rwm WHERE key='p2'), (SELECT val FROM _rwm WHERE key='member'), 'member');

INSERT INTO public.project_milestones (id, project_id, name, status, budget, investor_price)
VALUES
  ((SELECT val FROM _rwm WHERE key='m1'), (SELECT val FROM _rwm WHERE key='p1'), 'RWM faza 1', 'pending', 1000, 1500),
  ((SELECT val FROM _rwm WHERE key='m2'), (SELECT val FROM _rwm WHERE key='p2'), 'RWM faza 2', 'pending', 500, 800);

INSERT INTO public.project_workers (id, project_id, user_id, first_name, last_name, position, hourly_rate)
VALUES ((SELECT val FROM _rwm WHERE key='w1'), (SELECT val FROM _rwm WHERE key='p1'),
        (SELECT val FROM _rwm WHERE key='worker'), 'Rad', 'Nik', 'zidar', 20);

-- ===========================================================================
-- MATRICA
-- ===========================================================================
DO $$
DECLARE
  u_owner    uuid := (SELECT val FROM _rwm WHERE key='owner');
  u_member   uuid := (SELECT val FROM _rwm WHERE key='member');
  u_viewer   uuid := (SELECT val FROM _rwm WHERE key='viewer');
  u_worker   uuid := (SELECT val FROM _rwm WHERE key='worker');
  u_investor uuid := (SELECT val FROM _rwm WHERE key='investor');
  u_nosub    uuid := (SELECT val FROM _rwm WHERE key='nosub');
  p1 uuid := (SELECT val FROM _rwm WHERE key='p1');
  p2 uuid := (SELECT val FROM _rwm WHERE key='p2');
  m1 uuid := (SELECT val FROM _rwm WHERE key='m1');
  m2 uuid := (SELECT val FROM _rwm WHERE key='m2');
  w1 uuid := (SELECT val FROM _rwm WHERE key='w1');
  s_status text;
BEGIN
  -- ---- 1. status faze -----------------------------------------------------
  s_status := format('UPDATE public.project_milestones SET status = ''in_progress'' WHERE id = %L', m1);
  PERFORM pg_temp.expect_ok('01 status faze — vlasnik prolazi', u_owner, s_status);
  PERFORM pg_temp.expect_ok('02 status faze — member (voditelj) prolazi', u_member, s_status);
  PERFORM pg_temp.expect_blocked_silently('03 status faze — viewer odbijen',   u_viewer,   s_status, u_owner);
  PERFORM pg_temp.expect_blocked_silently('04 status faze — worker odbijen',   u_worker,   s_status, u_owner);
  PERFORM pg_temp.expect_blocked_silently('05 status faze — investor odbijen', u_investor, s_status, u_owner);

  -- ---- 2. iznosi na fazi (trigger guard_milestone_column_writes) ----------
  PERFORM pg_temp.expect_ok('06 budget faze — vlasnik prolazi', u_owner,
    format('UPDATE public.project_milestones SET budget = 2222 WHERE id = %L', m1));
  PERFORM pg_temp.expect_denied('07 budget faze — member odbijen (trigger)', u_member,
    format('UPDATE public.project_milestones SET budget = 2222 WHERE id = %L', m1));
  PERFORM pg_temp.expect_ok('08 investor_price faze — vlasnik prolazi', u_owner,
    format('UPDATE public.project_milestones SET investor_price = 3333 WHERE id = %L', m1));
  PERFORM pg_temp.expect_denied('09 investor_price faze — member odbijen (trigger)', u_member,
    format('UPDATE public.project_milestones SET investor_price = 3333 WHERE id = %L', m1));

  -- ---- 3. contract_value na projektu --------------------------------------
  PERFORM pg_temp.expect_ok('10 contract_value — vlasnik prolazi', u_owner,
    format('UPDATE public.projects SET contract_value = 12345 WHERE id = %L', p1));
  PERFORM pg_temp.expect_blocked_silently('11 contract_value — member odbijen',   u_member,
    format('UPDATE public.projects SET contract_value = 12345 WHERE id = %L', p1), u_owner);
  PERFORM pg_temp.expect_blocked_silently('12 contract_value — viewer odbijen',   u_viewer,
    format('UPDATE public.projects SET contract_value = 12345 WHERE id = %L', p1), u_owner);
  PERFORM pg_temp.expect_blocked_silently('13 contract_value — investor odbijen', u_investor,
    format('UPDATE public.projects SET contract_value = 12345 WHERE id = %L', p1), u_owner);
  PERFORM pg_temp.expect_blocked_silently('14 contract_value — worker odbijen',   u_worker,
    format('UPDATE public.projects SET contract_value = 12345 WHERE id = %L', p1), u_owner);

  -- ---- 4. INSERT / DELETE faze --------------------------------------------
  PERFORM pg_temp.expect_ok('15 INSERT faze — vlasnik prolazi', u_owner,
    format('INSERT INTO public.project_milestones (project_id, name, status) VALUES (%L, ''nova'', ''pending'')', p1));
  PERFORM pg_temp.expect_denied('16 INSERT faze — member odbijen', u_member,
    format('INSERT INTO public.project_milestones (project_id, name, status) VALUES (%L, ''nova'', ''pending'')', p1));
  PERFORM pg_temp.expect_blocked_silently('17 DELETE faze — member odbijen', u_member,
    format('DELETE FROM public.project_milestones WHERE id = %L', m1), u_owner);

  -- ---- 5. revizije i aneksi -----------------------------------------------
  PERFORM pg_temp.expect_ok('18 milestone_budget_revisions INSERT — vlasnik prolazi', u_owner,
    format('INSERT INTO public.milestone_budget_revisions (project_id, milestone_id, user_id, reason, previous_amount, new_amount) VALUES (%L, %L, %L, ''test'', 1000, 1200)', p1, m1, u_owner));
  PERFORM pg_temp.expect_denied('19 milestone_budget_revisions INSERT — member odbijen', u_member,
    format('INSERT INTO public.milestone_budget_revisions (project_id, milestone_id, user_id, reason, previous_amount, new_amount) VALUES (%L, %L, %L, ''test'', 1000, 1200)', p1, m1, u_member));
  PERFORM pg_temp.expect_denied('20 milestone_budget_revisions INSERT — viewer odbijen', u_viewer,
    format('INSERT INTO public.milestone_budget_revisions (project_id, milestone_id, user_id, reason, previous_amount, new_amount) VALUES (%L, %L, %L, ''test'', 1000, 1200)', p1, m1, u_viewer));
  PERFORM pg_temp.expect_denied('21 milestone_budget_revisions INSERT — investor odbijen', u_investor,
    format('INSERT INTO public.milestone_budget_revisions (project_id, milestone_id, user_id, reason, previous_amount, new_amount) VALUES (%L, %L, %L, ''test'', 1000, 1200)', p1, m1, u_investor));

  PERFORM pg_temp.expect_ok('22 project_budget_revisions INSERT — vlasnik prolazi', u_owner,
    format('INSERT INTO public.project_budget_revisions (project_id, user_id, previous_amount, new_amount) VALUES (%L, %L, 10000, 11000)', p1, u_owner));
  PERFORM pg_temp.expect_denied('23 project_budget_revisions INSERT — member odbijen', u_member,
    format('INSERT INTO public.project_budget_revisions (project_id, user_id, previous_amount, new_amount) VALUES (%L, %L, 10000, 11000)', p1, u_member));
  PERFORM pg_temp.expect_denied('24 project_budget_revisions INSERT — viewer odbijen', u_viewer,
    format('INSERT INTO public.project_budget_revisions (project_id, user_id, previous_amount, new_amount) VALUES (%L, %L, 10000, 11000)', p1, u_viewer));
  PERFORM pg_temp.expect_denied('25 project_budget_revisions INSERT — investor odbijen', u_investor,
    format('INSERT INTO public.project_budget_revisions (project_id, user_id, previous_amount, new_amount) VALUES (%L, %L, 10000, 11000)', p1, u_investor));

  PERFORM pg_temp.expect_ok('26 project_contract_amendments INSERT — vlasnik prolazi', u_owner,
    format('INSERT INTO public.project_contract_amendments (project_id, user_id, amendment_amount) VALUES (%L, %L, 500)', p1, u_owner));
  PERFORM pg_temp.expect_denied('27 project_contract_amendments INSERT — member odbijen', u_member,
    format('INSERT INTO public.project_contract_amendments (project_id, user_id, amendment_amount) VALUES (%L, %L, 500)', p1, u_member));
  PERFORM pg_temp.expect_denied('28 project_contract_amendments INSERT — viewer odbijen', u_viewer,
    format('INSERT INTO public.project_contract_amendments (project_id, user_id, amendment_amount) VALUES (%L, %L, 500)', p1, u_viewer));
  PERFORM pg_temp.expect_denied('29 project_contract_amendments INSERT — investor odbijen', u_investor,
    format('INSERT INTO public.project_contract_amendments (project_id, user_id, amendment_amount) VALUES (%L, %L, 500)', p1, u_investor));

  -- ---- 6. dokumenti i checkliste ------------------------------------------
  PERFORM pg_temp.expect_ok('30 dokument INSERT — vlasnik prolazi', u_owner,
    format('INSERT INTO public.project_documents (project_id, uploaded_by, name, storage_path) VALUES (%L, %L, ''d.pdf'', ''p/d.pdf'')', p1, u_owner));
  PERFORM pg_temp.expect_ok('31 dokument INSERT — member prolazi', u_member,
    format('INSERT INTO public.project_documents (project_id, uploaded_by, name, storage_path) VALUES (%L, %L, ''d.pdf'', ''p/d.pdf'')', p1, u_member));
  PERFORM pg_temp.expect_denied('32 dokument INSERT — viewer odbijen', u_viewer,
    format('INSERT INTO public.project_documents (project_id, uploaded_by, name, storage_path) VALUES (%L, %L, ''d.pdf'', ''p/d.pdf'')', p1, u_viewer));
  PERFORM pg_temp.expect_denied('33 dokument INSERT — investor odbijen', u_investor,
    format('INSERT INTO public.project_documents (project_id, uploaded_by, name, storage_path) VALUES (%L, %L, ''d.pdf'', ''p/d.pdf'')', p1, u_investor));

  PERFORM pg_temp.expect_ok('34 checklist INSERT — member prolazi', u_member,
    format('INSERT INTO public.milestone_checklist_items (milestone_id, user_id, title) VALUES (%L, %L, ''stavka'')', m1, u_member));
  PERFORM pg_temp.expect_denied('35 checklist INSERT — viewer odbijen', u_viewer,
    format('INSERT INTO public.milestone_checklist_items (milestone_id, user_id, title) VALUES (%L, %L, ''stavka'')', m1, u_viewer));
  PERFORM pg_temp.expect_denied('36 checklist INSERT — investor odbijen', u_investor,
    format('INSERT INTO public.milestone_checklist_items (milestone_id, user_id, title) VALUES (%L, %L, ''stavka'')', m1, u_investor));

  -- ---- 7. radnici ----------------------------------------------------------
  PERFORM pg_temp.expect_ok('37 project_workers INSERT — vlasnik prolazi', u_owner,
    format('INSERT INTO public.project_workers (project_id, first_name, last_name, position, hourly_rate) VALUES (%L, ''A'', ''B'', ''zidar'', 15)', p1));
  PERFORM pg_temp.expect_denied('38 project_workers INSERT — member odbijen', u_member,
    format('INSERT INTO public.project_workers (project_id, first_name, last_name, position, hourly_rate) VALUES (%L, ''A'', ''B'', ''zidar'', 15)', p1));
  PERFORM pg_temp.expect_denied('39 project_workers INSERT — viewer odbijen', u_viewer,
    format('INSERT INTO public.project_workers (project_id, first_name, last_name, position, hourly_rate) VALUES (%L, ''A'', ''B'', ''zidar'', 15)', p1));
  PERFORM pg_temp.expect_denied('40 project_workers INSERT — investor odbijen', u_investor,
    format('INSERT INTO public.project_workers (project_id, first_name, last_name, position, hourly_rate) VALUES (%L, ''A'', ''B'', ''zidar'', 15)', p1));

  -- hourly_rate: izravan UPDATE zabranjen SVIMA, uključujući vlasnika
  -- (trigger _guard_worker_rate_direct_update). Dopušten put je RPC.
  PERFORM pg_temp.expect_denied('41 hourly_rate izravan UPDATE — odbijen i vlasniku (trigger)', u_owner,
    format('UPDATE public.project_workers SET hourly_rate = 99 WHERE id = %L', w1));
  -- NAMJERNO IZOSTAVLJENO: "hourly_rate izravan UPDATE — member odbijen".
  -- Za member-a RLS vrati 0 redaka prije nego trigger uopće opali, a kontrolni
  -- zahvat nije moguć jer isti UPDATE trigger zabranjuje i vlasniku. Provjera
  -- zato ne bi mogla razlikovati "politika drži" od "WHERE ne pogađa redak",
  -- pa je izostavljena umjesto da lažno zeleni. Member je pokriven testom 44
  -- (dopušteni put — RPC set_worker_hourly_rate).

  PERFORM pg_temp.expect_ok('43 hourly_rate preko set_worker_hourly_rate — vlasnik prolazi', u_owner,
    format('SELECT public.set_worker_hourly_rate(%L, 99, CURRENT_DATE)', w1));
  PERFORM pg_temp.expect_denied('44 set_worker_hourly_rate — member odbijen', u_member,
    format('SELECT public.set_worker_hourly_rate(%L, 99, CURRENT_DATE)', w1));

  -- ---- 8. članovi i pozivnice ----------------------------------------------
  PERFORM pg_temp.expect_ok('45 project_members INSERT — vlasnik prolazi', u_owner,
    format('INSERT INTO public.project_members (project_id, user_id, role) VALUES (%L, %L, ''viewer'')', p1, u_nosub));
  PERFORM pg_temp.expect_denied('46 project_members INSERT — member odbijen', u_member,
    format('INSERT INTO public.project_members (project_id, user_id, role) VALUES (%L, %L, ''viewer'')', p1, u_nosub));
  PERFORM pg_temp.expect_denied('47 project_members INSERT — viewer odbijen', u_viewer,
    format('INSERT INTO public.project_members (project_id, user_id, role) VALUES (%L, %L, ''viewer'')', p1, u_nosub));
  PERFORM pg_temp.expect_denied('48 project_members INSERT — investor odbijen', u_investor,
    format('INSERT INTO public.project_members (project_id, user_id, role) VALUES (%L, %L, ''viewer'')', p1, u_nosub));

  PERFORM pg_temp.expect_ok('49 project_invitations INSERT — vlasnik prolazi', u_owner,
    format('INSERT INTO public.project_invitations (project_id, invited_by, email) VALUES (%L, %L, ''x@rwm.test'')', p1, u_owner));
  PERFORM pg_temp.expect_denied('50 project_invitations INSERT — member odbijen', u_member,
    format('INSERT INTO public.project_invitations (project_id, invited_by, email) VALUES (%L, %L, ''x@rwm.test'')', p1, u_member));
  PERFORM pg_temp.expect_denied('51 project_invitations INSERT — viewer odbijen', u_viewer,
    format('INSERT INTO public.project_invitations (project_id, invited_by, email) VALUES (%L, %L, ''x@rwm.test'')', p1, u_viewer));
  PERFORM pg_temp.expect_denied('52 project_invitations INSERT — investor odbijen', u_investor,
    format('INSERT INTO public.project_invitations (project_id, invited_by, email) VALUES (%L, %L, ''x@rwm.test'')', p1, u_investor));

  -- ---- 9. pretplata veže samo vlastite projekte -----------------------------
  -- Kontrolni korisnik je ovdje `member` (voditelj na tuđem projektu): isti
  -- zahvat mora njemu proći, čime je dokazano da stupac i vrijednost postoje.
  PERFORM pg_temp.expect_blocked_silently('53 vlasnik BEZ pretplate — odbijen na SVOM projektu', u_nosub,
    format('UPDATE public.project_milestones SET status = ''in_progress'' WHERE id = %L', m2), u_member);
  PERFORM pg_temp.expect_ok('54 member BEZ pretplate — prolazi na TUĐEM projektu (vlasnik bez pretplate)', u_member,
    format('UPDATE public.project_milestones SET status = ''in_progress'' WHERE id = %L', m2));

END;
$$;

DO $$
DECLARE
  v_passed int;
  v_failed int;
  f record;
BEGIN
  SELECT passed INTO v_passed FROM _rwm_stats;
  SELECT count(*) INTO v_failed FROM _rwm_failures;
  RAISE NOTICE '=========================================';
  RAISE NOTICE 'ROLE WRITE MATRIX — prošlo %, palo %', v_passed, v_failed;
  FOR f IN SELECT * FROM _rwm_failures LOOP
    RAISE NOTICE '  % % — %', f.kind, f.label, f.reason;
  END LOOP;
  RAISE NOTICE '=========================================';
  IF v_failed > 0 THEN
    RAISE EXCEPTION 'ROLE WRITE MATRIX: % provjera nije prošlo', v_failed;
  END IF;
END;
$$;


ROLLBACK;
