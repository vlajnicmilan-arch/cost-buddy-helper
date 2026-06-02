
-- =========================================================
-- PR1: Module Access Model v2
-- =========================================================
-- NAPOMENA: trial NIJE podržan u is_projects_subscriber dok se ne uvede
-- pravi DB source-of-truth. Tier = pro/business ili lifetime/admin.
-- =========================================================

-- 1) Helper: is_projects_subscriber
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
    -- aktivna pro/business pretplata (expires_at NULL = doživotna dodjela, ili u budućnosti)
    EXISTS (
      SELECT 1 FROM public.user_subscriptions us
      WHERE us.user_id = _user_id
        AND us.tier IN ('pro','business')
        AND (us.expires_at IS NULL OR us.expires_at > now())
    )
    OR
    -- lifetime kupnja
    EXISTS (SELECT 1 FROM public.lifetime_purchases WHERE user_id = _user_id);
$$;

GRANT EXECUTE ON FUNCTION public.is_projects_subscriber(uuid) TO authenticated, service_role;

-- =========================================================
-- 2) RESTRICTIVE RLS policies: block writes for downgrade owners
-- =========================================================
-- Logika: ako je current user owner relevantnog projekta (direktno ili preko
-- projects.user_id), MORA biti subscriber. Participant pristup ostaje
-- netaknut (RESTRICTIVE provjera vrijedi samo na ownerskim redovima).

-- projects (user_id direktno)
CREATE POLICY "projects_readonly_when_downgraded"
  ON public.projects
  AS RESTRICTIVE
  FOR ALL
  TO authenticated
  USING (
    user_id <> auth.uid()
    OR public.is_projects_subscriber(auth.uid())
  )
  WITH CHECK (
    user_id <> auth.uid()
    OR public.is_projects_subscriber(auth.uid())
  );

-- project_invoices (user_id direktno)
CREATE POLICY "project_invoices_readonly_when_downgraded"
  ON public.project_invoices
  AS RESTRICTIVE
  FOR ALL
  TO authenticated
  USING (
    user_id <> auth.uid()
    OR public.is_projects_subscriber(auth.uid())
  )
  WITH CHECK (
    user_id <> auth.uid()
    OR public.is_projects_subscriber(auth.uid())
  );

-- project_estimates (user_id direktno)
CREATE POLICY "project_estimates_readonly_when_downgraded"
  ON public.project_estimates
  AS RESTRICTIVE
  FOR ALL
  TO authenticated
  USING (
    user_id <> auth.uid()
    OR public.is_projects_subscriber(auth.uid())
  )
  WITH CHECK (
    user_id <> auth.uid()
    OR public.is_projects_subscriber(auth.uid())
  );

-- project_milestones (preko project_id)
CREATE POLICY "project_milestones_readonly_when_downgraded"
  ON public.project_milestones
  AS RESTRICTIVE
  FOR ALL
  TO authenticated
  USING (
    NOT EXISTS (
      SELECT 1 FROM public.projects p
      WHERE p.id = project_milestones.project_id AND p.user_id = auth.uid()
    )
    OR public.is_projects_subscriber(auth.uid())
  )
  WITH CHECK (
    NOT EXISTS (
      SELECT 1 FROM public.projects p
      WHERE p.id = project_milestones.project_id AND p.user_id = auth.uid()
    )
    OR public.is_projects_subscriber(auth.uid())
  );

-- project_funding (preko project_id)
CREATE POLICY "project_funding_readonly_when_downgraded"
  ON public.project_funding
  AS RESTRICTIVE
  FOR ALL
  TO authenticated
  USING (
    NOT EXISTS (
      SELECT 1 FROM public.projects p
      WHERE p.id = project_funding.project_id AND p.user_id = auth.uid()
    )
    OR public.is_projects_subscriber(auth.uid())
  )
  WITH CHECK (
    NOT EXISTS (
      SELECT 1 FROM public.projects p
      WHERE p.id = project_funding.project_id AND p.user_id = auth.uid()
    )
    OR public.is_projects_subscriber(auth.uid())
  );

-- project_documents (preko project_id)
CREATE POLICY "project_documents_readonly_when_downgraded"
  ON public.project_documents
  AS RESTRICTIVE
  FOR ALL
  TO authenticated
  USING (
    NOT EXISTS (
      SELECT 1 FROM public.projects p
      WHERE p.id = project_documents.project_id AND p.user_id = auth.uid()
    )
    OR public.is_projects_subscriber(auth.uid())
  )
  WITH CHECK (
    NOT EXISTS (
      SELECT 1 FROM public.projects p
      WHERE p.id = project_documents.project_id AND p.user_id = auth.uid()
    )
    OR public.is_projects_subscriber(auth.uid())
  );

