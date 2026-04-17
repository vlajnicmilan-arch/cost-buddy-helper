-- Allow admins to upload/update/delete files at the root of public-assets bucket
-- (e.g., vm-balance.apk for landing page download)

CREATE POLICY "Admins can upload to public-assets root"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'public-assets'
  AND public.has_role(auth.uid(), 'admin'::public.app_role)
);

CREATE POLICY "Admins can update public-assets"
ON storage.objects
FOR UPDATE
TO authenticated
USING (
  bucket_id = 'public-assets'
  AND public.has_role(auth.uid(), 'admin'::public.app_role)
)
WITH CHECK (
  bucket_id = 'public-assets'
  AND public.has_role(auth.uid(), 'admin'::public.app_role)
);

CREATE POLICY "Admins can delete from public-assets"
ON storage.objects
FOR DELETE
TO authenticated
USING (
  bucket_id = 'public-assets'
  AND public.has_role(auth.uid(), 'admin'::public.app_role)
);