-- Podaci za NULL usporedbu: prije migracije.
\set ON_ERROR_STOP on
INSERT INTO public.krug(id,name) VALUES ('11111111-0000-0000-0000-000000000001','ksa');
INSERT INTO public.krug_ownership VALUES ('11111111-0000-0000-0000-000000000001','aaaaaaaa-0000-0000-0000-000000000001');
INSERT INTO public.krug_membership VALUES ('11111111-0000-0000-0000-000000000001','bbbbbbbb-0000-0000-0000-000000000002','punopravni');
-- N1: 40 EUR bez overridea; N2: 30 EUR s potvrđenim overrideom 70/30 (NULL svota).
INSERT INTO public.expenses(id,user_id,krug_id,krug_privacy,krug_shared_status,amount,currency) VALUES
 ('eeeeeeee-0000-0000-0000-0000000000a1','aaaaaaaa-0000-0000-0000-000000000001','11111111-0000-0000-0000-000000000001','shared','potvrdjena',40,'EUR'),
 ('eeeeeeee-0000-0000-0000-0000000000a2','bbbbbbbb-0000-0000-0000-000000000002','11111111-0000-0000-0000-000000000001','shared','potvrdjena',30,'EUR');
INSERT INTO public.krug_expense_split_override(id,expense_id,krug_id,proposed_by,status,activated_at)
 VALUES ('0a000000-0000-0000-0000-000000000001','eeeeeeee-0000-0000-0000-0000000000a2','11111111-0000-0000-0000-000000000001','bbbbbbbb-0000-0000-0000-000000000002','potvrdjena',now());
INSERT INTO public.krug_expense_split_share(override_id,user_id,share_percent) VALUES
 ('0a000000-0000-0000-0000-000000000001','aaaaaaaa-0000-0000-0000-000000000001',70),
 ('0a000000-0000-0000-0000-000000000001','bbbbbbbb-0000-0000-0000-000000000002',30);
SELECT set_config('request.jwt.claim.sub','aaaaaaaa-0000-0000-0000-000000000001',false);
CREATE TABLE public.ksa_before AS
 SELECT public.krug_settlement_preview('11111111-0000-0000-0000-000000000001',
   date_trunc('month',current_date)::date, (date_trunc('month',current_date)+interval '1 month -1 day')::date,
   'EUR','{}'::jsonb) AS j;
