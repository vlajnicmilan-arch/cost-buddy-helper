import React, { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { motion } from 'framer-motion';
import { FolderKanban, Plus, ChevronRight } from 'lucide-react';
import { ProjectWithOwnership, DEFAULT_PROJECT_COLORS } from '@/types/project';
import { Expense } from '@/types/expense';
import { useFeatureAccess } from '@/hooks/useFeatureAccess';
import { useHaptics } from '@/hooks/useHaptics';
import { useCurrency } from '@/contexts/CurrencyContext';
import {
  calculateProjectSpent,
  calculateProjectIncomeFromTransactions,
} from '@/lib/projectCalculations';

interface ActiveProjectsStripProps {
  projects: ProjectWithOwnership[];
  allExpenses: Expense[];
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
  kpiKind: KpiKind;
  kpiValue: number;
}

/**
 * Mini traffic light indicator (3 vertical dots, only one lit).
 * Universal status convention — color-blind friendly because position carries meaning.
 */
const TrafficLight: React.FC<{ level: HealthLevel }> = ({ level }) => {
  const dot = (active: boolean, color: string) => (
    <div
      className="w-[5px] h-[5px] rounded-full transition-all"
      style={{
        backgroundColor: color,
        opacity: active ? 1 : 0.18,
        boxShadow: active ? `0 0 4px ${color}` : 'none',
      }}
    />
  );
  return (
    <div
      className="flex flex-col items-center gap-[2px] p-[3px] rounded-md bg-foreground/5 border border-border/40"
      aria-label={`status-${level}`}
      role="img"
    >
      {dot(level === 'green', 'hsl(var(--income))')}
      {dot(level === 'yellow', 'hsl(var(--warning))')}
      {dot(level === 'red', 'hsl(var(--destructive))')}
    </div>
  );
};

export const ActiveProjectsStrip = React.memo(({
  projects,
  allExpenses,
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

  // Compute active projects with spent / income / health
  // IMPORTANT: hooks MUST be called before any early return (Rules of Hooks)
  const activeProjects: ProjectCardData[] = useMemo(() => {
    const active = projects.filter(p => p.status === 'active' || p.status === 'draft');
    return active.slice(0, MAX_VISIBLE).map(p => {
      const projectExpenses = allExpenses.filter(e => e.project_id === p.id);
      const spent = calculateProjectSpent(projectExpenses as any);
      const income = calculateProjectIncomeFromTransactions(projectExpenses as any);
      const profit = income - spent;
      const remaining = (p.total_budget || 0) - spent;
      const txCount = projectExpenses.length;

      const hasIncome = income > 0;
      const hasBudget = (p.total_budget || 0) > 0;

      // Health
      let health: HealthLevel = 'green';
      if (hasIncome) {
        const tolerance = income * 0.05;
        if (profit < -tolerance) health = 'red';
        else if (profit < tolerance) health = 'yellow';
        else health = 'green';
      } else if (hasBudget) {
        const usedPct = (spent / p.total_budget) * 100;
        if (usedPct > 95) health = 'red';
        else if (usedPct >= 70) health = 'yellow';
        else health = 'green';
      } else {
        health = 'green';
      }

      // KPI selection
      let kpiKind: KpiKind;
      let kpiValue: number;
      if (hasIncome) {
        kpiKind = profit >= 0 ? 'profit' : 'loss';
        kpiValue = profit;
      } else if (hasBudget && spent > p.total_budget) {
        kpiKind = 'overBudget';
        kpiValue = spent - p.total_budget;
      } else if (hasBudget) {
        kpiKind = 'remaining';
        kpiValue = remaining;
      } else {
        kpiKind = 'items';
        kpiValue = txCount;
      }

      return { project: p, spent, income, profit, remaining, txCount, health, kpiKind, kpiValue };
    });
  }, [projects, allExpenses]);

  const handleNav = (path: string) => {
    lightTap();
    navigate(path);
  };

  // Loading skeleton
  if (loading) {
    return (
      <div className="mb-6">
        <div className="flex items-center justify-between mb-3 px-1">
          <div className="h-5 w-32 bg-muted/50 rounded animate-pulse" />
        </div>
        <div className="flex gap-3 overflow-x-auto pb-2">
          {[1, 2, 3].map(i => (
            <div key={i} className="min-w-[140px] h-[120px] bg-muted/30 rounded-2xl animate-pulse" />
          ))}
        </div>
      </div>
    );
  }

  // Empty state — primary CTA for activation
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

  // Helper to render the single KPI line
  const renderKpi = (data: ProjectCardData) => {
    const { kpiKind, kpiValue } = data;
    let label = '';
    let valueText = '';
    let valueClass = 'text-foreground';

    if (kpiKind === 'profit') {
      label = t('nav.profit', 'Profit');
      valueText = `+${formatAmount(kpiValue)}`;
      valueClass = 'text-income';
    } else if (kpiKind === 'loss') {
      label = t('nav.loss', 'Gubitak');
      valueText = formatAmount(kpiValue); // already negative
      valueClass = 'text-destructive';
    } else if (kpiKind === 'remaining') {
      label = t('nav.remaining', 'Preostalo');
      valueText = formatAmount(kpiValue);
      valueClass = 'text-foreground';
    } else if (kpiKind === 'overBudget') {
      label = t('nav.overBudget', 'Preko budžeta');
      valueText = `−${formatAmount(kpiValue)}`;
      valueClass = 'text-destructive';
    } else {
      // items
      label = '';
      valueText = t('nav.items', { count: kpiValue, defaultValue: `${kpiValue} stavki` });
      valueClass = 'text-muted-foreground';
    }

    return (
      <div className="mt-auto">
        <p className={`text-sm font-bold leading-tight ${valueClass}`}>{valueText}</p>
        {label && (
          <p className="text-[10px] text-muted-foreground mt-0.5 uppercase tracking-wide">
            {label}
          </p>
        )}
      </div>
    );
  };

  // With projects — horizontal scrollable strip
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
          const { project, health } = data;
          const color = project.color || DEFAULT_PROJECT_COLORS[idx % DEFAULT_PROJECT_COLORS.length];
          return (
            <motion.button
              key={project.id}
              initial={{ opacity: 0, x: 10 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: idx * 0.04 }}
              whileTap={{ scale: 0.97 }}
              onClick={() => handleNav('/projects')}
              className="snap-start min-w-[150px] max-w-[170px] min-h-[110px] p-3 rounded-2xl border border-border/50 bg-card hover:shadow-md transition-all text-left flex flex-col gap-2 relative overflow-hidden"
              style={{
                borderLeftWidth: 3,
                borderLeftColor: color,
              }}
            >
              <div
                className="absolute -top-6 -right-6 w-16 h-16 rounded-full opacity-[0.08] pointer-events-none"
                style={{ background: `radial-gradient(circle, ${color} 0%, transparent 70%)` }}
              />
              {/* Traffic light — top right corner */}
              <div className="absolute top-2 right-2">
                <TrafficLight level={health} />
              </div>
              {/* Identity: icon + name (with right padding to clear traffic light) */}
              <div className="flex items-center gap-2 relative pr-7">
                <span className="text-xl leading-none">{project.icon || '📁'}</span>
                <p className="font-semibold text-sm truncate flex-1">{project.name}</p>
              </div>
              {/* Single KPI */}
              {renderKpi(data)}
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
          className="snap-start min-w-[150px] max-w-[170px] min-h-[110px] p-3 rounded-2xl border-2 border-dashed border-primary/30 bg-primary/5 hover:bg-primary/10 transition-colors text-left flex flex-col items-center justify-center gap-2"
        >
          <div className="w-10 h-10 rounded-xl bg-primary/15 flex items-center justify-center">
            <Plus className="w-5 h-5 text-primary" />
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
