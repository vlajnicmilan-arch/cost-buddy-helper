-- PR2 Phase A hardening: revoke EXECUTE from anon on set_source_anchor.
--
-- Supabase ALTER DEFAULT PRIVILEGES automatically grants EXECUTE on newly
-- created functions in schema public to the `anon` role. REVOKE FROM PUBLIC
-- in the original migration does NOT cover this because the anon grant is
-- direct, not inherited from PUBLIC. Runtime risk is low (the function
-- raises 42501 when auth.uid() IS NULL), but defense-in-depth requires
-- removing the grant explicitly so it matches the plan (authenticated +
-- service_role only).
--
-- Pattern note: every future SECURITY DEFINER function in schema public
-- must include `REVOKE EXECUTE ... FROM anon` unless anon access is
-- intentional. See mem://architecture/security-definer-anon-revoke.

REVOKE EXECUTE ON FUNCTION public.set_source_anchor(uuid, timestamptz, numeric, jsonb) FROM anon;