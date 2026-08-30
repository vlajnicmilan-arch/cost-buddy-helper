-- projects
DROP POLICY IF EXISTS projects_readonly_when_downgraded ON public.projects;
CREATE POLICY projects_readonly_when_downgraded_ins ON public.projects
  AS RESTRICTIVE FOR INSERT TO authenticated
  WITH CHECK ((user_id <> auth.uid()) OR is_projects_subscriber(auth.uid()));
CREATE POLICY projects_readonly_when_downgraded_upd ON public.projects
  AS RESTRICTIVE FOR UPDATE TO authenticated
  USING ((user_id <> auth.uid()) OR is_projects_subscriber(auth.uid()))
  WITH CHECK ((user_id <> auth.uid()) OR is_projects_subscriber(auth.uid()));
CREATE POLICY projects_readonly_when_downgraded_del ON public.projects
  AS RESTRICTIVE FOR DELETE TO authenticated
  USING ((user_id <> auth.uid()) OR is_projects_subscriber(auth.uid()));

-- project_estimates
DROP POLICY IF EXISTS project_estimates_readonly_when_downgraded ON public.project_estimates;
CREATE POLICY project_estimates_readonly_when_downgraded_ins ON public.project_estimates
  AS RESTRICTIVE FOR INSERT TO authenticated
  WITH CHECK ((user_id <> auth.uid()) OR is_projects_subscriber(auth.uid()));
CREATE POLICY project_estimates_readonly_when_downgraded_upd ON public.project_estimates
  AS RESTRICTIVE FOR UPDATE TO authenticated
  USING ((user_id <> auth.uid()) OR is_projects_subscriber(auth.uid()))
  WITH CHECK ((user_id <> auth.uid()) OR is_projects_subscriber(auth.uid()));
CREATE POLICY project_estimates_readonly_when_downgraded_del ON public.project_estimates
  AS RESTRICTIVE FOR DELETE TO authenticated
  USING ((user_id <> auth.uid()) OR is_projects_subscriber(auth.uid()));

-- project_invoices
DROP POLICY IF EXISTS project_invoices_readonly_when_downgraded ON public.project_invoices;
CREATE POLICY project_invoices_readonly_when_downgraded_ins ON public.project_invoices
  AS RESTRICTIVE FOR INSERT TO authenticated
  WITH CHECK ((user_id <> auth.uid()) OR is_projects_subscriber(auth.uid()));
CREATE POLICY project_invoices_readonly_when_downgraded_upd ON public.project_invoices
  AS RESTRICTIVE FOR UPDATE TO authenticated
  USING ((user_id <> auth.uid()) OR is_projects_subscriber(auth.uid()))
  WITH CHECK ((user_id <> auth.uid()) OR is_projects_subscriber(auth.uid()));
CREATE POLICY project_invoices_readonly_when_downgraded_del ON public.project_invoices
  AS RESTRICTIVE FOR DELETE TO authenticated
  USING ((user_id <> auth.uid()) OR is_projects_subscriber(auth.uid()));

-- project_documents
DROP POLICY IF EXISTS project_documents_readonly_when_downgraded ON public.project_documents;
CREATE POLICY project_documents_readonly_when_downgraded_ins ON public.project_documents
  AS RESTRICTIVE FOR INSERT TO authenticated
  WITH CHECK ((NOT (EXISTS ( SELECT 1 FROM projects p WHERE ((p.id = project_documents.project_id) AND (p.user_id = auth.uid()))))) OR is_projects_subscriber(auth.uid()));
CREATE POLICY project_documents_readonly_when_downgraded_upd ON public.project_documents
  AS RESTRICTIVE FOR UPDATE TO authenticated
  USING ((NOT (EXISTS ( SELECT 1 FROM projects p WHERE ((p.id = project_documents.project_id) AND (p.user_id = auth.uid()))))) OR is_projects_subscriber(auth.uid()))
  WITH CHECK ((NOT (EXISTS ( SELECT 1 FROM projects p WHERE ((p.id = project_documents.project_id) AND (p.user_id = auth.uid()))))) OR is_projects_subscriber(auth.uid()));
CREATE POLICY project_documents_readonly_when_downgraded_del ON public.project_documents
  AS RESTRICTIVE FOR DELETE TO authenticated
  USING ((NOT (EXISTS ( SELECT 1 FROM projects p WHERE ((p.id = project_documents.project_id) AND (p.user_id = auth.uid()))))) OR is_projects_subscriber(auth.uid()));

-- project_funding
DROP POLICY IF EXISTS project_funding_readonly_when_downgraded ON public.project_funding;
CREATE POLICY project_funding_readonly_when_downgraded_ins ON public.project_funding
  AS RESTRICTIVE FOR INSERT TO authenticated
  WITH CHECK ((NOT (EXISTS ( SELECT 1 FROM projects p WHERE ((p.id = project_funding.project_id) AND (p.user_id = auth.uid()))))) OR is_projects_subscriber(auth.uid()));
CREATE POLICY project_funding_readonly_when_downgraded_upd ON public.project_funding
  AS RESTRICTIVE FOR UPDATE TO authenticated
  USING ((NOT (EXISTS ( SELECT 1 FROM projects p WHERE ((p.id = project_funding.project_id) AND (p.user_id = auth.uid()))))) OR is_projects_subscriber(auth.uid()))
  WITH CHECK ((NOT (EXISTS ( SELECT 1 FROM projects p WHERE ((p.id = project_funding.project_id) AND (p.user_id = auth.uid()))))) OR is_projects_subscriber(auth.uid()));
CREATE POLICY project_funding_readonly_when_downgraded_del ON public.project_funding
  AS RESTRICTIVE FOR DELETE TO authenticated
  USING ((NOT (EXISTS ( SELECT 1 FROM projects p WHERE ((p.id = project_funding.project_id) AND (p.user_id = auth.uid()))))) OR is_projects_subscriber(auth.uid()));
