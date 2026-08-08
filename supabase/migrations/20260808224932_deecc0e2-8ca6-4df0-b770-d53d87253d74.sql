-- =====================================================================
-- MAIL UVOZ — KORAK 1 (temelj). Sve aditivno.
-- =====================================================================

-- 1) Novo pravo: mail_uvoz
ALTER TABLE public.user_entitlements DROP CONSTRAINT user_entitlements_module_check;
ALTER TABLE public.user_entitlements ADD CONSTRAINT user_entitlements_module_check
  CHECK (module = ANY (ARRAY['smjer','krug','projekti','biznis','pro_legacy','business_legacy','mail_uvoz']));

-- 2) mail_aliases
CREATE TABLE public.mail_aliases (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  alias_local text NOT NULL UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now(),
  disabled_at timestamptz
);
CREATE INDEX idx_mail_aliases_user ON public.mail_aliases(user_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.mail_aliases TO authenticated;
GRANT ALL ON public.mail_aliases TO service_role;
ALTER TABLE public.mail_aliases ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own mail aliases" ON public.mail_aliases
  FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- 3) inbound_messages
CREATE TABLE public.inbound_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  alias_id uuid NOT NULL REFERENCES public.mail_aliases(id) ON DELETE CASCADE,
  provider text NOT NULL,
  provider_event_id text NOT NULL,
  from_header text,
  subject text,
  received_at timestamptz NOT NULL DEFAULT now(),
  spf_result text,
  dkim_result text,
  arc_result text,
  dmarc_result text,
  trust_level text,
  body_storage_path text,
  size_bytes bigint,
  status text NOT NULL DEFAULT 'primljena',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT inbound_messages_provider_event_uniq UNIQUE (provider, provider_event_id),
  CONSTRAINT inbound_messages_status_check CHECK (status = ANY (ARRAY[
    'primljena','u_obradi','zavrsena','ceka_kvotu','istekla',
    'zaustavljena_branom','obrisana','neuspjela','neuspjela_konacno'
  ]))
);
CREATE INDEX idx_inbound_messages_owner ON public.inbound_messages(owner_user_id, received_at DESC);
GRANT SELECT ON public.inbound_messages TO authenticated;
GRANT ALL ON public.inbound_messages TO service_role;
ALTER TABLE public.inbound_messages ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users view own inbound messages" ON public.inbound_messages
  FOR SELECT TO authenticated USING (auth.uid() = owner_user_id);

-- 4) inbound_attachments
CREATE TABLE public.inbound_attachments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id uuid NOT NULL REFERENCES public.inbound_messages(id) ON DELETE CASCADE,
  storage_path text NOT NULL,
  mime_declared text,
  mime_sniffed text,
  size_bytes bigint,
  page_count integer,
  scan_status text NOT NULL DEFAULT 'ceka_sken',
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT inbound_attachments_scan_status_check CHECK (scan_status = ANY (ARRAY['ceka_sken','siguran','karantena']))
);
CREATE INDEX idx_inbound_attachments_message ON public.inbound_attachments(message_id);
GRANT SELECT ON public.inbound_attachments TO authenticated;
GRANT ALL ON public.inbound_attachments TO service_role;
ALTER TABLE public.inbound_attachments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users view own inbound attachments" ON public.inbound_attachments
  FOR SELECT TO authenticated USING (EXISTS (
    SELECT 1 FROM public.inbound_messages m
    WHERE m.id = inbound_attachments.message_id AND m.owner_user_id = auth.uid()
  ));

-- 5) document_ingest_items
CREATE TABLE public.document_ingest_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source text NOT NULL,
  scope_type text NOT NULL,
  scope_id uuid NOT NULL,
  attachment_id uuid REFERENCES public.inbound_attachments(id) ON DELETE SET NULL,
  classification text,
  extraction jsonb,
  confidence text,
  status text NOT NULL DEFAULT 'klasificiran',
  dedup_identity text,
  reason text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT document_ingest_items_source_check CHECK (source = ANY (ARRAY['mail','share','eracun_api','folder'])),
  CONSTRAINT document_ingest_items_scope_type_check CHECK (scope_type = ANY (ARRAY['user','business_profile'])),
  CONSTRAINT document_ingest_items_status_check CHECK (status = ANY (ARRAY[
    'klasificiran','izvucen','na_pregledu','potvrdjen','povezan',
    'nije_za_nas','odbaceno','odbacio_korisnik'
  ]))
);
CREATE INDEX idx_document_ingest_items_scope ON public.document_ingest_items(scope_type, scope_id, created_at DESC);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.document_ingest_items TO authenticated;
GRANT ALL ON public.document_ingest_items TO service_role;
ALTER TABLE public.document_ingest_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users access own scope ingest items" ON public.document_ingest_items
  FOR ALL TO authenticated
  USING (
    (scope_type = 'user' AND scope_id = auth.uid())
    OR (scope_type = 'business_profile' AND EXISTS (
      SELECT 1 FROM public.business_profiles bp
      WHERE bp.id = document_ingest_items.scope_id AND bp.user_id = auth.uid()
    ))
  )
  WITH CHECK (
    (scope_type = 'user' AND scope_id = auth.uid())
    OR (scope_type = 'business_profile' AND EXISTS (
      SELECT 1 FROM public.business_profiles bp
      WHERE bp.id = document_ingest_items.scope_id AND bp.user_id = auth.uid()
    ))
  );

