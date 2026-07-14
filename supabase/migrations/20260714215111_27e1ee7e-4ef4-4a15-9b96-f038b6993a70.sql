
-- Postavi search_path na dvije nedovršene funkcije
CREATE OR REPLACE FUNCTION public.project_decisions_touch_updated_at()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at := now(); RETURN NEW; END;
$$;

CREATE OR REPLACE FUNCTION public.project_decision_steps_block_mutation()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  RAISE EXCEPTION 'project_decision_steps is append-only (%)', TG_OP
    USING ERRCODE = 'insufficient_privilege';
END;
$$;

-- Revoke EXECUTE za anon na sve nove funkcije modula "Odluke"
REVOKE ALL ON FUNCTION public.is_project_decision_party(uuid, uuid) FROM anon, public;
REVOKE ALL ON FUNCTION public.project_decision_step_enforce() FROM anon, public;
REVOKE ALL ON FUNCTION public.project_decision_step_after() FROM anon, public;
REVOKE ALL ON FUNCTION public.project_decision_steps_block_mutation() FROM anon, public;
REVOKE ALL ON FUNCTION public.project_decisions_touch_updated_at() FROM anon, public;

GRANT EXECUTE ON FUNCTION public.is_project_decision_party(uuid, uuid) TO authenticated, service_role;
