
-- Create public-assets bucket for APK hosting
INSERT INTO storage.buckets (id, name, public)
VALUES ('public-assets', 'public-assets', true)
ON CONFLICT (id) DO NOTHING;

-- Allow anyone to read from public-assets bucket
CREATE POLICY "Public read access for public-assets"
ON storage.objects FOR SELECT
TO public
USING (bucket_id = 'public-assets');

-- Allow authenticated users to upload to public-assets (for admin upload)
CREATE POLICY "Authenticated users can upload to public-assets"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'public-assets');
