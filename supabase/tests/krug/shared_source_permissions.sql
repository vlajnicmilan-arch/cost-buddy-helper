-- Krug Shared Payment Source — permission matrix harness.
--
-- CILJ: real-Postgres regresija za novu permission matricu (owner + punopravni
-- mogu attachati vlastite izvore; obicni nikad; delete owner uvijek, self-linker
-- samo dok je full member; anon 42501).
--
-- KAKO POKRENUTI:
--   psql "$(supabase status | grep 'DB URL' | awk '{print $3}')" \
--     -v ON_ERROR_STOP=1 -f supabase/tests/krug/shared_source_permissions.sql
--
--   Runner MORA imati SUPERUSER / postgres role da može `SET ROLE authenticated`.
--   Live prod psql (sandbox_exec role) NEĆE to moći — koristi lokalni supabase
--   ili dedicated CI Postgres kao balance suite. Migracije koje moraju biti
--   primijenjene: sve krug_* + krug_shared_payment_source policy migracija koja
--   uvodi krug_sps_delete_owner_or_linker.
--
-- SEMANTIKA: sve u jednoj transakciji, ROLLBACK na kraju — nema perzistencije.
-- Svaka asertacija radi RAISE EXCEPTION kad se očekivano ne poklapa.

BEGIN;

DO $$
DECLARE
  owner_id uuid := gen_random_uuid();
  full_id  uuid := gen_random_uuid();
  ord_id   uuid := gen_random_uuid();
  krug_id  uuid := gen_random_uuid();
  owner_src uuid := gen_random_uuid();
  full_src  uuid := gen_random_uuid();
  ord_src   uuid := gen_random_uuid();
  anon_id   uuid := '00000000-0000-0000-0000-000000000000';
  owner_link uuid;
  full_link  uuid;
  result text;

  FUNCTION assert_eq(_actual text, _expected text, _label text) RETURNS void AS $inner$
  BEGIN
    IF _actual IS DISTINCT FROM _expected THEN
      RAISE EXCEPTION 'FAIL [%]: expected=% actual=%', _label, _expected, _actual;
    END IF;
    RAISE NOTICE 'PASS [%]: %', _label, _actual;
  END $inner$ LANGUAGE plpgsql;
BEGIN
  -- ── Seed (postgres role bypass RLS) ──────────────────────────────────────
  INSERT INTO auth.users (id, email) VALUES
    (owner_id, 'owner@matrix.test'),
    (full_id,  'full@matrix.test'),
    (ord_id,   'ord@matrix.test')
  ON CONFLICT DO NOTHING;

  INSERT INTO public.krug (id, name, preset, created_by, lifecycle_state)
  VALUES (krug_id, 'perm-matrix', 'klub', owner_id, 'active');

  INSERT INTO public.krug_ownership (krug_id, user_id) VALUES (krug_id, owner_id);
  INSERT INTO public.krug_membership (krug_id, user_id, role, added_by) VALUES
    (krug_id, full_id, 'punopravni', owner_id),
    (krug_id, ord_id,  'obicni',     owner_id);

  INSERT INTO public.custom_payment_sources (id, user_id, name) VALUES
    (owner_src, owner_id, 'owner-src'),
    (full_src,  full_id,  'full-src'),
    (ord_src,   ord_id,   'ord-src');
END $$;

-- Reusable per-user attempt helpers — set jwt claim + role, catch SQLSTATE.
CREATE OR REPLACE FUNCTION pg_temp.try_insert(_uid uuid, _krug uuid, _src text)
RETURNS text LANGUAGE plpgsql AS $$
DECLARE _state text;
BEGIN
  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', _uid::text, 'role', 'authenticated')::text, true);
  EXECUTE 'SET LOCAL ROLE ' || CASE WHEN _uid = '00000000-0000-0000-0000-000000000000'::uuid
                                    THEN 'anon' ELSE 'authenticated' END;
  BEGIN
    INSERT INTO public.krug_shared_payment_source (krug_id, payment_source_id, linked_by)
    VALUES (_krug, _src, _uid);
    RESET ROLE;
    RETURN 'ok';
  EXCEPTION WHEN OTHERS THEN
    _state := SQLSTATE; RESET ROLE; RETURN _state;
  END;
END $$;

CREATE OR REPLACE FUNCTION pg_temp.try_delete(_uid uuid, _row uuid)
RETURNS text LANGUAGE plpgsql AS $$
DECLARE _state text; _cnt int;
BEGIN
  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', _uid::text, 'role', 'authenticated')::text, true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  BEGIN
    DELETE FROM public.krug_shared_payment_source WHERE id = _row;
    GET DIAGNOSTICS _cnt = ROW_COUNT;
    RESET ROLE;
    RETURN CASE WHEN _cnt = 1 THEN 'ok' ELSE 'noop' END;
  EXCEPTION WHEN OTHERS THEN
    _state := SQLSTATE; RESET ROLE; RETURN _state;
  END;
