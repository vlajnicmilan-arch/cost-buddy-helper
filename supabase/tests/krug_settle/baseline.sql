-- Krug podmirenje s izvorom — minimalna shema NAD merge/balance baselineom.
-- Žive definicije (24.09.2026) za: krug_is_owner/krug_is_full_member,
-- can_write_payment_source, krug_settlement_ledger, krug_mark_settled i
-- krug_void_settlement (stanje PRIJE migracije podmirenja s izvorom).
\set ON_ERROR_STOP on

ALTER TABLE public.expenses
  ADD COLUMN IF NOT EXISTS client_request_id uuid;
ALTER TABLE public.expenses ALTER COLUMN bank_match_status SET DEFAULT 'manual';
CREATE UNIQUE INDEX IF NOT EXISTS uniq_expenses_client_request
  ON public.expenses (user_id, client_request_id) WHERE client_request_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL UNIQUE,
  display_name text,
  preferred_language text
);

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'krug_membership_role') THEN
    CREATE TYPE public.krug_membership_role AS ENUM ('punopravni','obicni');
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS public.krug (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  deleted_at timestamptz
);
CREATE TABLE IF NOT EXISTS public.krug_ownership (
  krug_id uuid NOT NULL REFERENCES public.krug(id),
  user_id uuid NOT NULL
);
CREATE TABLE IF NOT EXISTS public.krug_membership (
  krug_id uuid NOT NULL REFERENCES public.krug(id),
  user_id uuid NOT NULL,
  role public.krug_membership_role NOT NULL
);

CREATE OR REPLACE FUNCTION public.krug_is_owner(_krug uuid, _user uuid)
RETURNS boolean LANGUAGE sql STABLE AS $$
  SELECT EXISTS (SELECT 1 FROM public.krug_ownership WHERE krug_id=_krug AND user_id=_user);
$$;

CREATE OR REPLACE FUNCTION public.krug_is_full_member(_krug uuid, _user uuid)
 RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
  SELECT
    public.krug_is_owner(_krug, _user)
    OR EXISTS (
      SELECT 1
      FROM public.krug_membership m
      JOIN public.krug k ON k.id = m.krug_id
      WHERE m.krug_id = _krug
        AND m.user_id = _user
        AND m.role = 'punopravni'::public.krug_membership_role
        AND k.deleted_at IS NULL
    );
$function$;

CREATE OR REPLACE FUNCTION public.krug_is_member(_krug uuid, _user uuid)
 RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
  SELECT
    EXISTS (SELECT 1 FROM public.krug_ownership WHERE krug_id = _krug AND user_id = _user)
    OR EXISTS (SELECT 1 FROM public.krug_membership m JOIN public.krug k ON k.id = m.krug_id
               WHERE m.krug_id = _krug AND m.user_id = _user AND k.deleted_at IS NULL);
$function$;

-- Obavijesti nisu predmet ovog paketa: stub koji ništa ne radi.
CREATE OR REPLACE FUNCTION public.krug_emit_notification(
  p_event_type text, p_krug_id uuid, p_actor_id uuid,
  p_expense_id uuid DEFAULT NULL, p_target_user uuid DEFAULT NULL,
  p_dedup_ref text DEFAULT NULL, p_vars jsonb DEFAULT NULL)
RETURNS void LANGUAGE sql AS $$ SELECT NULL::void $$;

CREATE TABLE IF NOT EXISTS public.payment_source_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  payment_source_id uuid NOT NULL REFERENCES public.custom_payment_sources(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  role text NOT NULL
);

CREATE OR REPLACE FUNCTION public.can_write_payment_source(_source_id uuid, _user_id uuid)
 RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
  SELECT EXISTS (
    SELECT 1 FROM public.custom_payment_sources
    WHERE id = _source_id AND user_id = _user_id
  ) OR EXISTS (
    SELECT 1 FROM public.payment_source_members
    WHERE payment_source_id = _source_id
      AND user_id = _user_id
      AND role IN ('full','limited','member')
  );
$function$;

