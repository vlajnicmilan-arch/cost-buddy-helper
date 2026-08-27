-- Scenariji: veza s Centar računom pripada OSOBI, ne angažmanu.
--
--   PL1  veza prema gore poveže sve angažmane te osobe
--   PL2  novi angažman povezane osobe sam dobije user_id
--   PL3  sukob preskoči samo taj projekt, ostale ostavi povezane + zapiše trag
--   PL4  odvezivanje očisti i osobu i sve angažmane
--   PL5  RPC bez prijave pada (42501)
--   PL6  RPC tuđe osobe pada (42501)
--   PL7  račun koji NIJE član nijednog projekta te osobe → odbijen, ništa upisano
--   PL8  vlasnik smije povezati sam sebe

\set ON_ERROR_STOP on

CREATE OR REPLACE FUNCTION pg_temp.check(p_name text, p_cond boolean) RETURNS void
LANGUAGE plpgsql AS $$
BEGIN
  IF p_cond THEN RAISE NOTICE 'PASS %', p_name;
  ELSE RAISE EXCEPTION 'FAIL %', p_name; END IF;
END $$;

DO $t$
DECLARE
  owner_id uuid := '00000000-0000-0000-0000-0000000000a1';
  acct     uuid := '00000000-0000-0000-0000-0000000000b2';
  stranger uuid := '00000000-0000-0000-0000-0000000000c3';
  p1 uuid; p2 uuid; p3 uuid;
  person uuid; other_person uuid;
  e1 uuid; e2 uuid; e3 uuid; e_other uuid; e_new uuid;
  v_res jsonb;