-- =========================================================
-- 3) Patch soft_delete_record: block project domenu za downgrade ownera
-- =========================================================
CREATE OR REPLACE FUNCTION public.soft_delete_record(p_table text, p_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
declare
  v_uid uuid := auth.uid();
  v_sql text;
  v_is_admin boolean;
  v_is_subscriber boolean;
begin
  if v_uid is null then
    raise exception 'not_authenticated';
  end if;
  if p_table not in ('expenses','projects','project_invoices','project_estimates','project_milestones') then
    raise exception 'invalid_table: %', p_table;
  end if;

  -- Read-only gate za project domenu (downgrade owner)
  if p_table in ('projects','project_invoices','project_estimates','project_milestones') then
    select exists (select 1 from public.user_roles where user_id = v_uid and role = 'admin')
      into v_is_admin;
    if not v_is_admin then
      v_is_subscriber := public.is_projects_subscriber(v_uid);
      if not v_is_subscriber then
        raise exception 'projects_readonly' using errcode = '42501';
      end if;
    end if;
  end if;

  v_sql := format(
    'update public.%I set deleted_at = now(), deleted_by = $1
       where id = $2 and deleted_at is null
         and (user_id = $1 or exists (
           select 1 from public.user_roles ur where ur.user_id = $1 and ur.role = ''admin''
         ))',
    p_table
  );
  execute v_sql using v_uid, p_id;
end;
$function$;

-- =========================================================
-- 4) Restore / purge: blokiraj project domenu za downgrade ownera
-- =========================================================
-- Wrap postojeće restore_trash_item i purge_trash_item idempotentno.
-- (Stvarne implementacije ostaju, samo dodajemo gate prije poziva.)

CREATE OR REPLACE FUNCTION public.assert_projects_write_allowed()
RETURNS void
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    raise exception 'not_authenticated';
  end if;
  if exists (select 1 from public.user_roles where user_id = v_uid and role = 'admin') then
    return;
  end if;
  if not public.is_projects_subscriber(v_uid) then
    raise exception 'projects_readonly' using errcode = '42501';
  end if;
end;
$$;

GRANT EXECUTE ON FUNCTION public.assert_projects_write_allowed() TO authenticated, service_role;

