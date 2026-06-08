
-- 1) Drop 3 orphan limited rows that came from family auto-sync
DELETE FROM public.payment_source_members WHERE role = 'limited';

-- 2) Drop triggers explicitly (CASCADE on tables will cover them, but explicit for clarity)
DROP TRIGGER IF EXISTS add_family_owner_member ON public.family_groups;
DROP TRIGGER IF EXISTS add_family_owner_trigger ON public.family_groups;
DROP TRIGGER IF EXISTS update_family_groups_updated_at ON public.family_groups;
DROP TRIGGER IF EXISTS trg_audit_family_group_changes ON public.family_groups;
DROP TRIGGER IF EXISTS trg_fss_grant_limited ON public.family_shared_sources;
DROP TRIGGER IF EXISTS trg_fss_revoke_limited ON public.family_shared_sources;
DROP TRIGGER IF EXISTS trg_fm_grant_limited ON public.family_members;
DROP TRIGGER IF EXISTS trg_fm_revoke_limited ON public.family_members;
DROP TRIGGER IF EXISTS fm_sync_role_on_update_trigger ON public.family_members;
DROP TRIGGER IF EXISTS trg_audit_family_member_changes ON public.family_members;
DROP TRIGGER IF EXISTS trg_audit_family_member_exit ON public.family_members;
DROP TRIGGER IF EXISTS trg_family_settlements_updated_at ON public.family_settlements;
DROP TRIGGER IF EXISTS trg_family_tx_comments_updated ON public.family_transaction_comments;

-- 3) Drop 13 family_* tables (CASCADE handles RLS policies + child FKs)
DROP TABLE IF EXISTS public.family_split_audit CASCADE;
DROP TABLE IF EXISTS public.family_split_snapshots CASCADE;
DROP TABLE IF EXISTS public.family_settlements CASCADE;
DROP TABLE IF EXISTS public.family_transaction_reactions CASCADE;
DROP TABLE IF EXISTS public.family_transaction_comments CASCADE;
DROP TABLE IF EXISTS public.family_activity_log CASCADE;
DROP TABLE IF EXISTS public.family_shared_savings CASCADE;
DROP TABLE IF EXISTS public.family_shared_projects CASCADE;
DROP TABLE IF EXISTS public.family_shared_budgets CASCADE;
DROP TABLE IF EXISTS public.family_shared_sources CASCADE;
DROP TABLE IF EXISTS public.family_invitations CASCADE;
DROP TABLE IF EXISTS public.family_members CASCADE;
DROP TABLE IF EXISTS public.family_groups CASCADE;

-- 4) Drop family-specific functions
DROP FUNCTION IF EXISTS public.is_family_member(uuid, uuid) CASCADE;
DROP FUNCTION IF EXISTS public.is_family_owner(uuid, uuid) CASCADE;
DROP FUNCTION IF EXISTS public.audit_family_member_changes() CASCADE;
DROP FUNCTION IF EXISTS public.audit_family_group_changes() CASCADE;
DROP FUNCTION IF EXISTS public.audit_family_member_exit() CASCADE;
DROP FUNCTION IF EXISTS public.add_family_owner_as_member() CASCADE;
DROP FUNCTION IF EXISTS public.record_settlement(uuid, uuid, uuid, numeric, text) CASCADE;
DROP FUNCTION IF EXISTS public.record_settlement(uuid, uuid, uuid, numeric, text, text) CASCADE;
DROP FUNCTION IF EXISTS public.fss_grant_limited_on_share() CASCADE;
DROP FUNCTION IF EXISTS public.fss_revoke_limited_on_unshare() CASCADE;
DROP FUNCTION IF EXISTS public.fm_grant_limited_on_join() CASCADE;
DROP FUNCTION IF EXISTS public.fm_revoke_limited_on_leave() CASCADE;
DROP FUNCTION IF EXISTS public.fm_sync_role_on_update() CASCADE;
DROP FUNCTION IF EXISTS public.compute_family_settlements(uuid, date, date) CASCADE;
DROP FUNCTION IF EXISTS public.compute_family_income_ratio(uuid) CASCADE;
DROP FUNCTION IF EXISTS public.apply_split_override(uuid, jsonb, text) CASCADE;
DROP FUNCTION IF EXISTS public.refresh_family_split_snapshot(uuid) CASCADE;

-- 5) Strip family branch from consume_invitation_token (rewrite without family)
CREATE OR REPLACE FUNCTION public.consume_invitation_token(_token text, _user_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _invitation_type text;
  _result jsonb;
BEGIN
  -- Determine invitation type by checking each invitation table
  IF EXISTS (SELECT 1 FROM public.budget_invitations WHERE token = _token) THEN
    _invitation_type := 'budget';
  ELSIF EXISTS (SELECT 1 FROM public.project_invitations WHERE token = _token) THEN
    _invitation_type := 'project';
  ELSIF EXISTS (SELECT 1 FROM public.payment_source_invitations WHERE token = _token) THEN
    _invitation_type := 'payment_source';
  ELSIF EXISTS (SELECT 1 FROM public.income_source_invitations WHERE token = _token) THEN
    _invitation_type := 'income_source';
  ELSE
    RETURN jsonb_build_object('success', false, 'error', 'invalid_token');
  END IF;

  -- Handle budget
  IF _invitation_type = 'budget' THEN
    UPDATE public.budget_invitations
    SET accepted_at = now(), accepted_by = _user_id
    WHERE token = _token AND accepted_at IS NULL
    RETURNING jsonb_build_object('type', 'budget', 'budget_id', budget_id) INTO _result;
  ELSIF _invitation_type = 'project' THEN
    UPDATE public.project_invitations
    SET accepted_at = now(), accepted_by = _user_id
    WHERE token = _token AND accepted_at IS NULL
    RETURNING jsonb_build_object('type', 'project', 'project_id', project_id) INTO _result;
  ELSIF _invitation_type = 'payment_source' THEN
    UPDATE public.payment_source_invitations
    SET accepted_at = now(), accepted_by = _user_id
    WHERE token = _token AND accepted_at IS NULL
    RETURNING jsonb_build_object('type', 'payment_source', 'payment_source_id', payment_source_id) INTO _result;
  ELSIF _invitation_type = 'income_source' THEN
    UPDATE public.income_source_invitations
    SET accepted_at = now(), accepted_by = _user_id
    WHERE token = _token AND accepted_at IS NULL
    RETURNING jsonb_build_object('type', 'income_source', 'income_source_id', income_source_id) INTO _result;
  END IF;

  IF _result IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'already_accepted_or_expired');
  END IF;

  RETURN jsonb_build_object('success', true, 'data', _result);
END;
$$;

-- 6) Drop profile family columns
ALTER TABLE public.profiles DROP COLUMN IF EXISTS family_override_push;
ALTER TABLE public.profiles DROP COLUMN IF EXISTS family_reactions_push;
ALTER TABLE public.profiles DROP COLUMN IF EXISTS family_mode_enabled;
