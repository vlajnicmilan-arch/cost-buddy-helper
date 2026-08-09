ALTER TABLE public.inbound_attachments
  ADD COLUMN IF NOT EXISTS extracted_text text,
  ADD COLUMN IF NOT EXISTS has_text_layer boolean;