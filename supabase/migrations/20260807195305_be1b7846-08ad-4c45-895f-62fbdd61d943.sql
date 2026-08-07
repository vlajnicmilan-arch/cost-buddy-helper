-- =====================================================================
-- Krug pozivnice — pristanak prije članstva.
--
-- Kvar: vlasnik kruga je izravno upisivao redak u krug_membership
-- (edge fn `krug-add-member` + RLS `krug_membership_insert_owner`), pa je
-- bilo tko mogao ubaciti bilo koga u financijski krug bez znanja i pristanka.
--
-- Rješenje (zrcalo `payment_source_invitations`):
--   1) krug_invitations — pozivnica sa statusom i rokom
--   2) accept/decline/revoke SECURITY DEFINER RPC-i
--   3) krug_membership INSERT zaključan: nema klijentske politike, a
--      okidač `krug_require_consent` dopušta redak samo za osnivača kruga
--      ili kad postoji PRIHVAĆENA pozivnica za taj (krug, korisnik) par.
-- =====================================================================

-- 1) Tablica -----------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.krug_invitations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  krug_id uuid NOT NULL REFERENCES public.krug(id) ON DELETE CASCADE,
  email text NOT NULL,
  invited_user_id uuid,
  invited_by uuid NOT NULL,
  role public.krug_membership_role NOT NULL DEFAULT 'obicni',
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'accepted', 'declined', 'expired', 'revoked')),
  token uuid NOT NULL DEFAULT gen_random_uuid(),
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '7 days'),
  used_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS krug_invitations_token_key
  ON public.krug_invitations (token);

-- Jedna aktivna pozivnica po paru (krug, email).
CREATE UNIQUE INDEX IF NOT EXISTS krug_invitations_one_pending
  ON public.krug_invitations (krug_id, lower(email))
  WHERE status = 'pending';

CREATE INDEX IF NOT EXISTS krug_invitations_invited_user_idx
  ON public.krug_invitations (invited_user_id) WHERE status = 'pending';

CREATE INDEX IF NOT EXISTS krug_invitations_krug_idx
  ON public.krug_invitations (krug_id);

GRANT SELECT, INSERT ON public.krug_invitations TO authenticated;
GRANT ALL ON public.krug_invitations TO service_role;

ALTER TABLE public.krug_invitations ENABLE ROW LEVEL SECURITY;

-- Vidi je vlasnik kruga i pozvani.
CREATE POLICY "krug_invitations_select_owner_or_invitee"
  ON public.krug_invitations FOR SELECT TO authenticated
  USING (public.krug_is_owner(krug_id, auth.uid()) OR invited_user_id = auth.uid());

-- Stvara je samo vlasnik kruga, uvijek kao pending i u svoje ime.
CREATE POLICY "krug_invitations_insert_owner"
  ON public.krug_invitations FOR INSERT TO authenticated
  WITH CHECK (
    public.krug_is_owner(krug_id, auth.uid())
    AND invited_by = auth.uid()
    AND status = 'pending'
    AND public.can_write_module(auth.uid(), 'krug')
  );

-- UPDATE/DELETE namjerno nemaju politiku: promjena statusa ide isključivo
-- kroz accept/decline/revoke RPC-e.

CREATE OR REPLACE FUNCTION public.krug_invitations_touch_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS krug_invitations_touch ON public.krug_invitations;
CREATE TRIGGER krug_invitations_touch
  BEFORE UPDATE ON public.krug_invitations
  FOR EACH ROW EXECUTE FUNCTION public.krug_invitations_touch_updated_at();

-- 2) Zaključavanje krug_membership ------------------------------------
DROP POLICY IF EXISTS "krug_membership_insert_owner" ON public.krug_membership;

-- Eksplicitna "nikad" politika: članstvo se ne stvara iz klijenta.
CREATE POLICY "krug_membership_insert_never"
  ON public.krug_membership FOR INSERT TO authenticated
  WITH CHECK (false);

CREATE OR REPLACE FUNCTION public.krug_require_consent()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_creator uuid;
BEGIN
  SELECT created_by INTO v_creator FROM public.krug WHERE id = NEW.krug_id;

  -- Osnivač kruga (bootstrap) — jedini član bez pozivnice.
  IF v_creator IS NOT NULL AND NEW.user_id = v_creator THEN
    RETURN NEW;
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.krug_invitations i
     WHERE i.krug_id = NEW.krug_id
       AND i.invited_user_id = NEW.user_id
       AND i.status = 'accepted'
  ) THEN
    RETURN NEW;
  END IF;

  RAISE EXCEPTION 'krug_membership_requires_invitation: clanstvo u krugu moze nastati samo iz prihvacene pozivnice'
    USING ERRCODE = 'check_violation';
END;
$$;

DROP TRIGGER IF EXISTS krug_membership_require_consent ON public.krug_membership;
CREATE TRIGGER krug_membership_require_consent
  BEFORE INSERT ON public.krug_membership
  FOR EACH ROW EXECUTE FUNCTION public.krug_require_consent();

-- 3) RPC-i -------------------------------------------------------------

