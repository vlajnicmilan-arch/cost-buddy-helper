
-- =========================================================
-- Admin Module Access (PR1) — Projects + Business
-- =========================================================

-- 1) Enums
CREATE TYPE public.admin_grant_module AS ENUM ('projects', 'business');
CREATE TYPE public.admin_revoke_actor AS ENUM ('admin', 'system');
CREATE TYPE public.admin_grant_reason_code AS ENUM (
  'refund',
  'beta_tester',
  'internal',
  'partner',
  'support',
  'other'
);

-- 2) Tablica
CREATE TABLE public.admin_module_grants (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         uuid NOT NULL,
  module          public.admin_grant_module NOT NULL,
  granted_by      uuid NOT NULL,
  granted_at      timestamptz NOT NULL DEFAULT now(),
  expires_at      timestamptz NULL,
  reason_code     public.admin_grant_reason_code NOT NULL,
  reason_note     text NULL,
  revoked_at      timestamptz NULL,
  revoked_by      uuid NULL,
  revoked_actor   public.admin_revoke_actor NULL,
  revoke_reason   text NULL,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),

  -- reason_note je obavezan samo kad je reason_code = 'other'
  CONSTRAINT admin_module_grants_reason_note_required_for_other
    CHECK (reason_code <> 'other' OR (reason_note IS NOT NULL AND length(btrim(reason_note)) > 0)),

  -- revoked_at <=> revoked_actor (oba ili nijedno)
  CONSTRAINT admin_module_grants_revoke_actor_consistency
    CHECK ((revoked_at IS NULL AND revoked_actor IS NULL) OR (revoked_at IS NOT NULL AND revoked_actor IS NOT NULL)),

  -- ako je opozvan, mora postojati razlog
  CONSTRAINT admin_module_grants_revoke_reason_required
    CHECK (revoked_at IS NULL OR (revoke_reason IS NOT NULL AND length(btrim(revoke_reason)) > 0))
);

-- 3) Partial unique index — samo živi (neopozvani) redovi, immutable predikat
CREATE UNIQUE INDEX admin_module_grants_one_live_per_module
  ON public.admin_module_grants (user_id, module)
  WHERE revoked_at IS NULL;

-- 4) Pomoćni indeksi
CREATE INDEX admin_module_grants_user_id_idx ON public.admin_module_grants (user_id);
CREATE INDEX admin_module_grants_module_idx ON public.admin_module_grants (module);
CREATE INDEX admin_module_grants_granted_at_idx ON public.admin_module_grants (granted_at DESC);

-- 5) GRANTs (RLS je stvarna zaštita)
GRANT SELECT, INSERT, UPDATE ON public.admin_module_grants TO authenticated;
GRANT ALL ON public.admin_module_grants TO service_role;

-- 6) RLS
ALTER TABLE public.admin_module_grants ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can read all grants"
  ON public.admin_module_grants
  FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can insert grants"
  ON public.admin_module_grants
  FOR INSERT
  TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can update grants"
  ON public.admin_module_grants
  FOR UPDATE
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- DELETE namjerno NIJE dopušten (soft revoke only)

-- 7) updated_at trigger
CREATE TRIGGER admin_module_grants_set_updated_at
  BEFORE UPDATE ON public.admin_module_grants
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- =========================================================
-- 8) has_active_module_grant
-- Semantika: revoked_at IS NULL AND (expires_at IS NULL OR expires_at > now())
-- =========================================================
CREATE OR REPLACE FUNCTION public.has_active_module_grant(
  _user_id uuid,
  _module public.admin_grant_module
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.admin_module_grants
    WHERE user_id = _user_id
      AND module = _module
      AND revoked_at IS NULL
      AND (expires_at IS NULL OR expires_at > now())
  );
$$;

GRANT EXECUTE ON FUNCTION public.has_active_module_grant(uuid, public.admin_grant_module)
  TO authenticated, service_role;

-- =========================================================
-- 9) is_projects_subscriber — prošireno s override-om
-- Ne dira billing; aditivno OR.
-- =========================================================
CREATE OR REPLACE FUNCTION public.is_projects_subscriber(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    -- admin bypass
    EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = 'admin')
    OR
    -- aktivna pro/business pretplata
    EXISTS (
      SELECT 1 FROM public.user_subscriptions us
      WHERE us.user_id = _user_id
        AND us.tier IN ('pro','business')
        AND (us.expires_at IS NULL OR us.expires_at > now())
    )
    OR
    -- lifetime kupnja
    EXISTS (SELECT 1 FROM public.lifetime_purchases WHERE user_id = _user_id)
    OR
    -- admin module override (PR1)
    public.has_active_module_grant(_user_id, 'projects'::public.admin_grant_module);
$$;

