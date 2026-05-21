import { useMemo, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { AlertCircle } from "lucide-react";
import { useAIInsights, type AIInsight, type AISeverity } from "@/hooks/useAIInsights";
import { useLocalAttentionInsights } from "@/hooks/useLocalAttentionInsights";
import { AIInsightCard } from "./AIInsightCard";
import type { Expense } from "@/types/expense";

interface Props {
  enabled: boolean;
  allExpenses?: Expense[];
}

const SEVERITY_RANK: Record<AISeverity, number> = {
  critical: 0,
  warning: 1,
  info: 2,
  positive: 3,
};

const HARD_CAP = 5;
const MAX_CRITICAL = 1;

const mergeAndCap = (ai: AIInsight[], local: AIInsight[]): AIInsight[] => {
  const all = [...ai, ...local].sort(
    (a, b) => SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity],
  );
  const result: AIInsight[] = [];
  let critCount = 0;
  for (const ins of all) {
    if (result.length >= HARD_CAP) break;
    if (ins.severity === "critical") {
      if (critCount >= MAX_CRITICAL) continue;
      critCount++;
    }
    result.push(ins);
  }
  return result;
};

export const AIInsightsSection = ({ enabled, allExpenses }: Props) => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { insights: aiInsights, loading } = useAIInsights(enabled);
  const localInsights = useLocalAttentionInsights(allExpenses ?? []);

  const merged = useMemo(
    () => mergeAndCap(aiInsights, localInsights),
    [aiInsights, localInsights],
  );

  const handleAction = useCallback((insight: AIInsight) => {
    const action = insight.action;
    if (action?.type === "open_project" && action.target_id) {
      navigate("/projects", { state: { openProjectId: action.target_id, from: "/home" } });
      return;
    }
    if (action?.type === "open_invoice" && action.target_id) {
      // Nemamo direktnu rutu za fakturu — fallback na AI chat s kontekstom.
      window.dispatchEvent(new CustomEvent("ai-assistant:ask", { detail: { prompt: insight.prompt } }));
      return;
    }
    window.dispatchEvent(new CustomEvent("ai-assistant:ask", { detail: { prompt: insight.prompt } }));
  }, [navigate]);

  if (!enabled) return null;
  if (!loading && merged.length === 0) return null;

  return (
    <section className="mb-4">
      <div className="flex items-center gap-2 mb-2 px-1">
        <AlertCircle className="w-4 h-4 text-primary" />
        <h2 className="text-sm font-semibold text-foreground">{t("attention.title")}</h2>
      </div>
      {loading && merged.length === 0 ? (
        <div className="space-y-1.5">
          {[0, 1, 2].map(i => (
            <div key={i} className="h-12 rounded-xl bg-muted/40 animate-pulse border border-border/30" />
          ))}
        </div>
      ) : (
        <div className="space-y-1.5">
          {merged.map((ins) => (
            <AIInsightCard key={ins.id} insight={ins} onAction={handleAction} />
          ))}
        </div>
      )}
    </section>
  );
};
