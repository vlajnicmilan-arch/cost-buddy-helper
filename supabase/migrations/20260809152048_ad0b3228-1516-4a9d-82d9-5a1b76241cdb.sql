ALTER TABLE public.document_ingest_items REPLICA IDENTITY FULL;
ALTER PUBLICATION supabase_realtime ADD TABLE public.document_ingest_items;