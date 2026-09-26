-- krug_participation: pomoćnici (žive definicije), dodatni stupci i podaci.
\set ON_ERROR_STOP on
CREATE OR REPLACE FUNCTION public.krug_is_full_member(_krug uuid, _user uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT EXISTS (SELECT 1 FROM public.krug_ownership WHERE krug_id=_krug AND user_id=_user)
      OR EXISTS (SELECT 1 FROM public.krug_membership m JOIN public.krug k ON k.id=m.krug_id
                  WHERE m.krug_id=_krug AND m.user_id=_user AND m.role='punopravni' AND k.deleted_at IS NULL);
$$;
CREATE OR REPLACE FUNCTION public.krug_is_member(_krug uuid, _user uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $function$
  SELECT
    EXISTS (SELECT 1 FROM public.krug_ownership WHERE krug_id = _krug AND user_id = _user)
    OR EXISTS (SELECT 1 FROM public.krug_membership m JOIN public.krug k ON k.id = m.krug_id
               WHERE m.krug_id = _krug AND m.user_id = _user AND k.deleted_at IS NULL);
$function$;
GRANT EXECUTE ON FUNCTION public.krug_is_member(uuid,uuid), public.krug_is_full_member(uuid,uuid) TO authenticated, service_role;
CREATE OR REPLACE FUNCTION public.can_write_payment_source(uuid, uuid) RETURNS boolean LANGUAGE sql AS $$ SELECT true $$;
CREATE OR REPLACE FUNCTION public.krug_settlement_description(uuid, uuid) RETURNS text LANGUAGE sql AS $$ SELECT 'Krug' $$;

ALTER TABLE public.krug_settlement_ledger
  ALTER COLUMN marked_at SET DEFAULT now(),
  ADD COLUMN note text, ADD COLUMN marked_by uuid, ADD COLUMN payer_expense_id uuid,
  ADD COLUMN payer_source_id uuid, ADD COLUMN client_request_id uuid, ADD COLUMN payer_amount numeric,
  ADD COLUMN payer_currency text, ADD COLUMN recipient_expense_id uuid, ADD COLUMN recipient_source_id uuid,
  ADD COLUMN recipient_confirmed_at timestamptz, ADD COLUMN voided_by uuid, ADD COLUMN void_reason text,
  ADD COLUMN updated_at timestamptz;
ALTER TABLE public.expenses
  ADD COLUMN payment_source text, ADD COLUMN description text, ADD COLUMN expense_nature text,
  ADD COLUMN status text, ADD COLUMN submitted_by uuid, ADD COLUMN client_request_id uuid,
  ADD COLUMN bank_transaction_id text, ADD COLUMN bank_match_status text, ADD COLUMN deleted_by uuid;
INSERT INTO public.custom_payment_sources(id, currency) VALUES
  ('5c000000-0000-0000-0000-000000000001','EUR');

GRANT SELECT ON public.krug_settlement_ledger, public.krug_expense_split_override,
  public.krug_expense_split_share, public.krug_expense_split_confirmation TO authenticated;
ALTER TABLE public.krug_settlement_ledger ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.krug_expense_split_override ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.krug_expense_split_share ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.krug_expense_split_confirmation ENABLE ROW LEVEL SECURITY;
CREATE POLICY ledger_select_full_member ON public.krug_settlement_ledger
  FOR SELECT TO authenticated USING (public.krug_is_full_member(krug_id, auth.uid()));
CREATE POLICY override_select_full_member ON public.krug_expense_split_override
  FOR SELECT TO authenticated USING (public.krug_is_full_member(krug_id, auth.uid()));
CREATE POLICY share_select_full_member ON public.krug_expense_split_share FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.krug_expense_split_override o
                  WHERE o.id = override_id AND public.krug_is_full_member(o.krug_id, auth.uid())));
CREATE POLICY confirm_select_full_member ON public.krug_expense_split_confirmation FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.krug_expense_split_override o
                  WHERE o.id = override_id AND public.krug_is_full_member(o.krug_id, auth.uid())));

-- K1: A vlasnik, B punopravni, C i D obični. E bivši (nema retka), N izvan Kruga.
INSERT INTO public.krug(id,name) VALUES ('c1000000-0000-0000-0000-000000000001','kp');
INSERT INTO public.krug_ownership VALUES ('c1000000-0000-0000-0000-000000000001','a0000000-0000-0000-0000-00000000000a');
INSERT INTO public.krug_membership VALUES
 ('c1000000-0000-0000-0000-000000000001','b0000000-0000-0000-0000-00000000000b','punopravni'),
 ('c1000000-0000-0000-0000-000000000001','c0000000-0000-0000-0000-00000000000c','obicni'),
 ('c1000000-0000-0000-0000-000000000001','d0000000-0000-0000-0000-00000000000d','obicni');