BEGIN
  INSERT INTO public.projects(user_id, name) VALUES (owner_id, 'P1') RETURNING id INTO p1;
  INSERT INTO public.projects(user_id, name) VALUES (owner_id, 'P2') RETURNING id INTO p2;
  INSERT INTO public.projects(user_id, name) VALUES (owner_id, 'P3') RETURNING id INTO p3;

  INSERT INTO public.workers(user_id, first_name, last_name) VALUES (owner_id, 'Petar', 'P')
    RETURNING id INTO person;
  INSERT INTO public.workers(user_id, first_name, last_name) VALUES (owner_id, 'Ivan', 'I')
    RETURNING id INTO other_person;

  INSERT INTO public.project_workers(project_id, worker_id, first_name, last_name)
    VALUES (p1, person, 'Petar', 'P') RETURNING id INTO e1;
  INSERT INTO public.project_workers(project_id, worker_id, first_name, last_name)
    VALUES (p2, person, 'Petar', 'P') RETURNING id INTO e2;
  INSERT INTO public.project_workers(project_id, worker_id, first_name, last_name)
    VALUES (p3, person, 'Petar', 'P') RETURNING id INTO e3;

  -- račun je član svih triju projekata (uvjet za povezivanje)
  INSERT INTO public.project_members(project_id, user_id) VALUES (p1, acct), (p2, acct), (p3, acct);

  -- PL1: veza prema gore
  UPDATE public.project_workers SET user_id = acct WHERE id = e1;

  PERFORM pg_temp.check('PL1 osoba dobila linked_user_id',
    (SELECT linked_user_id FROM public.workers WHERE id = person) = acct);
  PERFORM pg_temp.check('PL1 svi angažmani povezani',
    (SELECT count(*) FROM public.project_workers WHERE worker_id = person AND user_id = acct) = 3);

  -- PL2: novi angažman nasljeđuje račun
  INSERT INTO public.projects(user_id, name) VALUES (owner_id, 'P4');
  INSERT INTO public.project_members(project_id, user_id)
    VALUES ((SELECT id FROM public.projects WHERE name = 'P4'), acct);
  INSERT INTO public.project_workers(project_id, worker_id, first_name, last_name)
    VALUES ((SELECT id FROM public.projects WHERE name = 'P4'), person, 'Petar', 'P')
    RETURNING id INTO e_new;
  PERFORM pg_temp.check('PL2 novi angažman dobio user_id',
    (SELECT user_id FROM public.project_workers WHERE id = e_new) = acct);

  -- PL3: sukob preskače samo taj projekt
  PERFORM set_config('request.jwt.claim.sub', owner_id::text, true);
  v_res := public.link_person_to_user(person, NULL);
  PERFORM pg_temp.check('PL3 priprema — odvezano',
    (SELECT count(*) FROM public.project_workers WHERE worker_id = person AND user_id IS NOT NULL) = 0);

  -- na P2 taj račun već drži DRUGI radnik
  INSERT INTO public.project_workers(project_id, worker_id, user_id, first_name, last_name)
    VALUES (p2, other_person, acct, 'Ivan', 'I') RETURNING id INTO e_other;

  v_res := public.link_person_to_user(person, acct);
  PERFORM pg_temp.check('PL3 preskočen točno jedan projekt',
    jsonb_array_length(v_res->'skipped_projects') = 1
    AND (v_res->'skipped_projects'->>0)::uuid = p2);
  PERFORM pg_temp.check('PL3 ostali angažmani povezani',
    (SELECT count(*) FROM public.project_workers WHERE worker_id = person AND user_id = acct) = 3);
  PERFORM pg_temp.check('PL3 sukobljeni angažman ostao prazan',
    (SELECT user_id FROM public.project_workers WHERE id = e2) IS NULL);
  PERFORM pg_temp.check('PL3 trag u dijagnostici',
    EXISTS (SELECT 1 FROM public.app_diagnostics_logs
            WHERE event = 'person_link_conflict_skipped'
              AND (details->>'project_id')::uuid = p2));

  -- PL4: odvezivanje
  v_res := public.link_person_to_user(person, NULL);
  PERFORM pg_temp.check('PL4 osoba očišćena',
    (SELECT linked_user_id FROM public.workers WHERE id = person) IS NULL);
  PERFORM pg_temp.check('PL4 svi angažmani očišćeni',
    (SELECT count(*) FROM public.project_workers WHERE worker_id = person AND user_id IS NOT NULL) = 0);
  PERFORM pg_temp.check('PL4 tuđi angažman netaknut',
    (SELECT user_id FROM public.project_workers WHERE id = e_other) = acct);

  -- PL7: račun koji nije član nijednog projekta te osobe
  PERFORM set_config('request.jwt.claim.sub', owner_id::text, true);
  BEGIN
    v_res := public.link_person_to_user(person, stranger);
    PERFORM pg_temp.check('PL7 nečlan odbijen', false);
  EXCEPTION WHEN insufficient_privilege THEN
    PERFORM pg_temp.check('PL7 nečlan odbijen', SQLERRM LIKE '%person_link_user_not_member%');
  END;
  PERFORM pg_temp.check('PL7 ništa nije upisano',
    (SELECT linked_user_id FROM public.workers WHERE id = person) IS NULL
    AND (SELECT count(*) FROM public.project_workers
         WHERE worker_id = person AND user_id = stranger) = 0);

  -- PL8: vlasnik veže sam sebe iako nije u project_members
  v_res := public.link_person_to_user(person, owner_id);
  PERFORM pg_temp.check('PL8 vlasnik smije sam sebe',
    (SELECT linked_user_id FROM public.workers WHERE id = person) = owner_id);
  v_res := public.link_person_to_user(person, NULL);
  PERFORM pg_temp.check('PL8 odvezano nakon vlasnika',
    (SELECT count(*) FROM public.project_workers WHERE worker_id = person AND user_id IS NOT NULL) = 0);

  -- PL5: bez prijave
  PERFORM set_config('request.jwt.claim.sub', '', true);
  BEGIN
    v_res := public.link_person_to_user(person, acct);
    PERFORM pg_temp.check('PL5 bez prijave pada', false);
  EXCEPTION WHEN insufficient_privilege THEN
    PERFORM pg_temp.check('PL5 bez prijave pada', true);
  END;

  -- PL6: tuđa osoba
  PERFORM set_config('request.jwt.claim.sub', acct::text, true);
  BEGIN
    v_res := public.link_person_to_user(person, acct);
    PERFORM pg_temp.check('PL6 tuđa osoba pada', false);
  EXCEPTION WHEN insufficient_privilege THEN
    PERFORM pg_temp.check('PL6 tuđa osoba pada', true);
  END;
END
$t$;
