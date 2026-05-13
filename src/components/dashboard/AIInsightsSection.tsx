import { useTranslation } from "react-i18next";
import { Lightbulb } from "lucide-react";
import { useAIInsights, type AIInsight } from "@/hooks/useAIInsights";
import { AIInsightCard } from "./AIInsightCard";

interface Props {
  enabled: boolean;
}

const dispatchAsk = (prompt: string) => {
  window.dispatchEvent(new CustomEvent("ai-assistant:ask", { detail: { prompt } }));
};

export const AIInsightsSection = ({ enabled }: Props) => {
  const { t } = useTranslation();
  const { insights, loading, reason } = useAIInsights(enabled);

  if (!enabled) return null;
  if (reason === "not_enough_data") return null;
  if (!loading && insights.length === 0) return null;

  return (
    <section className="mb-4">
      <div className="flex items-center gap-2 mb-2 px-1">
        <Lightbulb className="w-4 h-4 text-primary" />
        <h2 className="text-sm font-semibold text-foreground">{t("aiInsights.title")}</h2>
      </div>
      {loading && insights.length === 0 ? (
        <div className="space-y-2">
          {[0, 1, 2].map(i => (
            <div key={i} className="h-16 rounded-2xl bg-primary/5 animate-pulse border border-primary/10" />
          ))}
        </div>
      ) : (
        <div className="space-y-2">
          {insights.map((ins: AIInsight) => (
            <AIInsightCard key={ins.id} insight={ins} onClick={(i) => dispatchAsk(i.prompt)} />
          ))}
        </div>
      )}
    </section>
  );
};
