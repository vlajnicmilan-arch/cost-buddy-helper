import { Lightbulb, TrendingDown, TrendingUp, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";
import { clickableProps } from "@/lib/a11y";
import type { AIInsight } from "@/hooks/useAIInsights";

interface Props {
  insight: AIInsight;
  onClick: (insight: AIInsight) => void;
}

const iconFor = (severity: AIInsight["severity"]) => {
  switch (severity) {
    case "warning": return TrendingUp;
    case "positive": return TrendingDown;
    default: return Lightbulb;
  }
};

const accentFor = (severity: AIInsight["severity"]) => {
  switch (severity) {
    case "warning": return "text-destructive";
    case "positive": return "text-income";
    default: return "text-primary";
  }
};

export const AIInsightCard = ({ insight, onClick }: Props) => {
  const Icon = iconFor(insight.severity);
  const accent = accentFor(insight.severity);
  return (
    <div
      {...clickableProps(() => onClick(insight), {
        label: insight.title,
        className: cn(
          "min-h-[44px] w-full rounded-2xl p-3 text-left transition-colors",
          "bg-primary/5 hover:bg-primary/10 border border-primary/15",
          "flex items-start gap-3",
        ),
      })}
    >
      <div className={cn("shrink-0 w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center", accent)}>
        <Icon className="w-4 h-4" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm leading-snug text-foreground">{insight.title}</p>
        <p className="text-[11px] text-muted-foreground mt-1 flex items-center gap-1">
          <Sparkles className="w-3 h-3" />
          <span>AI</span>
        </p>
      </div>
    </div>
  );
};
