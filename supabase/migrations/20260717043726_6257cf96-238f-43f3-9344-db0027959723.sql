-- Paddle price → module mapping table
-- Multiple rows per price_id support Komplet bundle (expands to 3 modules)
CREATE TABLE IF NOT EXISTS public.paddle_price_map (
  price_id text NOT NULL,
  module text NOT NULL,
  billing_cycle text NOT NULL CHECK (billing_cycle IN ('monthly','yearly','lifetime')),
  environment text NOT NULL DEFAULT 'live' CHECK (environment IN ('sandbox','live')),
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (price_id, module)
);

GRANT SELECT ON public.paddle_price_map TO authenticated;
GRANT ALL ON public.paddle_price_map TO service_role;

ALTER TABLE public.paddle_price_map ENABLE ROW LEVEL SECURITY;

-- Read-only for authenticated users (no secrets in the mapping; helps client debug in future)
CREATE POLICY "paddle_price_map readable by authenticated"
  ON public.paddle_price_map FOR SELECT
  TO authenticated
  USING (true);

CREATE TRIGGER paddle_price_map_updated_at
  BEFORE UPDATE ON public.paddle_price_map
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
