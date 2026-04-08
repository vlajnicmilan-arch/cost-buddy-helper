
-- 1. email_send_log: service_role only
DO $$
BEGIN
  DROP POLICY IF EXISTS "Service role can manage email_send_log" ON public.email_send_log;
  DROP POLICY IF EXISTS "Service role full access" ON public.email_send_log;
END $$;

CREATE POLICY "Only service_role can access email_send_log"
ON public.email_send_log
FOR ALL
TO service_role
USING (true)
WITH CHECK (true);

-- 2. suppressed_emails: service_role only
DO $$
BEGIN
  DROP POLICY IF EXISTS "Service role can manage suppressed_emails" ON public.suppressed_emails;
  DROP POLICY IF EXISTS "Service role can read suppressed_emails" ON public.suppressed_emails;
  DROP POLICY IF EXISTS "Service role full access" ON public.suppressed_emails;
END $$;

CREATE POLICY "Only service_role can access suppressed_emails"
ON public.suppressed_emails
FOR ALL
TO service_role
USING (true)
WITH CHECK (true);

-- 3. email_unsubscribe_tokens: service_role only
DO $$
BEGIN
  DROP POLICY IF EXISTS "Service role can manage tokens" ON public.email_unsubscribe_tokens;
  DROP POLICY IF EXISTS "Service role full access" ON public.email_unsubscribe_tokens;
  DROP POLICY IF EXISTS "Anyone can validate unsubscribe tokens" ON public.email_unsubscribe_tokens;
END $$;

CREATE POLICY "Only service_role can access email_unsubscribe_tokens"
ON public.email_unsubscribe_tokens
FOR ALL
TO service_role
USING (true)
WITH CHECK (true);

-- 4. public-assets bucket: path-scope uploads
DROP POLICY IF EXISTS "Anyone can upload public assets" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can upload public assets" ON storage.objects;
DROP POLICY IF EXISTS "Auth users can upload to public-assets" ON storage.objects;

CREATE POLICY "Auth users can upload to own folder in public-assets"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'public-assets' 
  AND (storage.foldername(name))[1] = auth.uid()::text
);

-- 5. UPDATE policies for receipts and certificates
CREATE POLICY "Users can update own receipts"
ON storage.objects
FOR UPDATE
TO authenticated
USING (
  bucket_id = 'receipts' 
  AND (storage.foldername(name))[1] = auth.uid()::text
);

CREATE POLICY "Users can update own certificates"
ON storage.objects
FOR UPDATE
TO authenticated
USING (
  bucket_id = 'certificates' 
  AND (storage.foldername(name))[1] = auth.uid()::text
);

-- 6. income_source_invitations: invited users can view by email
CREATE POLICY "Invited users can view own income source invitations"
ON public.income_source_invitations
FOR SELECT
TO authenticated
USING (auth.email() = email);
