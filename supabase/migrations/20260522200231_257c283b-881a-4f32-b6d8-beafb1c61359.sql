-- Invoice PDFs: only owner can update their own files
CREATE POLICY "Owner updates own invoice PDFs"
ON storage.objects
FOR UPDATE
USING (
  bucket_id = 'invoice-pdfs'
  AND (auth.uid())::text = (storage.foldername(name))[1]
)
WITH CHECK (
  bucket_id = 'invoice-pdfs'
  AND (auth.uid())::text = (storage.foldername(name))[1]
);

-- Project documents: only project members can update files within their project folder
CREATE POLICY "Project members can update project documents"
ON storage.objects
FOR UPDATE
USING (
  bucket_id = 'project-documents'
  AND public.is_project_member(((storage.foldername(name))[1])::uuid, auth.uid())
)
WITH CHECK (
  bucket_id = 'project-documents'
  AND public.is_project_member(((storage.foldername(name))[1])::uuid, auth.uid())
);