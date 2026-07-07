-- PR-C+ RLS hardening: ukloni stari permisivni UPDATE policy na project_work_entries.
-- Novi policy "Owner or own worker can update work entries" (PR-A) je stroži i on ostaje.
-- Balance-neutral: RLS-only, ne dira expenses/custom_payment_sources/anchor.
DROP POLICY IF EXISTS "Project members can update work entries" ON public.project_work_entries;