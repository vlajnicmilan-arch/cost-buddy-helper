-- Snimka punopravnih pogleda PRIJE migracije, u dva stanja bez običnih članova u prijedlozima.
\set ON_ERROR_STOP on
CREATE TABLE public.kp_before AS SELECT * FROM public.kp_full_views(1);
SELECT public.kp_state2(true);
INSERT INTO public.kp_before SELECT * FROM public.kp_full_views(2);
SELECT public.kp_state2(false);