-- =========================================================
-- 5) core_scan_usage + RPC-evi (globalna kvota: 3 / 30 dana)
-- =========================================================
CREATE TABLE public.core_scan_usage (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  count integer NOT NULL DEFAULT 0,
  window_start timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.core_scan_usage TO authenticated;
GRANT ALL ON public.core_scan_usage TO service_role;

ALTER TABLE public.core_scan_usage ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users read own scan usage"
  ON public.core_scan_usage
  FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

-- Helper: je li korisnik na nekom plaćenom planu (bilo kojem) → unlimited skenovi
CREATE OR REPLACE FUNCTION public.has_any_paid_plan(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = 'admin')
    OR EXISTS (
      SELECT 1 FROM public.user_subscriptions us
      WHERE us.user_id = _user_id
        AND us.tier IN ('pro','business')
        AND (us.expires_at IS NULL OR us.expires_at > now())
    )
    OR EXISTS (SELECT 1 FROM public.lifetime_purchases WHERE user_id = _user_id);
$$;

GRANT EXECUTE ON FUNCTION public.has_any_paid_plan(uuid) TO authenticated, service_role;

-- consume: vraća jsonb { allowed, unlimited?, remaining?, reset_at?, count? }
CREATE OR REPLACE FUNCTION public.consume_core_scan_quota()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
declare
  v_uid uuid := auth.uid();
  v_limit integer := 3;
  v_window interval := interval '30 days';
  v_row public.core_scan_usage;
  v_now timestamptz := now();
  v_profile_created timestamptz;
  v_initial_window timestamptz;
begin
  if v_uid is null then
    raise exception 'not_authenticated';
  end if;

  if public.has_any_paid_plan(v_uid) then
    return jsonb_build_object('allowed', true, 'unlimited', true);
  end if;

  select created_at into v_profile_created from public.profiles where user_id = v_uid;
  v_initial_window := greatest(coalesce(v_profile_created, v_now), v_now - v_window);

  insert into public.core_scan_usage (user_id, count, window_start, updated_at)
  values (v_uid, 0, v_initial_window, v_now)
  on conflict (user_id) do nothing;

  select * into v_row from public.core_scan_usage where user_id = v_uid for update;

  -- rollover
  if v_row.window_start < v_now - v_window then
    update public.core_scan_usage
       set count = 0, window_start = v_now, updated_at = v_now
     where user_id = v_uid
     returning * into v_row;
  end if;

  if v_row.count >= v_limit then
    return jsonb_build_object(
      'allowed', false,
      'remaining', 0,
      'count', v_row.count,
      'reset_at', v_row.window_start + v_window
    );
  end if;

  update public.core_scan_usage
     set count = count + 1, updated_at = v_now
   where user_id = v_uid
   returning * into v_row;

  return jsonb_build_object(
    'allowed', true,
    'remaining', greatest(v_limit - v_row.count, 0),
    'count', v_row.count,
    'reset_at', v_row.window_start + v_window
  );
end;
$$;

GRANT EXECUTE ON FUNCTION public.consume_core_scan_quota() TO authenticated, service_role;

-- refund: dekrement (min 0). Bez rollovera.
CREATE OR REPLACE FUNCTION public.refund_core_scan_quota()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    raise exception 'not_authenticated';
  end if;
  if public.has_any_paid_plan(v_uid) then
    return;
  end if;
  update public.core_scan_usage
     set count = greatest(count - 1, 0), updated_at = now()
   where user_id = v_uid;
end;
$$;

GRANT EXECUTE ON FUNCTION public.refund_core_scan_quota() TO authenticated, service_role;

-- peek: read-only, vraća stanje (i unlimited:true za paid)
CREATE OR REPLACE FUNCTION public.peek_core_scan_quota()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
declare
  v_uid uuid := auth.uid();
  v_limit integer := 3;
  v_window interval := interval '30 days';
  v_row public.core_scan_usage;
  v_now timestamptz := now();
  v_effective_count integer;
  v_effective_window_start timestamptz;
begin
  if v_uid is null then
    raise exception 'not_authenticated';
  end if;

  if public.has_any_paid_plan(v_uid) then
    return jsonb_build_object('unlimited', true);
  end if;

  select * into v_row from public.core_scan_usage where user_id = v_uid;
  if not found then
    return jsonb_build_object(
      'unlimited', false,
      'remaining', v_limit,
      'count', 0,
      'reset_at', v_now + v_window
    );
  end if;

  if v_row.window_start < v_now - v_window then
    v_effective_count := 0;
    v_effective_window_start := v_now;
  else
    v_effective_count := v_row.count;
    v_effective_window_start := v_row.window_start;
  end if;

  return jsonb_build_object(
    'unlimited', false,
    'remaining', greatest(v_limit - v_effective_count, 0),
    'count', v_effective_count,
    'reset_at', v_effective_window_start + v_window
  );
end;
$$;

GRANT EXECUTE ON FUNCTION public.peek_core_scan_quota() TO authenticated, service_role;

-- =========================================================
-- 6) participant_digest_state + enqueue funkcija
-- =========================================================
CREATE TABLE public.participant_digest_state (
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  pending_count integer NOT NULL DEFAULT 0,
  pending_summary jsonb NOT NULL DEFAULT '[]'::jsonb,
  last_event_at timestamptz,
  last_sent_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, project_id)
);

CREATE INDEX idx_participant_digest_due
  ON public.participant_digest_state (last_event_at)
  WHERE last_event_at IS NOT NULL;

GRANT SELECT ON public.participant_digest_state TO authenticated;
GRANT ALL ON public.participant_digest_state TO service_role;

ALTER TABLE public.participant_digest_state ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users read own digest state"
  ON public.participant_digest_state
  FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

-- enqueue_participant_digest_event: append event za sve primatelje u prostoru, osim actora
CREATE OR REPLACE FUNCTION public.enqueue_participant_digest_event(
  p_project_id uuid,
  p_actor_user_id uuid,
  p_event jsonb
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
declare
  v_owner uuid;
  v_now timestamptz := now();
  v_recipients uuid[];
begin
  if p_project_id is null or p_actor_user_id is null then
    raise exception 'invalid_args';
  end if;

  select user_id into v_owner from public.projects where id = p_project_id;
  if v_owner is null then
    return;
  end if;

  -- skupi primatelje: owner + project_members (svi role-evi), bez actora i bez duplikata
  with recipients as (
    select v_owner as uid
    union
    select pm.user_id from public.project_members pm where pm.project_id = p_project_id
  )
  select array_agg(distinct uid) into v_recipients
  from recipients
  where uid is not null and uid <> p_actor_user_id;

  if v_recipients is null then
    return;
  end if;

  insert into public.participant_digest_state (
    user_id, project_id, pending_count, pending_summary, last_event_at, updated_at
  )
  select uid, p_project_id, 1, jsonb_build_array(p_event), v_now, v_now
  from unnest(v_recipients) as uid
  on conflict (user_id, project_id) do update
    set pending_count = participant_digest_state.pending_count + 1,
        pending_summary = participant_digest_state.pending_summary || excluded.pending_summary,
        last_event_at = v_now,
        updated_at = v_now;
end;
$$;

GRANT EXECUTE ON FUNCTION public.enqueue_participant_digest_event(uuid, uuid, jsonb)
  TO authenticated, service_role;
