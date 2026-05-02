import React, { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { motion } from 'framer-motion';
import { FolderKanban, Plus, ChevronRight, AlertTriangle, AlertOctagon, Sparkles, Clock, Pause, Info, AlertCircle } from 'lucide-react';
import { ProjectWithOwnership, DEFAULT_PROJECT_COLORS } from '@/types/project';
import { useFeatureAccess } from '@/hooks/useFeatureAccess';
import { useHaptics } from '@/hooks/useHaptics';
import { useCurrency } from '@/contexts/CurrencyContext';
import { useActiveProjectsSummary } from '@/hooks/useActiveProjectsSummary';
import { cn } from '@/lib/utils';
import { getProjectStatusLine, type StatusLine } from '@/lib/projectStatusLine';

const STATUS_ICON_MAP = { Sparkles, Clock, Pause, Info, AlertCircle } as const;

interface ActiveProjectsStripProps {
  projects: ProjectWithOwnership[];
  isLocalMode: boolean;
  simpleModeEnabled: boolean;
  isBusinessMode: boolean;
  loading?: boolean;
}

const MAX_VISIBLE = 5;

type HealthLevel = 'green' | 'yellow' | 'red';
type KpiKind = 'profit' | 'loss' | 'remaining' | 'overBudget' | 'items';

interface ProjectCardData {
  project: ProjectWithOwnership;
  spent: number;
  income: number;
  profit: number;
  remaining: number;
  txCount: number;
  health: HealthLevel;
  /** Profit margin as ratio (profit / income). null when no income reference exists. */
  margin: number | null;
  kpiKind: KpiKind;
  kpiValue: number;
  statusLine: StatusLine | null;
}

/**
 * Big horizontal traffic light — visual centerpiece of the project card.
 * Only the active dot is fully lit; yellow/red dots emotionally pulse
 * (slow for warning, fast for critical).
 */
const BigTrafficLight = React.forwardRef<HTMLDivElement, { level: HealthLevel; label: string }>(
  ({ level, label }, ref) => {
    const dot = (active: boolean, color: string, pulseClass = '') => (
      <div
        className={cn(
          'w-3.5 h-3.5 rounded-full transition-all',
          active && pulseClass
        )}
        style={{
          backgroundColor: color,
          opacity: active ? 1 : 0.18,
          boxShadow: active ? `0 0 10px ${color}` : 'none',
        }}
      />
    );
    return (
      <div
        ref={ref}
        className="inline-flex items-center gap-1.5 px-2 py-1.5 rounded-full bg-foreground/5 border border-border/50"
        aria-label={label}
        role="img"
        title={label}
      >
        {dot(level === 'green', 'hsl(var(--income))')}
        {dot(level === 'yellow', 'hsl(var(--warning))', 'traffic-dot-warn')}
        {dot(level === 'red', 'hsl(var(--destructive))', 'traffic-dot-crit')}
      </div>
    );
  }
);
BigTrafficLight.displayName = 'BigTrafficLight';

export const ActiveProjectsStrip = React.memo(({
  projects,
  isLocalMode,
  simpleModeEnabled,
  isBusinessMode,
  loading,
}: ActiveProjectsStripProps) => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { hasAccess } = useFeatureAccess();
  const { lightTap } = useHaptics();
  const { formatAmount } = useCurrency();

  // IMPORTANT: hooks MUST be called before any early return (Rules of Hooks)
  const activeIds = useMemo(
    () =>
      projects
        .filter(p => p.status === 'active' || p.status === 'draft')
        .slice(0, MAX_VISIBLE)
        .map(p => p.id),
    [projects]
  );

  const { summary, loading: summaryLoading } = useActiveProjectsSummary(activeIds);

  const activeProjects: ProjectCardData[] = useMemo(() => {
    const active = projects.filter(p => p.status === 'active' || p.status === 'draft');
    return active.slice(0, MAX_VISIBLE).map(p => {
      const entry = summary.get(p.id);
      const spent = entry?.spent ?? 0;
      const income = entry?.income ?? 0;
      const txCount = entry?.txCount ?? 0;
      const profit = income - spent;
      const budget = p.total_budget || 0;
      const remaining = budget - spent;

      const hasIncome = income > 0;
      const hasBudget = budget > 0;

      // Profit-margin–based health (per user request):
      //  - margin >= 30% → green
      //  - 10% <= margin < 30% → yellow (warning + AI hint)
      //  - margin < 10% → red (critical + AI alert)
      // Reference for margin: realised income if any, else budget.
      let margin: number | null = null;
      let health: HealthLevel = 'green';
      if (hasIncome) {
        margin = profit / income;
      } else if (hasBudget) {
        // Treat budget as expected revenue baseline; project still in spend phase.
        margin = (budget - spent) / budget;
      }
      if (margin !== null) {
        if (margin < 0.10) health = 'red';
        else if (margin < 0.30) health = 'yellow';
        else health = 'green';
      }

      // KPI selection (kept for projects without income/budget)
      let kpiKind: KpiKind;
      let kpiValue: number;
      if (hasIncome) {
        kpiKind = profit >= 0 ? 'profit' : 'loss';
        kpiValue = profit;
      } else if (hasBudget && spent > budget) {
        kpiKind = 'overBudget';
        kpiValue = spent - budget;
      } else if (hasBudget) {
        kpiKind = 'remaining';
        kpiValue = remaining;
      } else {
        kpiKind = 'items';
        kpiValue = txCount;
      }

      const statusLine = getProjectStatusLine(
        {
          status: p.status,
          start_date: p.start_date,
          end_date: p.end_date,
          income,
          spent,
          budget,
          margin,
          txCount,
          health,
        },
        t,
      );

      return { project: p, spent, income, profit, remaining, txCount, health, margin, kpiKind, kpiValue, statusLine };
    });
  }, [projects, summary, t]);

  // Early returns AFTER all hooks
  if (simpleModeEnabled || isLocalMode || isBusinessMode) return null;
  if (!hasAccess('projects')) return null;

  const handleNav = (path: string) => {
    lightTap();
    navigate(path);
  };

  // Loading skeleton
  if (loading || (activeIds.length > 0 && summaryLoading && summary.size === 0)) {
    return (
      <div className="mb-6">
        <div className="flex items-center justify-between mb-3 px-1">
          <div className="h-5 w-32 bg-muted/50 rounded animate-pulse" />
        </div>
        <div className="flex gap-3 overflow-x-auto pb-2">
          {[1, 2, 3].map(i => (
            <div key={i} className="min-w-[200px] h-[170px] bg-muted/30 rounded-2xl animate-pulse" />
          ))}
        </div>
      </div>
    );
  }

  // Empty state
  if (activeProjects.length === 0) {
    return (
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        className="mb-6"
      >
        <div className="flex items-center justify-between mb-3 px-1">
          <h2 className="text-base font-semibold flex items-center gap-2">
            <FolderKanban className="w-4 h-4 text-primary" />
            {t('nav.activeProjects', 'Aktivni projekti')}
          </h2>
        </div>
        <motion.button
          whileHover={{ scale: 1.01 }}
          whileTap={{ scale: 0.99 }}
          onClick={() => handleNav('/projects')}
          className="w-full p-5 rounded-2xl border-2 border-dashed border-primary/30 bg-primary/5 hover:bg-primary/10 transition-colors flex items-center justify-between text-left group"
        >
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-xl bg-primary/15 flex items-center justify-center">
              <Plus className="w-6 h-6 text-primary" />
            </div>
            <div>
              <p className="font-semibold text-foreground">
                {t('nav.createFirstProject', 'Kreiraj prvi projekt')}
              </p>
              <p className="text-xs text-muted-foreground mt-0.5">
                {t('nav.noActiveProjects', 'Nema aktivnih projekata')}
              </p>
            </div>
          </div>
          <ChevronRight className="w-5 h-5 text-muted-foreground group-hover:text-primary group-hover:translate-x-1 transition-all" />
        </motion.button>
      </motion.div>
    );
  }

  const trafficLightLabel = (level: HealthLevel) =>
    level === 'red'
      ? t('projects.health.trafficLight.red', 'Kritično: marža ispod 10%')
      : level === 'yellow'
      ? t('projects.health.trafficLight.yellow', 'Pažnja: marža ispod 30%')
      : t('projects.health.trafficLight.green', 'Zdravo: marža iznad 30%');

  // Profit value + margin badge (always visible when income/budget exists)
  const renderProfitBlock = (data: ProjectCardData) => {
    const { kpiKind, kpiValue, margin, health, project } = data;

    // Projects with no income & no budget → fall back to txCount
    if (kpiKind === 'items') {
      return (
        <div className="flex flex-col">
          <p className="text-sm font-bold text-muted-foreground leading-tight">
            {t('nav.items', { count: kpiValue, defaultValue: `${kpiValue} stavki` })}
          </p>
          <p className="text-[10px] text-muted-foreground mt-0.5 uppercase tracking-wide">
            {t('projects.health.noIncomeYet', 'Još nema prihoda')}
          </p>
        </div>
      );
    }

    // Color the headline value by health (emotional cue)
    const valueColor =
      health === 'red'
        ? 'text-destructive'
        : health === 'yellow'
        ? 'text-warning'
        : kpiKind === 'profit' || kpiKind === 'remaining'
        ? 'text-income'
        : 'text-destructive';

    let headline = '';
    let label = '';
    if (kpiKind === 'profit') {
      headline = `+${formatAmount(kpiValue)}`;
      label = t('projects.health.profit', 'Profit');
    } else if (kpiKind === 'loss') {
      headline = formatAmount(kpiValue);
      label = t('nav.loss', 'Gubitak');
    } else if (kpiKind === 'remaining') {
      headline = formatAmount(kpiValue);
      label = t('nav.remaining', 'Preostalo');
    } else if (kpiKind === 'overBudget') {
      headline = `−${formatAmount(kpiValue)}`;
      label = t('nav.overBudget', 'Preko budžeta');
    }

    const marginPctText =
      margin !== null
        ? `${(margin * 100).toFixed(0)}%`
        : null;

    return (
      <div className="flex flex-col">
        <p className={cn('text-lg font-bold leading-tight tabular-nums', valueColor)}>
          {headline}
        </p>
        <div className="flex items-center gap-1.5 mt-0.5">
          <p className="text-[10px] text-muted-foreground uppercase tracking-wide">
            {label}
          </p>
          {marginPctText && (
            <span
              className={cn(
                'text-[10px] font-semibold px-1.5 py-0.5 rounded-md',
                health === 'red' && 'bg-destructive/15 text-destructive',
                health === 'yellow' && 'bg-warning/15 text-warning',
                health === 'green' && 'bg-income/15 text-income'
              )}
              title={t('projects.health.margin', 'Marža')}
            >
              {marginPctText}
            </span>
          )}
        </div>
      </div>
    );
  };

  // AI warning footer (yellow / red only)
  const renderAiWarning = (data: ProjectCardData) => {
    if (data.health === 'green' || data.margin === null) return null;
    const pct = (data.margin * 100).toFixed(0);
    const text =
      data.health === 'red'
        ? t('projects.health.aiWarning.red', 'Marža je samo {{pct}}% — profit je kritičan, hitno reagirajte.', { pct })
        : t('projects.health.aiWarning.yellow', 'Marža je {{pct}}% — pregledajte troškove projekta dok je još vrijeme.', { pct });
    const Icon = data.health === 'red' ? AlertOctagon : AlertTriangle;
    return (
      <div
        className={cn(
          'mt-2 flex items-start gap-1.5 rounded-lg px-2 py-1.5 border',
          data.health === 'red'
            ? 'bg-destructive/10 border-destructive/30 text-destructive'
            : 'bg-warning/10 border-warning/30 text-warning'
        )}
      >
        <Icon className="w-3 h-3 shrink-0 mt-[1px]" />
        <p className="text-[10px] leading-snug font-medium">{text}</p>
      </div>
    );
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className="mb-6"
    >
      <div className="flex items-center justify-between mb-3 px-1">
        <h2 className="text-base font-semibold flex items-center gap-2">
          <FolderKanban className="w-4 h-4 text-primary" />
          {t('nav.activeProjects', 'Aktivni projekti')}
        </h2>
        <button
          onClick={() => handleNav('/projects')}
          className="text-xs text-primary hover:underline flex items-center gap-1"
        >
          {t('nav.viewAll', 'Pogledaj sve')}
          <ChevronRight className="w-3 h-3" />
        </button>
      </div>

      <div className="flex gap-3 overflow-x-auto pb-2 snap-x snap-mandatory -mx-3 px-3 sm:-mx-4 sm:px-4 scrollbar-none">
        {activeProjects.map((data, idx) => {
          const { project, health, margin } = data;
          const color = project.color || DEFAULT_PROJECT_COLORS[idx % DEFAULT_PROJECT_COLORS.length];
          const ariaLabel = `${project.name}: ${trafficLightLabel(health)}${
            margin !== null ? `, ${(margin * 100).toFixed(0)}%` : ''
          }`;
          return (
            <motion.button
              key={project.id}
              initial={{ opacity: 0, x: 10 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: idx * 0.04 }}
              whileTap={{ scale: 0.97 }}
              onClick={() => handleNav('/projects')}
              aria-label={ariaLabel}
              className="snap-start min-w-[200px] max-w-[220px] min-h-[170px] p-3 rounded-2xl border border-border/50 bg-card hover:shadow-md transition-all text-left flex flex-col gap-2 relative overflow-hidden"
              style={{
                borderLeftWidth: 3,
                borderLeftColor: color,
              }}
            >
              <div
                className="absolute -top-8 -right-8 w-20 h-20 rounded-full opacity-[0.08] pointer-events-none"
                style={{ background: `radial-gradient(circle, ${color} 0%, transparent 70%)` }}
              />
              {/* Identity: icon + name */}
              <div className="flex items-center gap-2 relative">
                <span className="text-xl leading-none shrink-0">{project.icon || '📁'}</span>
                <p className="font-semibold text-sm truncate flex-1">{project.name}</p>
              </div>

              {/* Centerpiece: big traffic light + profit/margin */}
              <div className="flex items-center gap-3 mt-1">
                <BigTrafficLight level={health} label={trafficLightLabel(health)} />
                {renderProfitBlock(data)}
              </div>

              {/* AI warning (only when yellow / red) */}
              {renderAiWarning(data)}
            </motion.button>
          );
        })}

        {/* Add new project CTA card */}
        <motion.button
          initial={{ opacity: 0, x: 10 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: activeProjects.length * 0.04 }}
          whileTap={{ scale: 0.97 }}
          onClick={() => handleNav('/projects')}
          className="snap-start min-w-[200px] max-w-[220px] min-h-[170px] p-3 rounded-2xl border-2 border-dashed border-primary/30 bg-primary/5 hover:bg-primary/10 transition-colors text-left flex flex-col items-center justify-center gap-2"
        >
          <div className="w-12 h-12 rounded-xl bg-primary/15 flex items-center justify-center">
            <Plus className="w-6 h-6 text-primary" />
          </div>
          <p className="text-xs font-medium text-primary">
            {t('nav.newProject', 'Novi projekt')}
          </p>
        </motion.button>
      </div>
    </motion.div>
  );
});

ActiveProjectsStrip.displayName = 'ActiveProjectsStrip';
