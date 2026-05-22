import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { instantCache } from "@/lib/instantCache";

export type AISeverity = "info" | "positive" | "warning" | "critical";

export type AIInsightAction =
  | { type: "open_project"; target_id: string }
  | { type: "open_invoice"; target_id: string }
  | { type: "ask_ai" };

export interface AIInsight {
  id: string;
  type: string;
  title: string;
  prompt: string;
  severity: AISeverity;
  source?: "ai" | "local";
  action?: AIInsightAction;
}

interface State {
  insights: AIInsight[];
  loading: boolean;
  reason?: "not_enough_data" | "no_signals" | null;
  error?: string | null;
}

const CACHE_KEY = "ai-insights:v2";

export const useAIInsights = (enabled: boolean) => {
  const [state, setState] = useState<State>(() => {
    const cached = instantCache.read<State>(CACHE_KEY);
    if (cached) return { ...cached, loading: false };
    return { insights: [], loading: enabled };
  });

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    setState(s => ({ ...s, loading: true, error: null }));
    (async () => {
      try {
        const { data, error } = await supabase.functions.invoke("generate-ai-insights", {
          body: {},
        });
        if (cancelled) return;
        if (error) throw error;
        const next: State = {
          insights: data?.insights || [],
          loading: false,
          reason: data?.reason || null,
          error: null,
        };
        setState(next);
        instantCache.write(CACHE_KEY, next);
      } catch (e: any) {
        if (cancelled) return;
        setState(s => ({ ...s, loading: false, error: e?.message || "failed" }));
      }
    })();

    return () => { cancelled = true; };
  }, [enabled]);

  return state;
};
