-- Update handle_new_user function to extract display name from email
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  extracted_name TEXT;
BEGIN
  -- Extract name from email (part before @)
  extracted_name := SPLIT_PART(NEW.email, '@', 1);
  -- Capitalize first letter and replace dots/underscores with spaces
  extracted_name := INITCAP(REPLACE(REPLACE(extracted_name, '.', ' '), '_', ' '));
  
  INSERT INTO public.profiles (user_id, display_name)
  VALUES (NEW.id, extracted_name);
  RETURN NEW;
END;
$function$;