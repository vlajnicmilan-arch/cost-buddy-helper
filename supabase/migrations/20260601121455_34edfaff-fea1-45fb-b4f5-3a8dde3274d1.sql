
REVOKE EXECUTE ON FUNCTION public.compute_family_income_ratio(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.refresh_family_split_snapshot(uuid, date, date) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.compute_family_settlements(uuid, date, date) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.record_settlement(uuid, uuid, text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.apply_split_override(uuid, jsonb) FROM PUBLIC;
