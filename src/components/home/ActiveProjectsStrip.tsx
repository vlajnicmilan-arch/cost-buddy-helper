import React, { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { motion } from 'framer-motion';
import { FolderKanban, Plus, ChevronRight, Wallet } from 'lucide-react';
import { ProjectWithOwnership, DEFAULT_PROJECT_COLORS } from '@/types/project';
import { useFeatureAccess } from '@/hooks/useFeatureAccess';
import { useHaptics } from '@/hooks/useHaptics';
import { useCurrency } from '@/contexts/CurrencyContext';
import { useActiveProjectsSummary } from '@/hooks/useActiveProjectsSummary';
import { cn } from '@/lib/utils';
import { TrialFeatureChip } from '@/components/TrialFeatureChip';

interface ActiveProjectsStripProps {
  projects: ProjectWithOwnership[];
  isLocalMode: boolean;
  simpleModeEnabled: boolean;
  isBusinessMode: boolean;
  loading?: boolean;
}

const MAX_VISIBLE = 5;

type HealthLevel = 'green' | 'yellow' | 'red' | 'neutral';

interface ProjectCardData {
  project: ProjectWithOwnership;
  spent: number;
  budget: number;
  margin: number | null; // ratio, e.g. 0.42
  hasMargin: boolean;
  health: HealthLevel;
}

const healthFromMargin = (margin: number | null): HealthLevel => {
  if (margin === null) return 'neutral';
  if (margin >= 0.30) return 'green';
  if (margin >= 0.10) return 'yellow';
  return 'red';
};

const HEALTH_DOT_COLOR: Record<HealthLevel, string> = {
  green: 'hsl(var(--income))',
  yellow: 'hsl(var(--warning))',
  red: 'hsl(var(--destructive))',
  neutral: 'hsl(var(--muted-foreground))',
};

const HEALTH_TEXT_CLASS: Record<HealthLevel, string> = {
  green: 'text-income',
  yellow: 'text-warning',
  red: 'text-destructive',
  neutral: 'text-muted-foreground',
};

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
      const budget = p.total_budget || 0;

      let margin: number | null = null;
      let hasMargin = false;
      if (budget > 0) {
        margin = (budget - spent) / budget;
        hasMargin = true;
      }

      return {
        project: p,
        spent,
        budget,
        margin,
        hasMargin,
        health: healthFromMargin(margin),
      };
    });
  }, [projects, summary]);

  if (simpleModeEnabled || isLocalMode || isBusinessMode) return null;
  if (!hasAccess('projects')) return null;

  const handleNav = (path: string, state?: Record<string, unknown>) => {
    lightTap();
    navigate(path, state ? { state } : undefined);
  };

  if (loading || (activeIds.length > 0 && summaryLoading && summary.size === 0)) {
    return (
      <div className="mb-6">
        <div className="flex items-center justify-between mb-3 px-1">
          <div className="h-5 w-32 bg-muted/50 rounded animate-pulse" />
        </div>
        <div className="flex gap-3 overflow-x-auto pb-2">
          {[1, 2, 3].map(i => (
            <div key={i} className="min-w-[200px] h-[150px] bg-muted/30 rounded-2xl animate-pulse" />
          ))}
        </div>
      </div>
    );
  }

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
            <TrialFeatureChip feature="projects" />
          </h2>
        </div>
        <motion.button
          whileHover={{ scale: 1.01 }}
          whileTap={{ scale: 0.99 }}
          onClick={() => handleNav('/projects', { openNewProject: true, from: '/home' })}
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

  const trafficLightLabel = (level: HealthLevel) => {
    if (level === 'red') return t('projects.health.trafficLight.red', 'Kritično: marža ispod 10%');
    if (level === 'yellow') return t('projects.health.trafficLight.yellow', 'Pažnja: marža ispod 30%');
    if (level === 'green') return t('projects.health.trafficLight.green', 'Zdravo: marža iznad 30%');
    return '';
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
          <TrialFeatureChip feature="projects" />
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
          const { project, spent, budget, margin, hasMargin, health } = data;
          const color = project.color || DEFAULT_PROJECT_COLORS[idx % DEFAULT_PROJECT_COLORS.length];
          const dotColor = HEALTH_DOT_COLOR[health];
          const trafficLabel = trafficLightLabel(health);

          let ariaLabel: string;
          if (!hasMargin) {
            ariaLabel = `${project.name}: ${t('projects.card.setContracted', 'Postavi ugovoreni iznos')}`;
          } else {
            const pct = `${Math.round((margin ?? 0) * 100)}%`;
            ariaLabel = `${project.name}: ${t('projects.card.margin', 'MARŽA')} ${pct}${trafficLabel ? `, ${trafficLabel}` : ''}`;
          }

          const renderFooterLines = () => {
            if (!hasMargin) return null;
            const profit = budget - spent;
            const lines = [
              { label: t('projects.card.contracted', 'Ugovoreno'), value: budget, signed: false },
              { label: t('projects.card.spent', 'Trošak'), value: spent, signed: false },
              { label: t('projects.card.profit', 'Zarada'), value: profit, signed: true },
            ];
            return (
              <div className="space-y-1 pt-1.5 border-t border-border/40">
                {lines.map((ln, i) => {
                  const positive = ln.value >= 0;
                  const valueClass = ln.signed
                    ? (positive ? 'text-income' : 'text-destructive')
                    : 'text-foreground';
                  const prefix = ln.signed
                    ? (positive ? '+' : '−')
                    : '';
                  const shown = ln.signed ? Math.abs(ln.value) : ln.value;
                  return (
                    <div key={i} className="flex items-center justify-between gap-2 text-[11px]">
                      <span className="text-muted-foreground truncate">{ln.label}</span>
                      <span className={cn('font-semibold tabular-nums shrink-0', valueClass)}>
                        {prefix}{formatAmount(shown)}
                      </span>
                    </div>
                  );
                })}
              </div>
            );
          };

          const renderCenter = () => {
            if (!hasMargin) {
              return (
                <div className="flex flex-col items-center justify-center text-center px-2 py-3">
                  <div className="w-9 h-9 rounded-full bg-primary/15 flex items-center justify-center mb-1.5">
                    <Wallet className="w-4 h-4 text-primary" />
                  </div>
                  <p className="text-xs font-semibold text-primary leading-snug">
                    {t('projects.card.setContracted', 'Postavi ugovoreni iznos')}
                  </p>
                </div>
              );
            }
            const pct = `${Math.round((margin ?? 0) * 100)}%`;
            return (
              <div className="flex flex-col items-center justify-center py-1.5">
                <p className={cn('text-2xl font-bold leading-none tabular-nums', HEALTH_TEXT_CLASS[health])}>
                  {pct}
                </p>
                <p className="text-[10px] uppercase tracking-wider text-muted-foreground mt-0.5 text-center">
                  {t('projects.card.margin', 'MARŽA')}
                </p>
              </div>
            );
          };

          return (
            <motion.button
              key={project.id}
              initial={{ opacity: 0, x: 10 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: idx * 0.04 }}
              whileTap={{ scale: 0.97 }}
              onClick={() => handleNav('/projects', { openProjectId: project.id, from: '/home' })}
              aria-label={ariaLabel}
              className="snap-start min-w-[200px] max-w-[220px] p-2.5 rounded-2xl border border-border/50 bg-card hover:shadow-md transition-all text-left flex flex-col gap-1.5 relative overflow-hidden"
              style={{
                borderLeftWidth: 3,
                borderLeftColor: color,
              }}
            >
              <div
                className="absolute -top-8 -right-8 w-20 h-20 rounded-full opacity-[0.08] pointer-events-none"
                style={{ background: `radial-gradient(circle, ${color} 0%, transparent 70%)` }}
              />

              {/* Header: icon + name + traffic-light dot */}
              <div className="flex items-center gap-2 relative">
                <span className="text-xl leading-none shrink-0">{project.icon || '📁'}</span>
                <p className="font-semibold text-sm truncate flex-1">{project.name}</p>
                <span
                  className="w-2.5 h-2.5 rounded-full shrink-0"
                  style={{
                    backgroundColor: dotColor,
                    boxShadow: health !== 'neutral' ? `0 0 6px ${dotColor}` : 'none',
                  }}
                  aria-label={trafficLabel}
                  role="img"
                  title={trafficLabel}
                />
              </div>

              {/* Centerpiece: margin % or CTA */}
              {renderCenter()}

              {/* Footer: 3 amount lines */}
              {renderFooterLines()}
            </motion.button>
          );
        })}

        {/* Add new project CTA card */}
        <motion.button
          initial={{ opacity: 0, x: 10 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: activeProjects.length * 0.04 }}
          whileTap={{ scale: 0.97 }}
          onClick={() => handleNav('/projects', { openNewProject: true, from: '/home' })}
          className="snap-start min-w-[200px] max-w-[220px] p-2.5 rounded-2xl border-2 border-dashed border-primary/30 bg-primary/5 hover:bg-primary/10 transition-colors text-left flex flex-col items-center justify-center gap-2"
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
