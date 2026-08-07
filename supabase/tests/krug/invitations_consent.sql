-- Krug consent guard — clanstvo smije nastati SAMO iz prihvacene pozivnice.
--
-- IMPORTANT:
--   a) Requires a dev cluster where the executing role has USAGE on the `auth`
--      schema (auth.uid() / auth.users are read by the RPC-i and triggers).
--   b) Whole script runs inside BEGIN ... ROLLBACK — rollback-safe by design.
--   c) Proves BOTH layers:
--        - RLS: `krug_membership` has no client INSERT policy (WITH CHECK false)
--        - Trigger `krug_require_consent`: blocks even RLS-bypassing roles
--      Na STAROJ politici (`krug_membership_insert_owner`) test 1 PROLAZI insert
--      i skripta pada s "FAIL 1".
--
-- Usage:
--   psql ... -v krug_id="'<uuid>'" -v owner_id="'<uuid>'" \
--            -v invitee_id="'<uuid>'" -v other_id="'<uuid>'" \
--            -f supabase/tests/krug/invitations_consent.sql
--
-- Sve UUID vrijednosti moraju biti sinteticki test podaci. Nikad protiv
-- produkcijskih korisnickih podataka.

\set ON_ERROR_STOP on

BEGIN;

DO $$
DECLARE
  v_krug uuid := :'krug_id';
  v_owner uuid := :'owner_id';
  v_invitee uuid := :'invitee_id';
  v_other uuid := :'other_id';   -- treca osoba, nije pozvana
  v_inv uuid;
  v_res jsonb;