-- 6) document_links
CREATE TABLE public.document_links (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  item_id uuid NOT NULL UNIQUE REFERENCES public.document_ingest_items(id) ON DELETE CASCADE,
  target_type text NOT NULL,
  target_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.document_links TO authenticated;
GRANT ALL ON public.document_links TO service_role;
ALTER TABLE public.document_links ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users view links in own scope" ON public.document_links
  FOR SELECT TO authenticated USING (EXISTS (
    SELECT 1 FROM public.document_ingest_items i
    WHERE i.id = document_links.item_id
      AND ((i.scope_type = 'user' AND i.scope_id = auth.uid())
        OR (i.scope_type = 'business_profile' AND EXISTS (
          SELECT 1 FROM public.business_profiles bp WHERE bp.id = i.scope_id AND bp.user_id = auth.uid()
        )))
  ));

-- 7) ingest_jobs (transakcijski outbox)
CREATE TABLE public.ingest_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id uuid NOT NULL REFERENCES public.inbound_messages(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'ceka',
  attempts integer NOT NULL DEFAULT 0,
  next_run_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT ingest_jobs_status_check CHECK (status = ANY (ARRAY['ceka','u_obradi','zavrsen','neuspjeo']))
);
CREATE INDEX idx_ingest_jobs_pending ON public.ingest_jobs(status, next_run_at);
GRANT ALL ON public.ingest_jobs TO service_role;
ALTER TABLE public.ingest_jobs ENABLE ROW LEVEL SECURITY;
-- namjerno bez policyja: red obrade je iskljucivo za pozadinske funkcije (service_role)

-- 8) updated_at triggeri
CREATE TRIGGER update_inbound_messages_updated_at BEFORE UPDATE ON public.inbound_messages
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_document_ingest_items_updated_at BEFORE UPDATE ON public.document_ingest_items
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_ingest_jobs_updated_at BEFORE UPDATE ON public.ingest_jobs
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 9) Transakcijski prihvat: poruka + privitci + posao u istoj transakciji.
CREATE OR REPLACE FUNCTION public.mail_ingest_store_message(
  p_owner_user_id uuid,
  p_alias_id uuid,
  p_provider text,
  p_provider_event_id text,
  p_from_header text,
  p_subject text,
  p_received_at timestamptz,
  p_spf_result text,
  p_dkim_result text,
  p_arc_result text,
  p_dmarc_result text,
  p_body_storage_path text,
  p_size_bytes bigint,
  p_attachments jsonb DEFAULT '[]'::jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_message_id uuid;
  v_existing uuid;
  v_att jsonb;
BEGIN
  SELECT id INTO v_existing FROM public.inbound_messages
    WHERE provider = p_provider AND provider_event_id = p_provider_event_id;
  IF v_existing IS NOT NULL THEN
    RETURN jsonb_build_object('message_id', v_existing, 'replay', true);
  END IF;

  INSERT INTO public.inbound_messages (
    owner_user_id, alias_id, provider, provider_event_id, from_header, subject,
    received_at, spf_result, dkim_result, arc_result, dmarc_result,
    body_storage_path, size_bytes, status
  ) VALUES (
    p_owner_user_id, p_alias_id, p_provider, p_provider_event_id, p_from_header, p_subject,
    COALESCE(p_received_at, now()), p_spf_result, p_dkim_result, p_arc_result, p_dmarc_result,
    p_body_storage_path, p_size_bytes, 'primljena'
  ) RETURNING id INTO v_message_id;

  FOR v_att IN SELECT * FROM jsonb_array_elements(COALESCE(p_attachments, '[]'::jsonb))
  LOOP
    INSERT INTO public.inbound_attachments (message_id, storage_path, mime_declared, size_bytes)
    VALUES (
      v_message_id,
      v_att->>'storage_path',
      v_att->>'mime_declared',
      NULLIF(v_att->>'size_bytes','')::bigint
    );
  END LOOP;

  -- Outbox: ako ovaj upis padne, cijela transakcija (i poruka) se ponistava.
  INSERT INTO public.ingest_jobs (message_id) VALUES (v_message_id);

  RETURN jsonb_build_object('message_id', v_message_id, 'replay', false);
END;
$$;
REVOKE ALL ON FUNCTION public.mail_ingest_store_message(uuid,uuid,text,text,text,text,timestamptz,text,text,text,text,text,bigint,jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.mail_ingest_store_message(uuid,uuid,text,text,text,text,timestamptz,text,text,text,text,text,bigint,jsonb) TO service_role;