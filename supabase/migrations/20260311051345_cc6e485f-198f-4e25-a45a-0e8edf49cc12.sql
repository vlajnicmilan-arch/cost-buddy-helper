
-- Add business_profile_id to project_workers (nullable, so existing project workers still work)
ALTER TABLE public.project_workers 
  ADD COLUMN IF NOT EXISTS business_profile_id uuid REFERENCES public.business_profiles(id) ON DELETE CASCADE;

-- Make project_id nullable (workers can exist without a project)
ALTER TABLE public.project_workers 
  ALTER COLUMN project_id DROP NOT NULL;

-- Add business_profile_id to project_work_entries (nullable)
ALTER TABLE public.project_work_entries 
  ADD COLUMN IF NOT EXISTS business_profile_id uuid REFERENCES public.business_profiles(id) ON DELETE CASCADE;

-- Make project_id nullable on work entries too
ALTER TABLE public.project_work_entries 
  ALTER COLUMN project_id DROP NOT NULL;

-- RLS: allow users to manage workers linked to their business profile
CREATE POLICY "Users can manage business workers"
  ON public.project_workers
  FOR ALL
  TO authenticated
  USING (
    business_profile_id IS NOT NULL 
    AND EXISTS (
      SELECT 1 FROM public.business_profiles bp 
      WHERE bp.id = project_workers.business_profile_id 
      AND bp.user_id = auth.uid()
    )
  )
  WITH CHECK (
    business_profile_id IS NOT NULL 
    AND EXISTS (
      SELECT 1 FROM public.business_profiles bp 
      WHERE bp.id = project_workers.business_profile_id 
      AND bp.user_id = auth.uid()
    )
  );

-- RLS: allow users to manage work entries linked to their business profile
CREATE POLICY "Users can manage business work entries"
  ON public.project_work_entries
  FOR ALL
  TO authenticated
  USING (
    business_profile_id IS NOT NULL 
    AND EXISTS (
      SELECT 1 FROM public.business_profiles bp 
      WHERE bp.id = project_work_entries.business_profile_id 
      AND bp.user_id = auth.uid()
    )
  )
  WITH CHECK (
    business_profile_id IS NOT NULL 
    AND EXISTS (
      SELECT 1 FROM public.business_profiles bp 
      WHERE bp.id = project_work_entries.business_profile_id 
      AND bp.user_id = auth.uid()
    )
  );
