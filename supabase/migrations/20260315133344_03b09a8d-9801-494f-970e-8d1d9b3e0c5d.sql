-- Storage bucket for certificates (private, not public)
INSERT INTO storage.buckets (id, name, public)
VALUES ('certificates', 'certificates', false)
ON CONFLICT (id) DO NOTHING;

-- RLS: Only owner can upload/read/delete their certificates
CREATE POLICY "Users can upload own certificates"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'certificates' AND (storage.foldername(name))[1] = auth.uid()::text);

CREATE POLICY "Users can view own certificates"
ON storage.objects FOR SELECT TO authenticated
USING (bucket_id = 'certificates' AND (storage.foldername(name))[1] = auth.uid()::text);

CREATE POLICY "Users can delete own certificates"
ON storage.objects FOR DELETE TO authenticated
USING (bucket_id = 'certificates' AND (storage.foldername(name))[1] = auth.uid()::text);

-- Add certificate fields to business_profiles
ALTER TABLE public.business_profiles
ADD COLUMN IF NOT EXISTS certificate_path text DEFAULT NULL,
ADD COLUMN IF NOT EXISTS certificate_password text DEFAULT NULL,
ADD COLUMN IF NOT EXISTS certificate_uploaded_at timestamp with time zone DEFAULT NULL,
ADD COLUMN IF NOT EXISTS fiscalization_enabled boolean DEFAULT false;