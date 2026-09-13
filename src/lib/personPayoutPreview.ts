/**
 * Person-level period preview: sums the existing per-engagement
 * `preview_worker_payout` RPC across all of a person's engagements.
 *
 * Read-only — the same calculation `useWorkerPayouts.previewPayout` uses on
 * the per-project screen, only aggregated per person. Nothing is written.
 */
import { supabase } from '@/integrations/supabase/client';
import { round2, type EngagementObligation } from './personPayout';

export interface EngagementPeriodPreview {
  engagementId: string;
  projectId: string | null;
  hours: number;
  gross: number;
}

/** Pure sum of per-engagement gross amounts (rounded to 2 decimals). */
export const sumEngagementPreviews = (previews: readonly { gross: number }[]): number =>
  round2(previews.reduce((sum, p) => sum + (Number(p.gross) || 0), 0));

/**
 * Preview one engagement's earnings in a period via the existing
 * `preview_worker_payout` RPC. Returns null on failure (caller skips it).
 */
export const previewEngagementPeriod = async (
  engagementId: string,
  projectId: string,
  periodStart: string,
  periodEnd: string,
): Promise<{ hours: number; gross: number } | null> => {
  try {
    const { data, error } = await supabase.rpc('preview_worker_payout', {
      p_worker_id: engagementId,
      p_project_id: projectId,
      p_period_start: periodStart,
      p_period_end: periodEnd,
    });
    if (error) throw error;
    const raw = (data ?? { hours: 0, gross: 0 }) as { hours?: unknown; gross?: unknown };
    return { hours: Number(raw.hours ?? 0) || 0, gross: Number(raw.gross ?? 0) || 0 };
  } catch (err) {
    // eslint-disable-next-line no-console
    console.warn('[personPayoutPreview] preview failed', err);
    return null;
  }
};

/**
 * Sums (hours × rate) across all of the person's engagements for a period.
 * Engagements without a project or with a failed preview contribute 0.
 */
export const previewPersonPeriod = async (
  obligations: readonly EngagementObligation[],
  periodStart: string,
  periodEnd: string,
): Promise<{ total: number; items: EngagementPeriodPreview[] }> => {
  const results = await Promise.all(
    obligations.map(async (o): Promise<EngagementPeriodPreview> => {
      if (!o.projectId) {
        return { engagementId: o.engagementId, projectId: o.projectId, hours: 0, gross: 0 };
      }
      const preview = await previewEngagementPeriod(o.engagementId, o.projectId, periodStart, periodEnd);
      return {
        engagementId: o.engagementId,
        projectId: o.projectId,
        hours: preview?.hours ?? 0,
        gross: preview?.gross ?? 0,
      };
    }),
  );
  return { total: sumEngagementPreviews(results), items: results };
};
