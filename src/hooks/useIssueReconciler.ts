/**
 * useIssueReconciler
 * Mounts on the dashboard. Runs deterministic detectors, then upserts/auto-resolves
 * rows in `notifications` via SECURITY DEFINER RPCs.
 *
 * No AI calls. Throttled to once per 30s + reruns when input data changes.
 *
 * Cashflow risk detector is implemented in issueDetection but NOT yet wired here —
 * needs balance + recurring + installments aggregation (Phase 2).
 */
import { useEffect, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import {
  detectProjectLossZone,
  detectOverdueInvoices,
  detectBudgetBurn,
  reconcileIssues,
  type IssueType,
  type IssueCandidate,
} from "@/lib/issueDetection";
import { useUnpaidInvoices } from "@/hooks/useUnpaidInvoices";
import { useBudgets } from "@/hooks/useBudgets";
import type { Expense } from "@/types/expense";
import type { ProjectWithOwnership } from "@/types/project";

interface Params {
  enabled: boolean;
  projects: ProjectWithOwnership[];
  allExpenses: Expense[];
}

const MIN_INTERVAL_MS = 30_000;

export const useIssueReconciler = ({ enabled, projects, allExpenses }: Params) => {
  const { user } = useAuth();
  const { unpaid, loading: invoicesLoading } = useUnpaidInvoices();
  const { budgets, loading: budgetsLoading } = useBudgets();
  const lastRunRef = useRef<number>(0);
  const inFlightRef = useRef<boolean>(false);

  useEffect(() => {
    if (!enabled || !user) return;
    if (invoicesLoading || budgetsLoading) return;
    if (inFlightRef.current) return;
    const now = Date.now();
    if (now - lastRunRef.current < MIN_INTERVAL_MS) return;

    inFlightRef.current = true;
    lastRunRef.current = now;

    (async () => {
      try {
        const detectedByType: Partial<Record<IssueType, IssueCandidate[]>> = {
          project_loss_zone: detectProjectLossZone(projects, allExpenses),
          overdue_invoice: detectOverdueInvoices(unpaid),
          budget_burn: detectBudgetBurn(
            budgets.map(b => ({
              id: b.id,
              name: b.name,
              planned: Number(b.total_amount) || 0,
              spent: Number(b.spent) || 0,
            })),
          ),
        };

        const { toUpsert, resolveScopes } = reconcileIssues(detectedByType);

        // Upserts (sequential to keep within RLS rate)
        for (const candidate of toUpsert) {
          await (supabase as any).rpc("upsert_active_issue", {
            p_type: candidate.type,
            p_dedup_key: candidate.dedup_key,
            p_severity: candidate.severity,
            p_title: candidate.title_key,
            p_message: candidate.message_key,
            p_data: {
              title_vars: candidate.title_vars ?? {},
              message_vars: candidate.message_vars ?? {},
              ...(candidate.data ?? {}),
            },
            p_entity_type: candidate.entity_type ?? null,
            p_entity_id: candidate.entity_id ?? null,
          });
        }

        // Auto-resolve stale per type
        for (const scope of resolveScopes) {
          await (supabase as any).rpc("resolve_stale_issues", {
            p_type_prefix: scope.type,
            p_active_dedup_keys: scope.activeDedupKeys,
          });
        }

        // Notify listeners (ActiveIssuesSection) to refetch
        window.dispatchEvent(new CustomEvent("active-issues-changed"));
      } catch (err) {
        // Silent — reconciler is best-effort. Log for diagnostics only.
        console.error("[useIssueReconciler] failed", err);
      } finally {
        inFlightRef.current = false;
      }
    })();
  }, [
    enabled,
    user?.id,
    invoicesLoading,
    budgetsLoading,
    // Re-run when source data changes (count + first ids as cheap signature)
    projects.length,
    allExpenses.length,
    unpaid.length,
    budgets.length,
  ]);
};
