import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { useCurrency } from '@/contexts/CurrencyContext';
import { useMilestoneRevisions } from '@/hooks/useMilestoneRevisions';
import { ProjectMilestone } from '@/types/project';
import {
  MilestoneRevisionType,
  REVISION_TYPE_META,
} from '@/types/milestoneRevision';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import {
  History,
  TrendingUp,
  TrendingDown,
  Shield,
  AlertCircle,
  Loader2,
} from 'lucide-react';
import { format } from 'date-fns';
import { hr } from 'date-fns/locale';

interface ProjectRevisionsReportProps {
  projectId: string;
  milestones: ProjectMilestone[];
}

/**
 * Project-wide budget revisions report.
 * Aggregates all `milestone_budget_revisions` for a project and shows:
 *   - net delta + per-category totals (overrun / saving / scope_change / correction)
 *   - top phases with most revisions
 *   - contingency reserve usage
 *   - chronological feed of recent changes
 */
export const ProjectRevisionsReport = ({
  projectId,
  milestones,
}: ProjectRevisionsReportProps) => {
  const { t } = useTranslation();
  const { formatAmount } = useCurrency();
  const { revisions, loading } = useMilestoneRevisions(projectId);

  const milestoneById = useMemo(
    () => new Map(milestones.map((m) => [m.id, m])),
    [milestones]
  );
  const contingency = useMemo(
    () => milestones.find((m) => m.is_contingency) || null,
    [milestones]
  );

  /** Per-type totals — sum of POSITIVE deltas only (i.e. how much each category contributed to overruns).
   *  For 'saving' we take |delta| of negative deltas instead. */
  const typeTotals = useMemo(() => {
    const totals: Record<MilestoneRevisionType, { positive: number; negative: number; count: number }> = {
      overrun: { positive: 0, negative: 0, count: 0 },
      saving: { positive: 0, negative: 0, count: 0 },
      scope_change: { positive: 0, negative: 0, count: 0 },
      correction: { positive: 0, negative: 0, count: 0 },
    };
    revisions.forEach((r) => {
      const type = (r.change_type || 'correction') as MilestoneRevisionType;
      const delta = Number(r.delta) || 0;
      if (delta > 0) totals[type].positive += delta;
      else totals[type].negative += Math.abs(delta);
      totals[type].count += 1;
    });
    return totals;
  }, [revisions]);

  /** Aggregate per-milestone activity for "top changed" ranking. */
  const topMilestones = useMemo(() => {
    const map = new Map<string, { count: number; net: number }>();
    revisions.forEach((r) => {
      const cur = map.get(r.milestone_id) || { count: 0, net: 0 };
      cur.count += 1;
      cur.net += Number(r.delta) || 0;
      map.set(r.milestone_id, cur);
    });
    return Array.from(map.entries())
      .map(([id, v]) => ({
        id,
        name: milestoneById.get(id)?.name || t('projects.revisions.unknownPhase', 'Nepoznata faza'),
        isContingency: !!milestoneById.get(id)?.is_contingency,
        ...v,
      }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 5);
  }, [revisions, milestoneById, t]);

  /** Contingency usage = how much of the original reserve was consumed (transferred out).
   *  We approximate the original by adding back the absolute negative deltas applied to it. */
  const contingencyStats = useMemo(() => {
    if (!contingency) return null;
    const reserveRevs = revisions.filter((r) => r.milestone_id === contingency.id);
    const totalDrawn = reserveRevs.reduce(
      (sum, r) => sum + Math.max(0, -(Number(r.delta) || 0)),
      0
    );
    const remaining = contingency.budget;
    const original = remaining + totalDrawn;
    const pct = original > 0 ? Math.min(100, (totalDrawn / original) * 100) : 0;
    return { original, remaining, totalDrawn, pct };
  }, [contingency, revisions]);

  // Net change across the entire project (sum of deltas on primary milestones; counter-revisions cancel out)
  const netDelta = useMemo(
    () =>
      revisions
        .filter((r) => !r.linked_revision_id) // exclude linked counter-revisions to avoid double-counting
        .reduce((sum, r) => sum + (Number(r.delta) || 0), 0),
    [revisions]
  );
  const totalOverruns = typeTotals.overrun.positive + typeTotals.scope_change.positive;

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (revisions.length === 0) {
    return (
      <div className="text-center py-12 text-muted-foreground">
        <History className="w-12 h-12 mx-auto mb-2 opacity-50" />
        <p>{t('projects.revisions.empty', 'Nema zabilježenih promjena.')}</p>
        <p className="text-xs mt-2">
          {t(
            'projects.revisions.emptyHint',
            'Svaka izmjena budžeta faze automatski se bilježi ovdje za potpunu transparentnost.'
          )}
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Summary cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="p-3 rounded-lg border bg-muted/30 text-center">
          <p className="text-2xl font-bold">{revisions.length}</p>
          <p className="text-xs text-muted-foreground">
            {t('projects.revisions.totalChanges', 'Promjena ukupno')}
          </p>
        </div>
        <div
          className={cn(
            'p-3 rounded-lg border text-center',
            netDelta > 0
              ? 'bg-destructive/10 border-destructive/30'
              : netDelta < 0
              ? 'bg-income/10 border-income/30'
              : 'bg-muted/30'
          )}
        >
          <p
            className={cn(
              'text-2xl font-bold flex items-center justify-center gap-1',
              netDelta > 0 ? 'text-destructive' : netDelta < 0 ? 'text-income' : ''
            )}
          >
            {netDelta > 0 && <TrendingUp className="w-5 h-5" />}
            {netDelta < 0 && <TrendingDown className="w-5 h-5" />}
            {netDelta > 0 ? '+' : ''}
            {formatAmount(netDelta)}
          </p>
          <p className="text-xs text-muted-foreground">
            {t('projects.revisions.netChange', 'Neto promjena')}
          </p>
        </div>
        <div className="p-3 rounded-lg border bg-destructive/10 border-destructive/30 text-center">
          <p className="text-2xl font-bold text-destructive">
            {formatAmount(totalOverruns)}
          </p>
          <p className="text-xs text-muted-foreground">
            {t('projects.revisions.totalOverruns', 'Ukupni premašaji')}
          </p>
        </div>
        <div className="p-3 rounded-lg border bg-income/10 border-income/30 text-center">
          <p className="text-2xl font-bold text-income">
            {formatAmount(typeTotals.saving.negative)}
          </p>
          <p className="text-xs text-muted-foreground">
            {t('projects.revisions.totalSavings', 'Ukupne uštede')}
          </p>
        </div>
      </div>

      {/* Per-category breakdown */}
      <div className="p-4 rounded-lg border space-y-3">
        <h3 className="font-medium flex items-center gap-2">
          <AlertCircle className="w-4 h-4" />
          {t('projects.revisions.byCategory', 'Po kategoriji promjene')}
        </h3>
        <div className="space-y-2">
          {(Object.keys(typeTotals) as MilestoneRevisionType[]).map((type) => {
            const meta = REVISION_TYPE_META[type];
            const data = typeTotals[type];
            const displayAmount = type === 'saving' ? data.negative : data.positive;
            if (data.count === 0) return null;
            return (
              <div
                key={type}
                className="flex items-center justify-between p-2 rounded-md bg-muted/30"
              >
                <div className="flex items-center gap-2 min-w-0">
                  <span className="text-base">{meta.emoji}</span>
                  <span className="text-sm font-medium">
                    {t(`projects.revisions.types.${type}`)}
                  </span>
                  <Badge variant="secondary" className="text-[10px]">
                    {data.count}
                  </Badge>
                </div>
                <span
                  className={cn(
                    'font-mono text-sm font-medium',
                    type === 'saving' ? 'text-income' : 'text-destructive'
                  )}
                >
                  {type === 'saving' ? '-' : '+'}
                  {formatAmount(displayAmount)}
                </span>
              </div>
            );
          })}
        </div>

        {/* Argument-builder line: how much of the overruns is attributable to scope changes */}
        {totalOverruns > 0 && typeTotals.scope_change.positive > 0 && (
          <p className="text-xs text-muted-foreground pt-2 border-t">
            {t(
              'projects.revisions.scopeArgument',
              'Od {{total}} premašaja, {{scope}} otpada na promjene opsega — argument za dodatnu naplatu prema klijentu.',
              {
                total: formatAmount(totalOverruns),
                scope: formatAmount(typeTotals.scope_change.positive),
              }
            )}
          </p>
        )}
      </div>

      {/* Contingency usage */}
      {contingencyStats && (
        <div className="p-4 rounded-lg border border-dashed border-muted-foreground/40 bg-muted/20 space-y-2">
          <div className="flex items-center justify-between">
            <h3 className="font-medium flex items-center gap-2">
              <Shield className="w-4 h-4 text-muted-foreground" />
              {t('projects.revisions.reserveUsage', 'Iskorištenost rezerve')}
            </h3>
            <span className="text-sm font-mono">
              {formatAmount(contingencyStats.totalDrawn)}
              <span className="opacity-60">
                {' '}
                / {formatAmount(contingencyStats.original)}
              </span>
            </span>
          </div>
          <Progress
            value={contingencyStats.pct}
            className={cn(
              'h-2',
              contingencyStats.pct >= 75 && '[&>div]:bg-destructive'
            )}
          />
          <p className="text-xs text-muted-foreground">
            {contingencyStats.pct >= 100
              ? t('projects.revisions.reserveExhausted', 'Rezerva je u potpunosti iskorištena.')
              : t('projects.revisions.reserveRemaining', 'Preostalo {{amt}} za nepredviđene troškove.', {
                  amt: formatAmount(contingencyStats.remaining),
                })}
          </p>
        </div>
      )}

      {/* Top changed phases */}
      {topMilestones.length > 0 && (
        <div className="p-4 rounded-lg border space-y-2">
          <h3 className="font-medium">
            {t('projects.revisions.topChanged', 'Faze s najviše promjena')}
          </h3>
          {topMilestones.map((m) => (
            <div
              key={m.id}
              className="flex items-center justify-between p-2 rounded-md bg-muted/30"
            >
              <div className="flex items-center gap-2 min-w-0">
                {m.isContingency && <Shield className="w-3.5 h-3.5 text-muted-foreground shrink-0" />}
                <span className="text-sm truncate">{m.name}</span>
                <Badge variant="outline" className="text-[10px] shrink-0">
                  {m.count}×
                </Badge>
              </div>
              <span
                className={cn(
                  'text-xs font-mono shrink-0',
                  m.net > 0 ? 'text-destructive' : m.net < 0 ? 'text-income' : 'text-muted-foreground'
                )}
              >
                {m.net > 0 ? '+' : ''}
                {formatAmount(m.net)}
              </span>
            </div>
          ))}
        </div>
      )}

      {/* Chronological feed */}
      <div className="p-4 rounded-lg border space-y-2">
        <h3 className="font-medium">
          {t('projects.revisions.recentActivity', 'Kronologija promjena')}
        </h3>
        <div className="space-y-2 max-h-96 overflow-y-auto">
          {revisions.slice(0, 30).map((r) => {
            const milestone = milestoneById.get(r.milestone_id);
            const delta = Number(r.delta) || 0;
            const meta = r.change_type ? REVISION_TYPE_META[r.change_type] : null;
            return (
              <div
                key={r.id}
                className="p-2 rounded-md border bg-card text-sm"
              >
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <div className="flex items-center gap-2 min-w-0">
                    {meta && <span>{meta.emoji}</span>}
                    <span className="font-medium truncate">
                      {milestone?.name || t('projects.revisions.unknownPhase', 'Nepoznata faza')}
                    </span>
                    {r.coverage && (
                      <Badge variant="secondary" className="text-[10px]">
                        {t(`projects.revisions.coverageShort.${r.coverage}`)}
                      </Badge>
                    )}
                  </div>
                  <span
                    className={cn(
                      'font-mono text-xs shrink-0',
                      delta > 0 ? 'text-destructive' : delta < 0 ? 'text-income' : 'text-muted-foreground'
                    )}
                  >
                    {delta > 0 ? '+' : ''}
                    {formatAmount(delta)}
                  </span>
                </div>
                <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{r.reason}</p>
                <p className="text-[10px] text-muted-foreground mt-0.5">
                  {format(new Date(r.created_at), 'd. MMM yyyy. HH:mm', { locale: hr })}
                </p>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};