CREATE TABLE IF NOT EXISTS public.krug_settlement_ledger (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  krug_id uuid NOT NULL REFERENCES public.krug(id),
  from_user uuid NOT NULL,
  to_user uuid NOT NULL,
  amount numeric NOT NULL,
  currency text NOT NULL,
  note text,
  marked_by uuid NOT NULL,
  marked_at timestamptz NOT NULL DEFAULT now(),
  voided_at timestamptz,
  voided_by uuid,
  void_reason text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Živi krug_mark_settled (ne smije se mijenjati).
CREATE OR REPLACE FUNCTION public.krug_mark_settled(p_krug_id uuid, p_from_user uuid, p_to_user uuid, p_amount numeric, p_currency text, p_note text DEFAULT NULL::text)
 RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_lock bigint;
  v_id uuid;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'unauthenticated' USING ERRCODE = '42501'; END IF;
  IF NOT public.krug_is_full_member(p_krug_id, v_uid) THEN RAISE EXCEPTION 'not_full_member' USING ERRCODE = '42501'; END IF;
  IF p_from_user = p_to_user THEN RAISE EXCEPTION 'from_equals_to' USING ERRCODE = '22023'; END IF;
  IF v_uid <> p_from_user THEN RAISE EXCEPTION 'only_debtor_can_settle' USING ERRCODE = '42501'; END IF;
  IF NOT public.krug_is_full_member(p_krug_id, p_from_user) OR
     NOT public.krug_is_full_member(p_krug_id, p_to_user) THEN
    RAISE EXCEPTION 'party_not_full_member' USING ERRCODE = '42501';
  END IF;
  IF p_amount IS NULL OR p_amount <= 0 THEN RAISE EXCEPTION 'invalid_amount' USING ERRCODE = '22023'; END IF;
  IF p_currency IS NULL OR length(p_currency) = 0 THEN RAISE EXCEPTION 'invalid_currency' USING ERRCODE = '22023'; END IF;
  v_lock := hashtextextended(p_krug_id::text || ':' || LEAST(p_from_user, p_to_user)::text || ':' || GREATEST(p_from_user, p_to_user)::text, 0);
  PERFORM pg_advisory_xact_lock(v_lock);
  INSERT INTO public.krug_settlement_ledger(krug_id, from_user, to_user, amount, currency, note, marked_by)
  VALUES (p_krug_id, p_from_user, p_to_user, p_amount, upper(p_currency), NULLIF(p_note,''), v_uid)
  RETURNING id INTO v_id;
  RETURN jsonb_build_object('ok', true, 'id', v_id);
END $function$;

-- Živi krug_void_settlement PRIJE migracije (samo postavlja voided_*).
CREATE OR REPLACE FUNCTION public.krug_void_settlement(p_ledger_id uuid, p_reason text)
 RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_row public.krug_settlement_ledger%ROWTYPE;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'unauthenticated' USING ERRCODE = '42501'; END IF;
  IF p_reason IS NULL OR length(trim(p_reason)) = 0 THEN RAISE EXCEPTION 'reason_required' USING ERRCODE = '22023'; END IF;
  SELECT * INTO v_row FROM public.krug_settlement_ledger WHERE id = p_ledger_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'not_found' USING ERRCODE = 'P0002'; END IF;
  IF NOT public.krug_is_full_member(v_row.krug_id, v_uid) THEN RAISE EXCEPTION 'not_full_member' USING ERRCODE = '42501'; END IF;
  IF v_uid <> v_row.from_user AND v_uid <> v_row.to_user THEN RAISE EXCEPTION 'only_party_can_void' USING ERRCODE = '42501'; END IF;
  IF v_row.voided_at IS NOT NULL THEN RAISE EXCEPTION 'already_voided' USING ERRCODE = '22023'; END IF;
  UPDATE public.krug_settlement_ledger
     SET voided_at = now(), voided_by = v_uid, void_reason = trim(p_reason), updated_at = now()
   WHERE id = p_ledger_id;
  RETURN jsonb_build_object('ok', true);
END $function$;
