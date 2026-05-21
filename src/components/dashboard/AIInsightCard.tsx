import { Lightbulb, TrendingDown, TrendingUp, AlertTriangle, AlertCircle, Sparkles, CheckCircle2 } from "lucide-react";
import { useTranslation } from "react-i18next";
import { cn } from "@/lib/utils";
import { clickableProps } from "@/lib/a11y";
import type { AIInsight, AISeverity } from "@/hooks/useAIInsights";

interface Props {
  insight: AIInsight;
  onClick: (insight: AIInsight) => void;
}

const iconFor = (insight: AIInsight) => {
  if (insight.severity === "critical") return AlertCircle;
  if (insight.severity === "warning") return AlertTriangle;
  if (insight.severity === "positive") return TrendingDown;
  if (insight.type?.startsWith("data_quality")) return CheckCircle2;
  if (insight.type?.includes("trend")) return TrendingUp;
  return Lightbulb;
};

const SEVERITY: Record<AISeverity, { border: string; icon: string; bg: string }> = {
  critical: { border: "border-l-destructive", icon: "text-destructive", bg: "bg-destructive/5" },
  warning:  { border: "border-l-warning",     icon: "text-warning",     bg: "bg-warning/5" },
  info:     { border: "border-l-primary",     icon: "text-primary",     bg: "bg-primary/5" },
  positive: { border: "border-l-income",      icon: "text-income",      bg: "bg-income/5" },
};

export const AIInsightCard = ({ insight, onClick }: Props) => {
  const { t } = useTranslation();
  const Icon = iconFor(insight);
  const sev = SEVERITY[insight.severity] ?? SEVERITY.info;
  const sourceLabel = insight.source === "local" ? t("attention.local") : t("attention.ai");
  const SourceIcon = insight.source === "local" ? CheckCircle2 : Sparkles;

  return (
    <div
      {...clickableProps(() => onClick(insight), {
        label: insight.title,
        className: cn(
          "min-h-[44px] w-full rounded-xl px-3 py-2 text-left transition-colors",
          "border border-border/40 border-l-4",
          sev.border,
          sev.bg,
          "hover:bg-muted/40 flex items-start gap-2.5",
        ),
      })}
    >
      <div className={cn("shrink-0 mt-0.5", sev.icon)}>
        <Icon className="w-4 h-4" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm leading-snug text-foreground">{insight.title}</p>
        <p className="text-[10px] text-muted-foreground mt-0.5 flex items-center gap-1">
          <SourceIcon className="w-2.5 h-2.5" />
          <span>{sourceLabel}</span>
        </p>
      </div>
    </div>
  );
};
