-- Krug 2/2 — arhiva samo za citanje.
--
-- Ocekivanje:
--   * normalan Krug: sva pisanja prolaze
--   * arhivirani Krug (lifecycle_state='read_only'): svako pisanje sadrzaja pada (42501)
--   * prijelaz stanja (lifecycle_state / deleted_at) na samom krugu je dopusten
--   * zapis o vlasnistvu (krug_ownership) prezivi arhiviranje
--   * brisanje cijele arhive prolazi i kaskadno cisti djecu
--
-- Pokretanje: psql -v ON_ERROR_STOP=1 -f archive_readonly.sql
-- (unutar Krug harnessa; vidi run.sh). Transakcija se na kraju rollbacka.

BEGIN;

DO $$
DECLARE
  k uuid; k2 uuid; ok text := '';
  u1 uuid := '00000000-0000-0000-0000-0000000000a1';
  u2 uuid := '00000000-0000-0000-0000-0000000000a2';
BEGIN
  INSERT INTO public.krug(name, preset, created_by) VALUES ('archive_test','partner',u1) RETURNING id INTO k;
  INSERT INTO public.krug_income_ratio(krug_id,user_id,weight) VALUES (k,u1,1);
  INSERT INTO public.krug_settlement_ledger(krug_id,from_user,to_user,amount,currency,marked_by)
    VALUES (k,u1,u2,10,'EUR',u1);
  ok := ok || 'normal_writes_ok;';

  UPDATE public.krug SET lifecycle_state='read_only' WHERE id=k;
  ok := ok || 'archive_ok;';

  BEGIN UPDATE public.krug_membership SET role='obicni' WHERE krug_id=k;
        ok := ok || 'FAIL_membership_update;';
  EXCEPTION WHEN insufficient_privilege THEN ok := ok || 'blocked_membership_update;'; END;

  BEGIN DELETE FROM public.krug_membership WHERE krug_id=k;
        ok := ok || 'FAIL_membership_delete;';
  EXCEPTION WHEN insufficient_privilege THEN ok := ok || 'blocked_membership_delete;'; END;

  BEGIN UPDATE public.krug_income_ratio SET weight=2 WHERE krug_id=k;
        ok := ok || 'FAIL_ratio;';
  EXCEPTION WHEN insufficient_privilege THEN ok := ok || 'blocked_ratio;'; END;

  BEGIN UPDATE public.krug_settlement_ledger SET amount=99 WHERE krug_id=k;
        ok := ok || 'FAIL_ledger;';
  EXCEPTION WHEN insufficient_privilege THEN ok := ok || 'blocked_ledger;'; END;

  BEGIN DELETE FROM public.krug_ownership WHERE krug_id=k;
        ok := ok || 'FAIL_ownership;';
  EXCEPTION WHEN insufficient_privilege THEN ok := ok || 'blocked_ownership;'; END;

  BEGIN INSERT INTO public.krug_invitations(krug_id,email,invited_by,role,status,token,expires_at)
        VALUES (k,'x@y.z',u1,'obicni','pending',gen_random_uuid(), now()+interval '1 day');
        ok := ok || 'FAIL_invite;';
  EXCEPTION WHEN insufficient_privilege THEN ok := ok || 'blocked_invite;'; END;

  BEGIN UPDATE public.krug SET name='hacked' WHERE id=k;
        ok := ok || 'FAIL_rename;';
  EXCEPTION WHEN insufficient_privilege THEN ok := ok || 'blocked_rename;'; END;

  UPDATE public.krug SET deleted_at=now(), lifecycle_state='deleted' WHERE id=k;
  ok := ok || 'softdelete_ok;';
  UPDATE public.krug SET deleted_at=NULL, lifecycle_state='read_only' WHERE id=k;

  IF EXISTS (SELECT 1 FROM public.krug_ownership WHERE krug_id=k) THEN ok := ok || 'ownership_survived;'; END IF;

  DELETE FROM public.krug WHERE id=k;
  ok := ok || 'hard_delete_ok;';
  IF NOT EXISTS (SELECT 1 FROM public.krug_membership WHERE krug_id=k)
     AND NOT EXISTS (SELECT 1 FROM public.krug_settlement_ledger WHERE krug_id=k)
  THEN ok := ok || 'cascade_ok;'; END IF;

  INSERT INTO public.krug(name, preset, created_by) VALUES ('normal','partner',u1) RETURNING id INTO k2;
  UPDATE public.krug SET name='normal2' WHERE id=k2;
  UPDATE public.krug_membership SET role='obicni' WHERE krug_id=k2;
  DELETE FROM public.krug_membership WHERE krug_id=k2;
  DELETE FROM public.krug WHERE id=k2;
  ok := ok || 'normal_untouched_ok;';

  IF ok LIKE '%FAIL_%' THEN
    RAISE EXCEPTION 'ARCHIVE READONLY FAIL: %', ok;
  END IF;
  RAISE NOTICE 'ARCHIVE READONLY PASS: %', ok;
END $$;

ROLLBACK;
