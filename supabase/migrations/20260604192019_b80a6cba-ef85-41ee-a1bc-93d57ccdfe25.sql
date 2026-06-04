-- T6: Transaction visibility RLS dopuna (Implementation Sprint v1.1)

CREATE OR REPLACE FUNCTION public.krug_can_see_personal(_krug uuid, _viewer uuid, _author uuid)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _preset public.krug_preset;
BEGIN
  -- Autor uvijek vidi vlastiti zapis (defenzivno; postojeća policy ionako pokriva).
  IF _viewer = _author THEN
    RETURN true;
  END IF;

  -- Viewer mora biti član Kruga (uključuje ownera, isključuje soft-deletan krug osim za ownera).
  IF NOT public.krug_is_member(_krug, _viewer) THEN
    RETURN false;
  END IF;

  SELECT preset INTO _preset FROM public.krug WHERE id = _krug;
  IF _preset IS NULL THEN
    RETURN false;
  END IF;

  -- Per-preset grane (Implementation Sprint v1.1 skeleton odluka):
  -- U v1 svi zaključani presetovi izlažu 'personal' svim članovima.
  -- Kasnije se pojedine grane mogu pooštriti bez diranja RLS policy-ja.
  RETURN CASE _preset
    WHEN 'partner'      THEN true
    WHEN 'su_roditelj'  THEN true
    WHEN 'cimer'        THEN true
    WHEN 'putovanje'    THEN true
    WHEN 'projekt'      THEN true
    WHEN 'klub'         THEN true
    ELSE false
  END;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.krug_can_see_personal(uuid, uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.krug_can_see_personal(uuid, uuid, uuid) TO authenticated, service_role;

-- Permissive policy: OR-uje s postojećima. Djeluje samo na Krug-bound retke.
CREATE POLICY "krug_select_visibility"
  ON public.expenses FOR SELECT TO authenticated
  USING (
    krug_id IS NOT NULL
    AND public.krug_is_member(krug_id, auth.uid())
    AND (
      krug_privacy = 'shared'::public.krug_privacy
      OR (
        krug_privacy = 'personal'::public.krug_privacy
        AND public.krug_can_see_personal(krug_id, auth.uid(), user_id)
      )
      -- 'private' grana intencionalno izostavljena: autor je vidi kroz postojeću policy,
      -- nitko drugi je ne smije vidjeti, čak ni owner.
    )
  );
