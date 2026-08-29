CREATE OR REPLACE FUNCTION public.notify_admin_new_signup()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
BEGIN
  BEGIN
    PERFORM net.http_post(
      url := 'https://fzalxjretvtvokiotvkf.supabase.co/functions/v1/notify-admin-signup',
      headers := '{"Content-Type": "application/json"}'::jsonb,
      body := jsonb_build_object('user_id', NEW.user_id)
    );
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'notify_admin_new_signup failed: %', SQLERRM;
  END;
  RETURN NEW;
END;
$fn$;

REVOKE ALL ON FUNCTION public.notify_admin_new_signup() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.notify_admin_new_signup() FROM anon;

DROP TRIGGER IF EXISTS trg_notify_admin_new_signup ON public.profiles;
CREATE TRIGGER trg_notify_admin_new_signup
AFTER INSERT ON public.profiles
FOR EACH ROW
EXECUTE FUNCTION public.notify_admin_new_signup();