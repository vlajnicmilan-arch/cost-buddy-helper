
-- Grant permissions on all family tables
GRANT SELECT, INSERT, UPDATE, DELETE ON public.family_groups TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.family_members TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.family_invitations TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.family_shared_sources TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.family_shared_budgets TO authenticated;
