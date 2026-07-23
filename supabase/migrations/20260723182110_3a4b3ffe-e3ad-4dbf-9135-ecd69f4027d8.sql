
-- ============================================================
-- AI cost cap: config + monthly aggregate + RPCs
-- ============================================================

-- 1. Cjenik po ruti (admin editable)
CREATE TABLE public.ai_route_costs (
  route text PRIMARY KEY,
  unit_cost_eur numeric(10,6) NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.ai_route_costs TO authenticated;
GRANT ALL ON public.ai_route_costs TO service_role;
ALTER TABLE public.ai_route_costs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "authenticated read ai_route_costs" ON public.ai_route_costs
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "admin manages ai_route_costs" ON public.ai_route_costs
  FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

-- Seed cijene (Gemini 2.5 Flash / Flash Lite / Pro realne procjene 07/2026)
INSERT INTO public.ai_route_costs (route, unit_cost_eur) VALUES
  ('parse-receipt',           0.002600),
  ('parse-pdf-statement',     0.013000),
  ('scan-card',               0.000600),
  ('categorize-transaction',  0.000030),
  ('match-recurring',         0.000400),
  ('parse-standup',           0.001600),
  ('generate-ai-insights',    0.003500),
  ('financial-assistant',     0.004000),
  ('analyze-document',        0.004000),
  ('detect-loans',            0.000500),
  ('lookup-company',          0.000130),
  ('generate-health-summary', 0.003000),
  ('project-insights',        0.003700),
  ('bank-sync-transactions',  0.000400)
ON CONFLICT (route) DO NOTHING;

-- 2. Mjesečni agregat (kalendarski mjesec, UTC)
CREATE TABLE public.ai_cost_monthly (
  month_key date NOT NULL,
  route text NOT NULL,
  call_count integer NOT NULL DEFAULT 0,
  total_eur numeric(12,4) NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (month_key, route)
);
CREATE INDEX idx_ai_cost_monthly_month ON public.ai_cost_monthly(month_key);
GRANT SELECT ON public.ai_cost_monthly TO authenticated;
GRANT ALL ON public.ai_cost_monthly TO service_role;
ALTER TABLE public.ai_cost_monthly ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admin reads ai_cost_monthly" ON public.ai_cost_monthly
  FOR SELECT TO authenticated USING (has_role(auth.uid(), 'admin'::app_role));

-- 3. app_settings ključevi (default 100 €, pragovi 50/80/100)
INSERT INTO public.app_settings (key, value) VALUES
  ('ai_monthly_cap_eur', '100'::jsonb),
  ('ai_alert_thresholds_eur', '[50, 80, 100]'::jsonb)
ON CONFLICT (key) DO NOTHING;

-- 4. RPC: jeftini read agregata + stropa (koristi ga edge helper s TTL kešom)
CREATE OR REPLACE FUNCTION public.get_ai_monthly_spend()
RETURNS TABLE(month_key date, spent_eur numeric, cap_eur numeric)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_month date := date_trunc('month', now() AT TIME ZONE 'UTC')::date;
  v_cap numeric;
BEGIN
  SELECT (value)::text::numeric INTO v_cap
    FROM app_settings WHERE key = 'ai_monthly_cap_eur';
  v_cap := COALESCE(v_cap, 100);
  RETURN QUERY
    SELECT v_month,
           COALESCE((SELECT SUM(total_eur) FROM ai_cost_monthly WHERE month_key = v_month), 0)::numeric,
           v_cap;
END;
$$;
GRANT EXECUTE ON FUNCTION public.get_ai_monthly_spend() TO authenticated, service_role;

-- 5. RPC: atomicno biljezenje troska + prag-alarm dedup preko notifications
CREATE OR REPLACE FUNCTION public.record_ai_cost(p_route text)
RETURNS TABLE(monthly_eur numeric, cap_eur numeric)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_month date := date_trunc('month', now() AT TIME ZONE 'UTC')::date;
  v_unit numeric;
  v_cap numeric;
  v_prev numeric;
  v_new numeric;
  v_thresholds jsonb;
  v_th numeric;
  v_admin uuid;
  v_dedup text;
BEGIN
  SELECT unit_cost_eur INTO v_unit FROM ai_route_costs WHERE route = p_route;
  IF v_unit IS NULL THEN v_unit := 0.001; END IF;

  SELECT (value)::text::numeric INTO v_cap FROM app_settings WHERE key = 'ai_monthly_cap_eur';
  v_cap := COALESCE(v_cap, 100);

  SELECT COALESCE(SUM(total_eur), 0) INTO v_prev
    FROM ai_cost_monthly WHERE month_key = v_month;

  INSERT INTO ai_cost_monthly (month_key, route, call_count, total_eur, updated_at)
  VALUES (v_month, p_route, 1, v_unit, now())
  ON CONFLICT (month_key, route) DO UPDATE
    SET call_count = ai_cost_monthly.call_count + 1,
        total_eur = ai_cost_monthly.total_eur + EXCLUDED.total_eur,
        updated_at = now();

  v_new := v_prev + v_unit;

  SELECT value INTO v_thresholds FROM app_settings WHERE key = 'ai_alert_thresholds_eur';
  v_thresholds := COALESCE(v_thresholds, '[50,80,100]'::jsonb);

  FOR v_th IN SELECT (jsonb_array_elements_text(v_thresholds))::numeric LOOP
    IF v_prev < v_th AND v_new >= v_th THEN
      FOR v_admin IN SELECT user_id FROM user_roles WHERE role = 'admin' LOOP
        v_dedup := 'ai_cost_alert:' || to_char(v_month, 'YYYY-MM') || ':' || v_th::text;
        IF NOT EXISTS (
          SELECT 1 FROM notifications
          WHERE user_id = v_admin AND dedup_key = v_dedup AND status = 'active'
        ) THEN
          INSERT INTO notifications (user_id, type, title, message, severity, dedup_key, data)
          VALUES (
            v_admin,
            'ai_cost_alert',
            'AI trošak: ' || v_th || ' €',
            'AI trošak ovog mjeseca prešao ' || v_th || ' € (strop ' || v_cap || ' €).',
            CASE WHEN v_th >= v_cap THEN 'critical' ELSE 'warning' END,
            v_dedup,
            jsonb_build_object('month', v_month, 'threshold_eur', v_th, 'cap_eur', v_cap, 'spent_eur', v_new)
          );
        END IF;
      END LOOP;
    END IF;
  END LOOP;

  RETURN QUERY SELECT v_new, v_cap;
END;
$$;
GRANT EXECUTE ON FUNCTION public.record_ai_cost(text) TO authenticated, service_role;