END $$;

-- ── Insert matrix ────────────────────────────────────────────────────────────
DO $$
DECLARE
  krug_id  uuid := (SELECT id FROM public.krug WHERE name='perm-matrix');
  owner_id uuid := (SELECT user_id FROM public.krug_ownership WHERE krug_id=krug_id);
  full_id  uuid := (SELECT user_id FROM public.krug_membership WHERE krug_id=krug_id AND role='punopravni');
  ord_id   uuid := (SELECT user_id FROM public.krug_membership WHERE krug_id=krug_id AND role='obicni');
  owner_src uuid := (SELECT id FROM public.custom_payment_sources WHERE user_id=owner_id);
  full_src  uuid := (SELECT id FROM public.custom_payment_sources WHERE user_id=full_id);
  ord_src   uuid := (SELECT id FROM public.custom_payment_sources WHERE user_id=ord_id);
BEGIN
  -- Owner attaches own source → ok
  IF pg_temp.try_insert(owner_id, krug_id, 'custom:'||owner_src) <> 'ok' THEN
    RAISE EXCEPTION 'FAIL owner_own_insert should be ok';
  END IF;

  -- Full member attaches own source → ok (NEW behavior; was 42501 pre-fix)
  IF pg_temp.try_insert(full_id, krug_id, 'custom:'||full_src) <> 'ok' THEN
    RAISE EXCEPTION 'FAIL full_own_insert should be ok';
  END IF;

  -- Full member attaches OWNER's source → denied (not source owner)
  IF pg_temp.try_insert(full_id, krug_id, 'custom:'||owner_src) NOT LIKE '4%' THEN
    RAISE EXCEPTION 'FAIL full_foreign_insert should be RLS-denied';
  END IF;

  -- Ordinary member attaches own source → denied (not full member)
  IF pg_temp.try_insert(ord_id, krug_id, 'custom:'||ord_src) NOT LIKE '4%' THEN
    RAISE EXCEPTION 'FAIL ordinary_own_insert should be RLS-denied';
  END IF;

  -- Anon → 42501
  IF pg_temp.try_insert('00000000-0000-0000-0000-000000000000'::uuid,
                        krug_id, 'custom:'||owner_src) <> '42501' THEN
    RAISE EXCEPTION 'FAIL anon_insert should be 42501';
  END IF;
END $$;

-- ── Delete matrix ────────────────────────────────────────────────────────────
DO $$
DECLARE
  owner_id uuid := (SELECT user_id FROM public.krug_ownership
                    WHERE krug_id=(SELECT id FROM public.krug WHERE name='perm-matrix'));
  full_id  uuid := (SELECT user_id FROM public.krug_membership m
                    JOIN public.krug k ON k.id=m.krug_id
                    WHERE k.name='perm-matrix' AND m.role='punopravni');
  ord_id   uuid := (SELECT user_id FROM public.krug_membership m
                    JOIN public.krug k ON k.id=m.krug_id
                    WHERE k.name='perm-matrix' AND m.role='obicni');
  owner_link uuid := (SELECT id FROM public.krug_shared_payment_source WHERE linked_by=owner_id);
  full_link  uuid := (SELECT id FROM public.krug_shared_payment_source WHERE linked_by=full_id);
BEGIN
  -- Ordinary tries to delete full member's link → denied (RLS filters; DELETE returns noop, not error)
  -- We treat "noop" (RLS filtered) as "not-allowed"; either 'noop' or 42501 acceptable.
  IF pg_temp.try_delete(ord_id, full_link) NOT IN ('noop','42501') THEN
    RAISE EXCEPTION 'FAIL ordinary_delete should be blocked';
  END IF;

  -- Full member tries to delete owner's link → denied (not self-linked)
  IF pg_temp.try_delete(full_id, owner_link) NOT IN ('noop','42501') THEN
    RAISE EXCEPTION 'FAIL full_foreign_delete should be blocked';
  END IF;

  -- Full member deletes own link → ok
  IF pg_temp.try_delete(full_id, full_link) <> 'ok' THEN
    RAISE EXCEPTION 'FAIL full_own_delete should be ok';
  END IF;

  -- Owner deletes any link (re-insert full's link first to test foreign-delete-by-owner)
  PERFORM pg_temp.try_insert(full_id,
    (SELECT id FROM public.krug WHERE name='perm-matrix'),
    'custom:'||(SELECT id FROM public.custom_payment_sources WHERE user_id=full_id));
  full_link := (SELECT id FROM public.krug_shared_payment_source WHERE linked_by=full_id);
  IF pg_temp.try_delete(owner_id, full_link) <> 'ok' THEN
    RAISE EXCEPTION 'FAIL owner_foreign_delete should be ok';
  END IF;
END $$;

\echo 'All permission-matrix assertions passed.'

ROLLBACK;