-- Stanje 1 (bez prijedloga): A 40 EUR, B 30 USD, C 25 EUR (obični plaća bez prijedloga).
INSERT INTO public.expenses(id,user_id,krug_id,krug_privacy,krug_shared_status,amount,currency) VALUES
 ('e1000000-0000-0000-0000-000000000001','a0000000-0000-0000-0000-00000000000a','c1000000-0000-0000-0000-000000000001','shared','potvrdjena',40,'EUR'),
 ('e1000000-0000-0000-0000-000000000002','b0000000-0000-0000-0000-00000000000b','c1000000-0000-0000-0000-000000000001','shared','potvrdjena',30,'USD'),
 ('e1000000-0000-0000-0000-000000000003','c0000000-0000-0000-0000-00000000000c','c1000000-0000-0000-0000-000000000001','shared','potvrdjena',25,'EUR');

CREATE OR REPLACE FUNCTION public.kp_as(u text) RETURNS void LANGUAGE sql AS $$
  SELECT set_config('request.jwt.claim.sub', u, true)::text; SELECT NULL::void $$;
CREATE OR REPLACE FUNCTION public.kp_prev(u text, cur text DEFAULT 'EUR', rates jsonb DEFAULT '{}')
RETURNS jsonb LANGUAGE plpgsql AS $$ BEGIN
  PERFORM set_config('request.jwt.claim.sub', u, true);
  RETURN public.krug_settlement_preview('c1000000-0000-0000-0000-000000000001', date_trunc('month',current_date)::date,
    (date_trunc('month',current_date)+interval '1 month -1 day')::date, cur, rates);
END $$;
-- Stanje 2 (i dalje bez običnih u prijedlogu): prijedlog A/B na B-ovom trošku + podmirenje A→B.
CREATE OR REPLACE FUNCTION public.kp_state2(on_ boolean) RETURNS void LANGUAGE plpgsql AS $$ BEGIN
  IF on_ THEN
    INSERT INTO public.expenses(id,user_id,krug_id,krug_privacy,krug_shared_status,amount,currency) VALUES
     ('e2000000-0000-0000-0000-000000000001','b0000000-0000-0000-0000-00000000000b','c1000000-0000-0000-0000-000000000001','shared','potvrdjena',20,'EUR');
    INSERT INTO public.krug_expense_split_override(id,expense_id,krug_id,proposed_by,status,activated_at,shared_amount) VALUES
     ('0b200000-0000-0000-0000-000000000001','e2000000-0000-0000-0000-000000000001','c1000000-0000-0000-0000-000000000001','b0000000-0000-0000-0000-00000000000b','potvrdjena',now(),15);
    INSERT INTO public.krug_expense_split_share(override_id,user_id,share_percent) VALUES
     ('0b200000-0000-0000-0000-000000000001','a0000000-0000-0000-0000-00000000000a',80),
     ('0b200000-0000-0000-0000-000000000001','b0000000-0000-0000-0000-00000000000b',20);
    INSERT INTO public.krug_settlement_ledger(id,krug_id,from_user,to_user,amount,currency) VALUES
     ('1e200000-0000-0000-0000-000000000001','c1000000-0000-0000-0000-000000000001','a0000000-0000-0000-0000-00000000000a','b0000000-0000-0000-0000-00000000000b',5,'EUR');
  ELSE
    DELETE FROM public.krug_expense_split_share WHERE override_id='0b200000-0000-0000-0000-000000000001';
    DELETE FROM public.krug_expense_split_override WHERE id='0b200000-0000-0000-0000-000000000001';
    DELETE FROM public.expenses WHERE id='e2000000-0000-0000-0000-000000000001';
    DELETE FROM public.krug_settlement_ledger WHERE id='1e200000-0000-0000-0000-000000000001';
  END IF;
END $$;
CREATE OR REPLACE FUNCTION public.kp_full_views(st int) RETURNS TABLE(st int, u text, cur text, rates jsonb, j jsonb)
LANGUAGE sql AS $$
  SELECT st, us.u, c.cur, c.rates, public.kp_prev(us.u, c.cur, c.rates)
  FROM (VALUES ('a0000000-0000-0000-0000-00000000000a'),('b0000000-0000-0000-0000-00000000000b')) us(u)
  CROSS JOIN (VALUES ('EUR','{}'::jsonb),('EUR','{"USD":1.1}'::jsonb),('USD','{"USD":1.1}'::jsonb)) c(cur,rates)
$$;
