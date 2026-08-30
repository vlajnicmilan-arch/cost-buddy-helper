-- 1) Anchor: zabilježi trenutak PRVOG prelaska u past_due, očisti kad se vrati u active
CREATE OR REPLACE FUNCTION public._entitlement_stamp_past_due()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.status = 'past_due' THEN
    IF TG_OP = 'UPDATE' AND OLD.status = 'past_due'
       AND (OLD.metadata ->> 'past_due_since') IS NOT NULL THEN
      -- ponovljeni pokušaj: zadrži izvorni trenutak (poček se ne smije nizati)
      NEW.metadata := COALESCE(NEW.metadata, '{}'::jsonb)
        || jsonb_build_object('past_due_since', OLD.metadata ->> 'past_due_since');
    ELSIF (COALESCE(NEW.metadata, '{}'::jsonb) ->> 'past_due_since') IS NULL THEN
      NEW.metadata := COALESCE(NEW.metadata, '{}'::jsonb)
        || jsonb_build_object('past_due_since', to_jsonb(now()));
    END IF;
  ELSIF NEW.status = 'active' THEN
    NEW.metadata := COALESCE(NEW.metadata, '{}'::jsonb) - 'past_due_since';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS entitlement_stamp_past_due ON public.user_entitlements;
CREATE TRIGGER entitlement_stamp_past_due
BEFORE INSERT OR UPDATE ON public.user_entitlements
FOR EACH ROW EXECUTE FUNCTION public._entitlement_stamp_past_due();

-- 2) Jedan izvor istine za poček
CREATE OR REPLACE FUNCTION public.entitlement_in_grace(_status text, _metadata jsonb)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT _status = 'past_due'
     AND (_metadata ->> 'past_due_since') IS NOT NULL
     AND ((_metadata ->> 'past_due_since')::timestamptz + interval '7 days') > now();
$$;

REVOKE ALL ON FUNCTION public.entitlement_in_grace(text, jsonb) FROM anon;

-- 3) has_entitlement: active (kao dosad) ILI past_due unutar počeka
CREATE OR REPLACE FUNCTION public.has_entitlement(_user_id uuid, _module text)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT EXISTS (
    -- Direktan entitlement
    SELECT 1 FROM public.user_entitlements
    WHERE user_id = _user_id
      AND module = _module
      AND (
        (status = 'active' AND (period_end IS NULL OR period_end > now()))
        OR public.entitlement_in_grace(status, metadata)
      )
  ) OR EXISTS (
    -- Legacy mapping preko pro_legacy / business_legacy
    -- NAPOMENA: business_legacy VIŠE NE otključava 'biznis' (odluka 4.8.2026).
    SELECT 1 FROM public.user_entitlements
    WHERE user_id = _user_id
      AND (
        (status = 'active' AND (period_end IS NULL OR period_end > now()))
        OR public.entitlement_in_grace(status, metadata)
      )
      AND (
        (module = 'pro_legacy' AND _module IN ('smjer','krug','projekti'))
        OR (module = 'business_legacy' AND _module IN ('smjer','krug','projekti'))
      )
  ) OR EXISTS (
    -- Admin module grants (legacy sustav)
    SELECT 1 FROM public.admin_module_grants
    WHERE user_id = _user_id
      AND revoked_at IS NULL
      AND (expires_at IS NULL OR expires_at > now())
      AND (
        (module = 'projects' AND _module = 'projekti')
        OR (module = 'business' AND _module = 'biznis')
      )
  );
$function$;

-- 4) has_any_paid_plan: isti poček (da plaćeni korisnik u počeku ne troši besplatnu kvotu)
CREATE OR REPLACE FUNCTION public.has_any_paid_plan(_user_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT
    EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = 'admin')
    OR EXISTS (
      SELECT 1 FROM public.user_subscriptions us
      WHERE us.user_id = _user_id
        AND us.tier IN ('pro','business')
        AND (us.expires_at IS NULL OR us.expires_at > now())
    )
    OR EXISTS (
      SELECT 1 FROM public.admin_module_grants g
      WHERE g.user_id = _user_id
        AND g.revoked_at IS NULL
        AND (g.expires_at IS NULL OR g.expires_at > now())
    )
    OR EXISTS (
      SELECT 1 FROM public.user_entitlements e
      WHERE e.user_id = _user_id
        AND (
          (e.status = 'active' AND (e.period_end IS NULL OR e.period_end > now()))
          OR public.entitlement_in_grace(e.status, e.metadata)
        )
    );
$function$;

-- 5) Backfill: postojeći past_due redci dobivaju sidro (updated_at), bez nizanja
UPDATE public.user_entitlements
SET metadata = COALESCE(metadata, '{}'::jsonb) || jsonb_build_object('past_due_since', to_jsonb(updated_at))
WHERE status = 'past_due'
  AND (metadata ->> 'past_due_since') IS NULL;