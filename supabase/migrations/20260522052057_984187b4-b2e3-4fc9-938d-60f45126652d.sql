-- 1) Backfill: kreiraj default red u notification_preferences za sve postojeće korisnike
INSERT INTO public.notification_preferences (user_id)
SELECT u.id
FROM auth.users u
WHERE NOT EXISTS (
  SELECT 1 FROM public.notification_preferences np WHERE np.user_id = u.id
);

-- 2) Proširi handle_new_user da automatski kreira default red za buduće korisnike
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  extracted_name TEXT;
BEGIN
  extracted_name := SPLIT_PART(NEW.email, '@', 1);
  extracted_name := INITCAP(REPLACE(REPLACE(extracted_name, '.', ' '), '_', ' '));

  INSERT INTO public.profiles (user_id, display_name)
  VALUES (NEW.id, extracted_name)
  ON CONFLICT (user_id) DO NOTHING;

  INSERT INTO public.notification_preferences (user_id)
  VALUES (NEW.id)
  ON CONFLICT (user_id) DO NOTHING;

  RETURN NEW;
END;
$function$;