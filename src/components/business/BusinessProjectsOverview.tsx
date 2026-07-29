import React, { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { motion } from 'framer-motion';
import { FolderKanban, ChevronRight, Plus } from 'lucide-react';
import { useProjects } from '@/hooks/useProjects';
import { useActiveProjectsSummary } from '@/hooks/useActiveProjectsSummary';
import { calculateContractValue } from '@/lib/projectCalculations';
import { useCurrency } from '@/contexts/CurrencyContext';
import { useHaptics } from '@/hooks/useHaptics';
import { DEFAULT_PROJECT_COLORS } from '@/types/project';
import { cn } from '@/lib/utils';

interface BusinessProjectsOverviewProps {
  /** Navigates to the business "projects" tab. */
  onViewAll: () => void;
}

const MAX_VISIBLE = 6;

type Health = 'green' | 'yellow' | 'red' | 'neutral';

const healthFromUsage = (usedPct: number | null): Health => {
  if (usedPct === null) return 'neutral';
  if (usedPct > 100) return 'red';
  if (usedPct >= 80) return 'yellow';
  return 'green';
};

const HEALTH_COLOR: Record<Health, string> = {
  green: 'hsl(var(--income))',
  yellow: 'hsl(var(--warning))',
  red: 'hsl(var(--destructive))',
  neutral: 'hsl(var(--muted-foreground))',
};

const HEALTH_TEXT: Record<Health, string> = {
  green: 'text-income',
  yellow: 'text-warning',
  red: 'text-destructive',
  neutral: 'text-muted-foreground',
};

/**
 * Business dashboard — vertical list of active projects with cumulative
 * spend vs contracted budget, usage % and margin.
 *
 * Scoping: `useProjects()` already filters by the active business profile
 * (`business_profile_id === activeBusinessProfileId`), so no extra fetch is needed.
 * Totals come from `useActiveProjectsSummary` — the same source the personal
 * `ActiveProjectsStrip` uses (cumulative, all-time, approved rows only).
 */
export const BusinessProjectsOverview = React.memo(({ onViewAll }: BusinessProjectsOverviewProps) => {
  const { t } = useTranslation();
  const { projects, loading } = useProjects();
  const { formatAmount } = useCurrency();
  const { lightTap } = useHaptics();

  const activeProjects = useMemo(
    () => projects.filter(p => p.status === 'active' || p.status === 'draft').slice(0, MAX_VISIBLE),
    [projects]
  );

  const activeIds = useMemo(() => activeProjects.map(p => p.id), [activeProjects]);
  const { summary } = useActiveProjectsSummary(activeIds);

  const rows = useMemo(
    () =>
      activeProjects.map((p, idx) => {
        const spent = summary.get(p.id)?.spent ?? 0;
        const budget = calculateContractValue(p);
        const hasBudget = budget > 0;
        const usedPct = hasBudget ? (spent / budget) * 100 : null;
        const margin = hasBudget ? (budget - spent) / budget : null;
        return {
          project: p,
          spent,
          budget,
          hasBudget,
          usedPct,
          margin,
          profit: budget - spent,
          health: healthFromUsage(usedPct),
          color: p.color || DEFAULT_PROJECT_COLORS[idx % DEFAULT_PROJECT_COLORS.length],
        };
      }),
    [activeProjects, summary]
  );

  const handleViewAll = () => {
    lightTap();
    onViewAll();
  };

  const header = (
    <div className="flex items-center justify-between mb-3 px-1">
      <h2 className="text-base font-semibold flex items-center gap-2">
        <FolderKanban className="w-4 h-4 text-primary" />
        {t('business.dashboard.activeProjects', 'Aktivni projekti')}
        {rows.length > 0 && (
          <span className="text-xs font-normal text-muted-foreground">({rows.length})</span>
        )}
      </h2>
      <button
        onClick={handleViewAll}
        className="text-xs text-primary hover:underline flex items-center gap-1"
      >
        {t('business.dashboard.viewAllProjects', 'Pogledaj sve')}
        <ChevronRight className="w-3 h-3" />
      </button>
    </div>
  );

  if (loading && rows.length === 0) {
    return (
      <div className="mb-6">
        {header}
        <div className="space-y-2">
          {[1, 2].map(i => (
            <div key={i} className="h-[74px] rounded-2xl bg-muted/30 animate-pulse" />
          ))}
        </div>
      </div>
    );
  }

  if (rows.length === 0) {
    return (
      <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="mb-6">
        {header}
        <button
          onClick={handleViewAll}
          className="w-full p-4 rounded-2xl border border-dashed border-primary/30 bg-primary/5 hover:bg-primary/10 transition-colors flex items-center justify-between text-left"
        >
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-primary/15 flex items-center justify-center">
              <Plus className="w-5 h-5 text-primary" />
            </div>
            <div>
              <p className="font-medium text-sm text-foreground">
                {t('business.dashboard.noActiveProjects', 'Nema aktivnih projekata')}
              </p>
              <p className="text-xs text-muted-foreground mt-0.5">
                {t('business.dashboard.openProjects', 'Otvori projekte')}
              </p>
            </div>
          </div>
          <ChevronRight className="w-4 h-4 text-muted-foreground" />
        </button>
      </motion.div>
    );
  }

  return (
    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="mb-6">
      {header}
      <div className="space-y-2">
        {rows.map(row => {
          const accent = HEALTH_COLOR[row.health];
          const barPct = row.usedPct === null ? 0 : Math.max(0, Math.min(100, row.usedPct));
          return (
            <div
              key={row.project.id}
              className="rounded-2xl bg-card border border-border/60 p-3 shadow-[var(--shadow-premium-accent,none)]"
              style={{ ['--card-accent' as string]: row.color, borderLeft: `3px solid ${row.color}` }}
            >
              <div className="flex items-start justify-between gap-2">
                <p className="font-medium text-sm truncate">{row.project.name}</p>
                {row.margin !== null && (
                  <span className={cn('text-xs font-semibold shrink-0', HEALTH_TEXT[row.health])}>
                    {t('business.dashboard.marginShort', 'Marža')} {Math.round(row.margin * 100)}%
                  </span>
                )}
              </div>

              <p className="text-xs text-muted-foreground mt-1">
                {row.hasBudget
                  ? t('business.dashboard.spentOfBudget', '{{spent}} od {{budget}}', {
                      spent: formatAmount(row.spent),
                      budget: formatAmount(row.budget),
                    })
                  : t('business.dashboard.spentNoBudget', 'Potrošeno {{spent}}', {
                      spent: formatAmount(row.spent),
                    })}
                {row.usedPct !== null && (
                  <span className={cn('ml-1 font-medium', HEALTH_TEXT[row.health])}>
                    · {Math.round(row.usedPct)}%
                  </span>
                )}
              </p>

              <div className="h-[3px] w-full rounded-full bg-muted/50 mt-2 overflow-hidden">
                <div
                  className="h-full rounded-full transition-all"
                  style={{ width: `${barPct}%`, backgroundColor: accent }}
                />
              </div>

              {row.hasBudget && (
                <p className="text-[11px] mt-1.5">
                  <span className="text-muted-foreground">
                    {t('business.dashboard.profit', 'Zarada')}:{' '}
                  </span>
                  <span className={row.profit >= 0 ? 'text-income font-medium' : 'text-destructive font-medium'}>
                    {row.profit >= 0 ? '+' : '−'}
                    {formatAmount(Math.abs(row.profit))}
                  </span>
                </p>
              )}
            </div>
          );
        })}
      </div>
    </motion.div>
  );
});

BusinessProjectsOverview.displayName = 'BusinessProjectsOverview';
