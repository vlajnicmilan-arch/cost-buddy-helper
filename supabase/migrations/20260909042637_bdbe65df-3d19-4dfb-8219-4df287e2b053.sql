DROP TRIGGER IF EXISTS trigger_cleanup_login_logs ON public.user_login_logs;
DROP FUNCTION IF EXISTS public.maybe_cleanup_login_logs();