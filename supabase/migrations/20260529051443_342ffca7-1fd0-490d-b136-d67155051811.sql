
-- Auto-grant Limited payment-source access to family members
-- when a payment source is shared with a family group.

-- 1) Trigger: on family_shared_sources INSERT → upsert 'limited' for all current family members
CREATE OR REPLACE FUNCTION public.fss_grant_limited_on_share()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_owner uuid;
BEGIN
  SELECT user_id INTO v_owner FROM public.custom_payment_sources WHERE id = NEW.payment_source_id;

  INSERT INTO public.payment_source_members (payment_source_id, user_id, role)
  SELECT NEW.payment_source_id, fm.user_id, 'limited'
  FROM public.family_members fm
  WHERE fm.group_id = NEW.group_id
    AND fm.user_id <> COALESCE(v_owner, '00000000-0000-0000-0000-000000000000'::uuid)
  ON CONFLICT DO NOTHING;

  RETURN NEW;
END;
$$;

-- 2) Trigger: on family_shared_sources DELETE → remove only 'limited' members granted via family
CREATE OR REPLACE FUNCTION public.fss_revoke_limited_on_unshare()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  DELETE FROM public.payment_source_members psm
  WHERE psm.payment_source_id = OLD.payment_source_id
    AND psm.role = 'limited'
    AND psm.user_id IN (
      SELECT fm.user_id FROM public.family_members fm WHERE fm.group_id = OLD.group_id
    )
    -- only revoke if not still shared via another group containing this user
    AND NOT EXISTS (
      SELECT 1
      FROM public.family_shared_sources fss
      JOIN public.family_members fm2
        ON fm2.group_id = fss.group_id AND fm2.user_id = psm.user_id
      WHERE fss.payment_source_id = OLD.payment_source_id
        AND fss.group_id <> OLD.group_id
    );
  RETURN OLD;
END;
$$;

-- 3) Trigger: on family_members INSERT → grant 'limited' for all sources shared with that group
CREATE OR REPLACE FUNCTION public.fm_grant_limited_on_join()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.payment_source_members (payment_source_id, user_id, role)
  SELECT fss.payment_source_id, NEW.user_id, 'limited'
  FROM public.family_shared_sources fss
  JOIN public.custom_payment_sources cps ON cps.id = fss.payment_source_id
  WHERE fss.group_id = NEW.group_id
    AND cps.user_id <> NEW.user_id
  ON CONFLICT DO NOTHING;

  RETURN NEW;
END;
$$;

-- 4) Trigger: on family_members DELETE → revoke 'limited' for sources shared via that group
CREATE OR REPLACE FUNCTION public.fm_revoke_limited_on_leave()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  DELETE FROM public.payment_source_members psm
  WHERE psm.user_id = OLD.user_id
    AND psm.role = 'limited'
    AND psm.payment_source_id IN (
      SELECT payment_source_id FROM public.family_shared_sources WHERE group_id = OLD.group_id
    )
    AND NOT EXISTS (
      SELECT 1
      FROM public.family_shared_sources fss
      JOIN public.family_members fm2
        ON fm2.group_id = fss.group_id AND fm2.user_id = OLD.user_id
      WHERE fss.payment_source_id = psm.payment_source_id
        AND fss.group_id <> OLD.group_id
    );
  RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS trg_fss_grant_limited ON public.family_shared_sources;
CREATE TRIGGER trg_fss_grant_limited
AFTER INSERT ON public.family_shared_sources
FOR EACH ROW EXECUTE FUNCTION public.fss_grant_limited_on_share();

DROP TRIGGER IF EXISTS trg_fss_revoke_limited ON public.family_shared_sources;
CREATE TRIGGER trg_fss_revoke_limited
AFTER DELETE ON public.family_shared_sources
FOR EACH ROW EXECUTE FUNCTION public.fss_revoke_limited_on_unshare();

DROP TRIGGER IF EXISTS trg_fm_grant_limited ON public.family_members;
CREATE TRIGGER trg_fm_grant_limited
AFTER INSERT ON public.family_members
FOR EACH ROW EXECUTE FUNCTION public.fm_grant_limited_on_join();

DROP TRIGGER IF EXISTS trg_fm_revoke_limited ON public.family_members;
CREATE TRIGGER trg_fm_revoke_limited
AFTER DELETE ON public.family_members
FOR EACH ROW EXECUTE FUNCTION public.fm_revoke_limited_on_leave();

-- 5) Backfill: for every existing family_shared_sources × family_members combo,
--    upsert 'limited' membership (skip source owners and pre-existing memberships).
INSERT INTO public.payment_source_members (payment_source_id, user_id, role)
SELECT fss.payment_source_id, fm.user_id, 'limited'
FROM public.family_shared_sources fss
JOIN public.family_members fm ON fm.group_id = fss.group_id
JOIN public.custom_payment_sources cps ON cps.id = fss.payment_source_id
WHERE cps.user_id <> fm.user_id
ON CONFLICT DO NOTHING;
