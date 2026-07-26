-- Smoke test for krug_settlement_preview
-- Verifikacija: sum(paid) == sum(owed), non-member odbijen (insufficient_privilege),
-- multi-currency response ima mixed_currencies flag.
--
-- Pokreni ručno u SQL editoru s postavljenim `SET LOCAL role = 'authenticated'`
-- i `SET LOCAL request.jwt.claim.sub = '<user-uuid>'` da simulira auth.uid().
-- Ili integriraj u supabase/tests/krug/ harness ako postoji runner.

BEGIN;

-- Ovaj skript pretpostavlja da već postoji Krug s najmanje 2 punopravna člana
-- i barem 1 potvrđeni shared trošak u tekućem mjesecu; koristi ga ručno.

-- 1. Sanity: struktura response-a
-- SELECT jsonb_pretty(public.krug_settlement_preview(
--   '<krug_id>'::uuid, date_trunc('month', current_date)::date,
--   (date_trunc('month', current_date) + interval '1 month - 1 day')::date,
--   'EUR', '{"USD":1.08,"HRK":7.5345}'::jsonb
-- ));

-- 2. Invarijanta paid == owed (zaokruženo)
-- WITH r AS (
--   SELECT public.krug_settlement_preview(
--     '<krug_id>'::uuid, date_trunc('month', current_date)::date,
--     (date_trunc('month', current_date) + interval '1 month - 1 day')::date,
--     'EUR', '{}'::jsonb
--   ) AS j
-- )
-- SELECT
--   (SELECT sum((m->>'paid')::numeric) FROM r, jsonb_array_elements(j->'members') m) AS total_paid,
--   (SELECT sum((m->>'owed')::numeric) FROM r, jsonb_array_elements(j->'members') m) AS total_owed;
-- Expect: total_paid ≈ total_owed (within 0.01 * member_count rounding).

-- 3. Non-member se odbija:
-- Postavi JWT sub na usera koji NIJE član — očekuj 42501 insufficient_privilege.

ROLLBACK;
