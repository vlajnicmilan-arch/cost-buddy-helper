INSERT INTO public.app_settings(key, value)
VALUES ('brief_gate_user_ids', jsonb_build_array(
  'd4d31ee6-5f6b-4059-8c87-b595b394f56b',
  '3213303b-6267-4188-8dc9-2bb2a5c3c672'
))
ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now();