-- Prihvat: smije samo pozvani (po id-u ili po tokenu uz podudaran e-mail).
CREATE OR REPLACE FUNCTION public.krug_accept_invitation(
  p_invitation_id uuid DEFAULT NULL,
  p_token uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_email text;
  v_inv public.krug_invitations%ROWTYPE;
BEGIN
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'unauthorized');
  END IF;
  IF p_invitation_id IS NULL AND p_token IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_input');
  END IF;

  SELECT * INTO v_inv FROM public.krug_invitations
   WHERE (p_invitation_id IS NOT NULL AND id = p_invitation_id)
      OR (p_invitation_id IS NULL AND token = p_token)
   FOR UPDATE;

  IF v_inv.id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_found');
  END IF;

  SELECT lower(email) INTO v_email FROM auth.users WHERE id = v_uid;

  IF v_inv.invited_user_id IS DISTINCT FROM v_uid
     AND NOT (v_inv.invited_user_id IS NULL AND v_email IS NOT NULL AND lower(v_inv.email) = v_email)
  THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_invitee');
  END IF;

  IF v_inv.status <> 'pending' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_pending', 'status', v_inv.status);
  END IF;

  IF v_inv.expires_at <= now() THEN
    UPDATE public.krug_invitations SET status = 'expired' WHERE id = v_inv.id;
    RETURN jsonb_build_object('ok', false, 'error', 'expired');
  END IF;

  IF EXISTS (SELECT 1 FROM public.krug_membership
              WHERE krug_id = v_inv.krug_id AND user_id = v_uid) THEN
    UPDATE public.krug_invitations
       SET status = 'accepted', used_at = now(), invited_user_id = v_uid
     WHERE id = v_inv.id;
    RETURN jsonb_build_object('ok', true, 'krug_id', v_inv.krug_id, 'already_member', true);
  END IF;

  -- Pozivnica se prvo označi prihvaćenom: okidač `krug_require_consent`
  -- traži postojeći `accepted` redak prije nego dopusti članstvo.
  UPDATE public.krug_invitations
     SET status = 'accepted', used_at = now(), invited_user_id = v_uid
   WHERE id = v_inv.id;

  BEGIN
    INSERT INTO public.krug_membership (krug_id, user_id, role, added_by)
    VALUES (v_inv.krug_id, v_uid, v_inv.role, v_inv.invited_by);
  EXCEPTION WHEN OTHERS THEN
    -- Cap trigger (krug_punopravni_cap) i sve ostalo: pozivnica ostaje pending.
    UPDATE public.krug_invitations
       SET status = 'pending', used_at = NULL
     WHERE id = v_inv.id;
    IF SQLERRM LIKE '%krug_punopravni_cap%' THEN
      RETURN jsonb_build_object('ok', false, 'error', 'cap_exceeded');
    END IF;
    RETURN jsonb_build_object('ok', false, 'error', 'insert_failed');
  END;

  PERFORM public.krug_emit_notification(
    'krug_invitation_accepted', v_inv.krug_id, v_uid, NULL, NULL,
    'krug_invitation_accepted:' || v_inv.id::text,
    ARRAY[v_inv.invited_by]
  );

  RETURN jsonb_build_object('ok', true, 'krug_id', v_inv.krug_id, 'role', v_inv.role);
END;
$$;

-- Odbijanje: smije samo pozvani.
CREATE OR REPLACE FUNCTION public.krug_decline_invitation(
  p_invitation_id uuid DEFAULT NULL,
  p_token uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_email text;
  v_inv public.krug_invitations%ROWTYPE;
BEGIN
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'unauthorized');
  END IF;

  SELECT * INTO v_inv FROM public.krug_invitations
   WHERE (p_invitation_id IS NOT NULL AND id = p_invitation_id)
      OR (p_invitation_id IS NULL AND token = p_token)
   FOR UPDATE;

  IF v_inv.id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_found');
  END IF;

  SELECT lower(email) INTO v_email FROM auth.users WHERE id = v_uid;

  IF v_inv.invited_user_id IS DISTINCT FROM v_uid
     AND NOT (v_inv.invited_user_id IS NULL AND v_email IS NOT NULL AND lower(v_inv.email) = v_email)
  THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_invitee');
  END IF;

  IF v_inv.status <> 'pending' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_pending', 'status', v_inv.status);
  END IF;

  UPDATE public.krug_invitations
     SET status = 'declined', invited_user_id = v_uid
   WHERE id = v_inv.id;

  PERFORM public.krug_emit_notification(
    'krug_invitation_declined', v_inv.krug_id, v_uid, NULL, NULL,
    'krug_invitation_declined:' || v_inv.id::text,
    ARRAY[v_inv.invited_by]
  );

  RETURN jsonb_build_object('ok', true);
END;
$$;

-- Povlačenje: samo vlasnik kruga, samo dok je pending.
CREATE OR REPLACE FUNCTION public.krug_revoke_invitation(p_invitation_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_inv public.krug_invitations%ROWTYPE;
BEGIN
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'unauthorized');
  END IF;

  SELECT * INTO v_inv FROM public.krug_invitations WHERE id = p_invitation_id FOR UPDATE;
  IF v_inv.id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_found');
  END IF;

  IF NOT public.krug_is_owner(v_inv.krug_id, v_uid) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_owner');
  END IF;

  IF v_inv.status <> 'pending' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_pending', 'status', v_inv.status);
  END IF;

  UPDATE public.krug_invitations SET status = 'revoked' WHERE id = v_inv.id;
  RETURN jsonb_build_object('ok', true);
END;
$$;

-- Označavanje isteklih (idempotentno; poziva ga cron ili čitanje liste).
CREATE OR REPLACE FUNCTION public.krug_expire_invitations()
RETURNS integer
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  WITH upd AS (
    UPDATE public.krug_invitations
       SET status = 'expired'
     WHERE status = 'pending' AND expires_at <= now()
     RETURNING 1
  )
  SELECT count(*)::int FROM upd;
$$;

REVOKE EXECUTE ON FUNCTION public.krug_accept_invitation(uuid, uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.krug_decline_invitation(uuid, uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.krug_revoke_invitation(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.krug_expire_invitations() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.krug_require_consent() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.krug_invitations_touch_updated_at() FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.krug_accept_invitation(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.krug_decline_invitation(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.krug_revoke_invitation(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.krug_expire_invitations() TO service_role;