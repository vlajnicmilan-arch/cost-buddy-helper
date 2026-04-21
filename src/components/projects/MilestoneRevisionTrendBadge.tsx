import { History, TrendingUp, TrendingDown, Shield } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useCurrency } from '@/contexts/CurrencyContext';
import { cn } from '@/lib/utils';

interface MilestoneRevisionTrendBadgeProps {
  /** Number of recorded revisions for this milestone. */
  revisionCount: number;
  /** Net budget delta over the recent window (e.g. last 30 days). null = no recent activity. */
  recentTrend: { delta: number; count: number } | null;
  /** When true, render as a contingency-reserve status pill instead of a trend pill. */
  isContingency?: boolean;
  /** For contingency: original budget at creation. Falls back to current when missing. */
  contingencyOriginal?: number;
  /** For contingency: current remaining budget. */
  contingencyRemaining?: number;
  /** Click handler — opens the revisions history dialog. */
  onClick?: (e: React.MouseEvent) => void;
  /** Compact mode for tight Kanban cards (icon-only, no labels). */
  compact?: boolean;
  /**
   * Current budget usage percentage for this milestone (spent / budget * 100).
   * Drives an ambient glow:
   *   - >=100 → red pulsing glow (over budget)
   *   - >=80  → amber glow (near limit)
   * Ignored for contingency phases.
   */
  usagePct?: number;
}

/**
 * Small pill that summarises the revision history of a milestone:
 * - For regular phases: shows revision count + recent trend arrow
 * - For contingency phases: shows remaining/original ratio
 */
export const MilestoneRevisionTrendBadge = ({
  revisionCount,
  recentTrend,
  isContingency = false,
  contingencyOriginal,
  contingencyRemaining,
  onClick,
  compact = false,
}: MilestoneRevisionTrendBadgeProps) => {
  const { t } = useTranslation();
  const { formatAmount } = useCurrency();

  // Contingency pill: show how much of the reserve is still available
  if (isContingency) {
    const original = contingencyOriginal ?? contingencyRemaining ?? 0;
    const remaining = contingencyRemaining ?? 0;
    if (original <= 0) return null;
    const pct = Math.max(0, Math.min(100, (remaining / original) * 100));
    const lowReserve = pct < 25;

    return (
      <button
        type="button"
        onClick={onClick}
        className={cn(
          'inline-flex items-center gap-1 rounded-full border px-1.5 py-0.5 text-[10px] font-medium transition-colors',
          lowReserve
            ? 'border-destructive/40 bg-destructive/10 text-destructive hover:bg-destructive/15'
            : 'border-muted-foreground/30 bg-muted/40 text-muted-foreground hover:bg-muted/60'
        )}
        title={t('projects.revisions.reserveTooltip', 'Preostala rezerva')}
      >
        <Shield className="w-3 h-3" />
        {!compact && (
          <span>
            {formatAmount(remaining)}
            <span className="opacity-60"> / {formatAmount(original)}</span>
          </span>
        )}
        {compact && <span>{Math.round(pct)}%</span>}
      </button>
    );
  }

  // Regular milestone: nothing to show if there have never been revisions
  if (revisionCount === 0) return null;

  const delta = recentTrend?.delta ?? 0;
  const hasRecentChange = !!recentTrend && Math.abs(delta) > 0.001;
  const isOverrun = delta > 0;
  const TrendIcon = isOverrun ? TrendingUp : TrendingDown;

  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'inline-flex items-center gap-1 rounded-full border px-1.5 py-0.5 text-[10px] font-medium transition-colors',
        hasRecentChange
          ? isOverrun
            ? 'border-destructive/40 bg-destructive/10 text-destructive hover:bg-destructive/15'
            : 'border-income/40 bg-income/10 text-income hover:bg-income/15'
          : 'border-muted-foreground/30 bg-muted/40 text-muted-foreground hover:bg-muted/60'
      )}
      title={t('projects.revisions.viewHistory', 'Povijest promjena budžeta')}
    >
      <History className="w-3 h-3" />
      <span>{revisionCount}</span>
      {hasRecentChange && (
        <>
          <TrendIcon className="w-3 h-3" />
          {!compact && <span>{isOverrun ? '+' : ''}{formatAmount(delta)}</span>}
        </>
      )}
    </button>
  );
};
