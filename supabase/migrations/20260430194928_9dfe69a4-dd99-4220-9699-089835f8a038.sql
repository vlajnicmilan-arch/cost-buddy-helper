-- Funnel events tablica
CREATE TABLE public.funnel_events (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID,
  session_id TEXT,
  event_name TEXT NOT NULL,
  platform TEXT,
  metadata JSONB DEFAULT '{}'::jsonb,
  occurred_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Constraint za dozvoljene event nazive
ALTER TABLE public.funnel_events
  ADD CONSTRAINT funnel_events_name_check
  CHECK (event_name IN (
    'install',
    'signup',
    'onboarding_complete',
    'first_transaction',
    'day7_active',
    'paid_conversion'
  ));

-- Indexi za brze upite
CREATE INDEX idx_funnel_events_user_id ON public.funnel_events(user_id);
CREATE INDEX idx_funnel_events_event_name ON public.funnel_events(event_name);
CREATE INDEX idx_funnel_events_occurred_at ON public.funnel_events(occurred_at DESC);
CREATE INDEX idx_funnel_events_session_id ON public.funnel_events(session_id) WHERE session_id IS NOT NULL;

-- Jedinstvenost: jedan user može imati samo jedan event istog tipa (osim day7_active i install po sessionu)
CREATE UNIQUE INDEX idx_funnel_events_unique_user_event
  ON public.funnel_events(user_id, event_name)
  WHERE user_id IS NOT NULL AND event_name IN ('signup', 'onboarding_complete', 'first_transaction', 'paid_conversion');

CREATE UNIQUE INDEX idx_funnel_events_unique_install_session
  ON public.funnel_events(session_id, event_name)
  WHERE session_id IS NOT NULL AND event_name = 'install';

-- Enable RLS
ALTER TABLE public.funnel_events ENABLE ROW LEVEL SECURITY;

-- Policies
-- Anonimni i prijavljeni korisnici mogu unijeti event (install prije signupa, ostalo nakon)
CREATE POLICY "Anyone can insert funnel events"
  ON public.funnel_events
  FOR INSERT
  WITH CHECK (
    -- Ako je user_id postavljen, mora se podudarati s auth.uid()
    (user_id IS NULL AND event_name = 'install')
    OR (user_id IS NOT NULL AND user_id = auth.uid())
  );

-- Korisnici vide vlastite eventove
CREATE POLICY "Users can view own funnel events"
  ON public.funnel_events
  FOR SELECT
  USING (user_id = auth.uid());

-- Admini vide sve
CREATE POLICY "Admins can view all funnel events"
  ON public.funnel_events
  FOR SELECT
  USING (public.has_role(auth.uid(), 'admin'::app_role));