-- =========================================================
-- 10) RPC grant_module_access
-- Per-module:
--   - SELECT FOR UPDATE postojeći živi red
--   - ako je expired → soft-revoke kao 'auto_superseded_expired' (actor = admin koji radi novi grant)
--   - ako je još aktivan → vrati conflict_active s kontekstom (NEMA overwrite)
--   - INSERT novog reda
-- Vraća jsonb { results: [ { module, status, grant_id?, existing? } ] }
-- =========================================================
CREATE OR REPLACE FUNCTION public.grant_module_access(
  p_user_id     uuid,
  p_modules     public.admin_grant_module[],
  p_expires_at  timestamptz,
  p_reason_code public.admin_grant_reason_code,
  p_reason_note text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
declare
  v_admin uuid := auth.uid();
  v_module public.admin_grant_module;
  v_existing public.admin_module_grants;
  v_new_id uuid;
  v_results jsonb := '[]'::jsonb;
  v_item jsonb;
begin
  -- Auth + admin guard
  if v_admin is null then
    raise exception 'not_authenticated' using errcode = '42501';
  end if;
  if not public.has_role(v_admin, 'admin') then
    raise exception 'not_admin' using errcode = '42501';
  end if;

  -- Input validation
  if p_user_id is null then
    raise exception 'user_id_required' using errcode = '22023';
  end if;
  if p_modules is null or array_length(p_modules, 1) is null then
    raise exception 'modules_required' using errcode = '22023';
  end if;
  if p_reason_code is null then
    raise exception 'reason_code_required' using errcode = '22023';
  end if;
  if p_reason_code = 'other'::public.admin_grant_reason_code
     and (p_reason_note is null or length(btrim(p_reason_note)) = 0) then
    raise exception 'reason_note_required_for_other' using errcode = '22023';
  end if;
  if p_expires_at is not null and p_expires_at <= now() then
    raise exception 'expires_at_must_be_future' using errcode = '22023';
  end if;

  foreach v_module in array p_modules loop
    -- Lock postojeći živi red za (user, module)
    select * into v_existing
    from public.admin_module_grants
    where user_id = p_user_id
      and module = v_module
      and revoked_at is null
    for update;

    if found then
      if v_existing.expires_at is not null and v_existing.expires_at <= now() then
        -- Auto-supersede istekli grant
        update public.admin_module_grants
          set revoked_at    = now(),
              revoked_by    = v_admin,
              revoked_actor = 'admin'::public.admin_revoke_actor,
              revoke_reason = 'auto_superseded_expired'
          where id = v_existing.id;
      else
        -- Aktivan grant postoji → conflict (bez overwrite-a)
        v_item := jsonb_build_object(
          'module', v_module,
          'status', 'conflict_active',
          'existing', jsonb_build_object(
            'id',           v_existing.id,
            'module',       v_existing.module,
            'granted_at',   v_existing.granted_at,
            'expires_at',   v_existing.expires_at,
            'is_permanent', (v_existing.expires_at is null),
            'reason_code',  v_existing.reason_code
          )
        );
        v_results := v_results || v_item;
        continue;
      end if;
    end if;

    -- Insert novog granta
    insert into public.admin_module_grants (
      user_id, module, granted_by, expires_at, reason_code, reason_note
    ) values (
      p_user_id, v_module, v_admin, p_expires_at, p_reason_code,
      case when p_reason_code = 'other'::public.admin_grant_reason_code then p_reason_note else nullif(btrim(coalesce(p_reason_note,'')), '') end
    )
    returning id into v_new_id;

    v_item := jsonb_build_object(
      'module',   v_module,
      'status',   'granted',
      'grant_id', v_new_id
    );
    v_results := v_results || v_item;
  end loop;

  return jsonb_build_object('results', v_results);
end;
$$;

GRANT EXECUTE ON FUNCTION public.grant_module_access(
  uuid, public.admin_grant_module[], timestamptz, public.admin_grant_reason_code, text
) TO authenticated;

-- =========================================================
-- 11) RPC revoke_module_access (soft revoke, obavezan razlog)
-- =========================================================
CREATE OR REPLACE FUNCTION public.revoke_module_access(
  p_grant_id      uuid,
  p_revoke_reason text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
declare
  v_admin uuid := auth.uid();
  v_row   public.admin_module_grants;
begin
  if v_admin is null then
    raise exception 'not_authenticated' using errcode = '42501';
  end if;
  if not public.has_role(v_admin, 'admin') then
    raise exception 'not_admin' using errcode = '42501';
  end if;
  if p_grant_id is null then
    raise exception 'grant_id_required' using errcode = '22023';
  end if;
  if p_revoke_reason is null or length(btrim(p_revoke_reason)) = 0 then
    raise exception 'revoke_reason_required' using errcode = '22023';
  end if;

  select * into v_row
  from public.admin_module_grants
  where id = p_grant_id
  for update;

  if not found then
    raise exception 'grant_not_found' using errcode = 'P0002';
  end if;
  if v_row.revoked_at is not null then
    raise exception 'grant_already_revoked' using errcode = '22023';
  end if;

  update public.admin_module_grants
    set revoked_at    = now(),
        revoked_by    = v_admin,
        revoked_actor = 'admin'::public.admin_revoke_actor,
        revoke_reason = btrim(p_revoke_reason)
    where id = p_grant_id;

  return jsonb_build_object('status', 'revoked', 'grant_id', p_grant_id);
end;
$$;

GRANT EXECUTE ON FUNCTION public.revoke_module_access(uuid, text) TO authenticated;
