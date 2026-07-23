import { useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { AlertCircle, AlertTriangle, Lightbulb, FolderOpen, FileText, MessageCircle, Target, ChevronRight, X } from "lucide-react";
import { useActiveIssues, type ActiveIssue, type IssueSeverity } from "@/hooks/useActiveIssues";
import { useIssueReconciler } from "@/hooks/useIssueReconciler";
import { cn } from "@/lib/utils";
import { clickableProps } from "@/lib/a11y";
import type { Expense } from "@/types/expense";
import type { ProjectWithOwnership } from "@/types/project";
import { useModuleGate } from "@/hooks/useModuleGate";

interface Props {
  enabled: boolean;
  projects: ProjectWithOwnership[];
  allExpenses: Expense[];
}

const SEVERITY: Record<IssueSeverity, { border: string; icon: string; bg: string }> = {
  critical: { border: "border-l-destructive", icon: "text-destructive", bg: "bg-destructive/5" },
  warning:  { border: "border-l-warning",     icon: "text-warning",     bg: "bg-warning/5" },
  info:     { border: "border-l-primary",     icon: "text-primary",     bg: "bg-primary/5" },
};

const iconFor = (issue: ActiveIssue) => {
  if (issue.severity === "critical") return AlertCircle;
  if (issue.severity === "warning") return AlertTriangle;
  return Lightbulb;
};

const renderText = (
  raw: string,
  vars: Record<string, unknown> | undefined,
  t: (k: string, v?: Record<string, unknown>) => string,
): string => {
  // If `raw` looks like an i18n key (no spaces, contains dots), translate.
  // Otherwise treat as legacy plain text.
  if (raw && !raw.includes(" ") && raw.includes(".")) {
    return t(raw, vars ?? {});
  }
  return raw;
};

const HARD_CAP = 5;

export const ActiveIssuesSection = ({ enabled, projects, allExpenses }: Props) => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { requestModule } = useModuleGate();

  // Runs detection + upsert on mount and when data changes
  useIssueReconciler({ enabled, projects, allExpenses });

  const { issues, loading, dismiss } = useActiveIssues(enabled);

  const handleAction = useCallback((issue: ActiveIssue) => {
    if (issue.entity_type === "project" && issue.entity_id) {
      requestModule('projects', {
        onGranted: () => navigate("/projects", { state: { openProjectId: issue.entity_id, from: "/home" } }),
      });
      return;
    }
    if (issue.entity_type === "budget" && issue.entity_id) {
      navigate("/budgets", { state: { openBudgetId: issue.entity_id, from: "/home" } });
      return;
    }
    if (issue.entity_type === "invoice" && issue.entity_id) {
      // No direct invoice route — open AI chat with context as fallback
      const titleVars = (issue.data?.title_vars as Record<string, unknown>) ?? {};
      const msg = `${renderText(issue.title, titleVars, t)} — ${renderText(issue.message, (issue.data?.message_vars as Record<string, unknown>) ?? {}, t)}`;
      window.dispatchEvent(new CustomEvent("ai-assistant:ask", { detail: { prompt: msg } }));
      return;
    }
    // Fallback for unknown entity types: open AI chat with the issue text
    const titleVars = (issue.data?.title_vars as Record<string, unknown>) ?? {};
    const msg = `${renderText(issue.title, titleVars, t)} — ${renderText(issue.message, (issue.data?.message_vars as Record<string, unknown>) ?? {}, t)}`;
    window.dispatchEvent(new CustomEvent("ai-assistant:ask", { detail: { prompt: msg } }));
  }, [navigate, requestModule, t]);

  if (!enabled) return null;
  if (!loading && issues.length === 0) return null;

  const visible = issues.slice(0, HARD_CAP);

  return (
    <section className="mb-4">
      <div className="flex items-center gap-2 mb-2 px-1">
        <AlertCircle className="w-4 h-4 text-module-muted" />
        <h2 className="text-sm font-semibold text-module-muted">{t("attention.title")}</h2>
      </div>
      {loading && issues.length === 0 ? (
        <div className="space-y-1.5">
          {[0, 1].map(i => (
            <div key={i} className="h-12 rounded-xl bg-muted/40 animate-pulse border border-border/30" />
          ))}
        </div>
      ) : (
        <div className="space-y-1.5">
          {visible.map((issue) => {
            const sev = SEVERITY[issue.severity] ?? SEVERITY.info;
            const Icon = iconFor(issue);
            const titleVars = (issue.data?.title_vars as Record<string, unknown>) ?? {};
            const messageVars = (issue.data?.message_vars as Record<string, unknown>) ?? {};
            const ActionIcon =
              issue.entity_type === "project" ? FolderOpen :
              issue.entity_type === "budget" ? Target :
              issue.entity_type === "invoice" ? FileText : MessageCircle;
            const actionLabel =
              issue.entity_type === "project" ? t("attention.actions.openProject") :
              issue.entity_type === "budget" ? t("attention.actions.openBudget", "Otvori budžet") :
              issue.entity_type === "invoice" ? t("attention.actions.openInvoice") :
              t("attention.actions.askAi");

            return (
              <div
                key={issue.id}
                className={cn(
                  "min-h-[44px] w-full rounded-xl px-3 py-2 transition-colors",
                  "border border-border/40 border-l-4",
                  sev.border, sev.bg,
                  "flex items-center gap-2.5",
                )}
              >
                <div className={cn("shrink-0", sev.icon)}>
                  <Icon className="w-4 h-4" />
                </div>
                <div
                  {...clickableProps(() => handleAction(issue), {
                    label: renderText(issue.title, titleVars, t),
                    className: "flex-1 min-w-0 text-left hover:opacity-80 transition-opacity",
                  })}
                >
                  <p className="text-sm leading-snug text-foreground">
                    {renderText(issue.title, titleVars, t)}
                  </p>
                  <p className="text-[11px] text-muted-foreground mt-0.5">
                    {renderText(issue.message, messageVars, t)}
                  </p>
                </div>
                <div className={cn("shrink-0 flex items-center gap-1 text-[11px] font-medium", sev.icon)}>
                  <ActionIcon className="w-3 h-3" />
                  <ChevronRight className="w-3 h-3 opacity-60" />
                </div>
                <button
                  type="button"
                  onClick={() => dismiss(issue.id)}
                  aria-label={t("attention.actions.dismiss")}
                  className="shrink-0 min-h-[44px] min-w-[44px] -mr-2 inline-flex items-center justify-center text-muted-foreground hover:text-foreground rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
};
