CREATE POLICY "Users read own inbound mail objects"
ON storage.objects
FOR SELECT
TO authenticated
USING (
  bucket_id = 'inbound-mail'
  AND (storage.foldername(name))[1] = auth.uid()::text
);