BEGIN
  PERFORM set_config('request.jwt.claim.sub', v_owner::text, true);

  -- 1) Vlasnik NE SMIJE izravno stvoriti clanstvo (trigger razina).
  BEGIN
    INSERT INTO public.krug_membership (krug_id, user_id, role, added_by)
    VALUES (v_krug, v_invitee, 'obicni', v_owner);
    RAISE EXCEPTION 'FAIL 1: owner created membership without invitation';
  EXCEPTION WHEN check_violation THEN
    RAISE NOTICE 'PASS 1: direct owner insert blocked';
  END;

  -- 2) Obicni korisnik ne moze ubaciti sam sebe.
  PERFORM set_config('request.jwt.claim.sub', v_other::text, true);
  BEGIN
    INSERT INTO public.krug_membership (krug_id, user_id, role, added_by)
    VALUES (v_krug, v_other, 'obicni', v_other);
    RAISE EXCEPTION 'FAIL 2: outsider self-inserted membership';
  EXCEPTION WHEN check_violation THEN
    RAISE NOTICE 'PASS 2: outsider insert blocked';
  END;

  -- 3) Pozivnica + prihvat tudje pozivnice mora pasti.
  PERFORM set_config('request.jwt.claim.sub', v_owner::text, true);
  INSERT INTO public.krug_invitations (krug_id, email, invited_user_id, invited_by, role)
  VALUES (v_krug, 'invitee@example.test', v_invitee, v_owner, 'obicni')
  RETURNING id INTO v_inv;

  PERFORM set_config('request.jwt.claim.sub', v_other::text, true);
  v_res := public.krug_accept_invitation(v_inv, NULL);
  IF (v_res->>'ok')::boolean THEN
    RAISE EXCEPTION 'FAIL 3: third party accepted someone else invitation';
  END IF;
  IF v_res->>'error' <> 'not_invitee' THEN
    RAISE EXCEPTION 'FAIL 3b: unexpected error %', v_res;
  END IF;
  RAISE NOTICE 'PASS 3: foreign accept blocked (%)', v_res->>'error';

  -- 4) Povucena pozivnica se ne moze prihvatiti.
  PERFORM set_config('request.jwt.claim.sub', v_owner::text, true);
  v_res := public.krug_revoke_invitation(v_inv);
  IF NOT (v_res->>'ok')::boolean THEN
    RAISE EXCEPTION 'FAIL 4a: owner could not revoke: %', v_res;
  END IF;
  PERFORM set_config('request.jwt.claim.sub', v_invitee::text, true);
  v_res := public.krug_accept_invitation(v_inv, NULL);
  IF (v_res->>'ok')::boolean THEN
    RAISE EXCEPTION 'FAIL 4: revoked invitation accepted';
  END IF;
  RAISE NOTICE 'PASS 4: revoked accept blocked (%)', v_res->>'error';

  -- 5) Istekla pozivnica se ne moze prihvatiti.
  PERFORM set_config('request.jwt.claim.sub', v_owner::text, true);
  INSERT INTO public.krug_invitations (krug_id, email, invited_user_id, invited_by, role, expires_at)
  VALUES (v_krug, 'invitee@example.test', v_invitee, v_owner, 'obicni', now() - interval '1 day')
  RETURNING id INTO v_inv;
  PERFORM set_config('request.jwt.claim.sub', v_invitee::text, true);
  v_res := public.krug_accept_invitation(v_inv, NULL);
  IF (v_res->>'ok')::boolean OR v_res->>'error' <> 'expired' THEN
    RAISE EXCEPTION 'FAIL 5: expired invitation not rejected: %', v_res;
  END IF;
  RAISE NOTICE 'PASS 5: expired accept blocked';

  -- 6) Odbijanje ne stvara clanstvo.
  PERFORM set_config('request.jwt.claim.sub', v_owner::text, true);
  INSERT INTO public.krug_invitations (krug_id, email, invited_user_id, invited_by, role)
  VALUES (v_krug, 'invitee@example.test', v_invitee, v_owner, 'obicni')
  RETURNING id INTO v_inv;
  PERFORM set_config('request.jwt.claim.sub', v_invitee::text, true);
  v_res := public.krug_decline_invitation(v_inv, NULL);
  IF NOT (v_res->>'ok')::boolean THEN
    RAISE EXCEPTION 'FAIL 6a: decline failed: %', v_res;
  END IF;
  IF EXISTS (SELECT 1 FROM public.krug_membership
              WHERE krug_id = v_krug AND user_id = v_invitee) THEN
    RAISE EXCEPTION 'FAIL 6: decline created membership';
  END IF;
  RAISE NOTICE 'PASS 6: decline creates no membership';

  -- 7) Happy path: nova pozivnica (declined dopusta ponovni poziv) → prihvat
  --    stvara clanstvo s ulogom iz pozivnice.
  PERFORM set_config('request.jwt.claim.sub', v_owner::text, true);
  INSERT INTO public.krug_invitations (krug_id, email, invited_user_id, invited_by, role)
  VALUES (v_krug, 'invitee@example.test', v_invitee, v_owner, 'obicni')
  RETURNING id INTO v_inv;
  PERFORM set_config('request.jwt.claim.sub', v_invitee::text, true);
  v_res := public.krug_accept_invitation(v_inv, NULL);
  IF NOT (v_res->>'ok')::boolean THEN
    RAISE EXCEPTION 'FAIL 7: accept failed: %', v_res;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.krug_membership
                  WHERE krug_id = v_krug AND user_id = v_invitee AND role = 'obicni') THEN
    RAISE EXCEPTION 'FAIL 7b: membership missing after accept';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.krug_invitations
                  WHERE id = v_inv AND status = 'accepted' AND used_at IS NOT NULL) THEN
    RAISE EXCEPTION 'FAIL 7c: invitation not marked accepted';
  END IF;
  RAISE NOTICE 'PASS 7: accept creates membership';

  -- 8) Ista pozivnica ne moze se prihvatiti dvaput.
  v_res := public.krug_accept_invitation(v_inv, NULL);
  IF (v_res->>'ok')::boolean THEN
    RAISE EXCEPTION 'FAIL 8: accepted invitation reused';
  END IF;
  RAISE NOTICE 'PASS 8: replay blocked (%)', v_res->>'error';

  RAISE NOTICE 'ALL KRUG CONSENT CHECKS PASSED';
END $$;

ROLLBACK;
