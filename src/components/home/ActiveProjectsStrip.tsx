import React, { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { motion } from 'framer-motion';
import { FolderKanban, Plus, ChevronRight } from 'lucide-react';
import { ProjectWithOwnership, DEFAULT_PROJECT_COLORS } from '@/types/project';
import { Expense } from '@/types/expense';
import { useFeatureAccess } from '@/hooks/useFeatureAccess';
import { useHaptics } from '@/hooks/useHaptics';

interface ActiveProjectsStripProps {
  projects: ProjectWithOwnership[];
  allExpenses: Expense[];
  isLocalMode: boolean;
  simpleModeEnabled: boolean;
  isBusinessMode: boolean;
  loading?: boolean;
}

const MAX_VISIBLE = 5;

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

  // Hide in unsupported modes
  if (simpleModeEnabled || isLocalMode || isBusinessMode) return null;
  if (!hasAccess('projects')) return null;

  // Compute active projects with spent amounts
  const activeProjects = useMemo(() => {
    const active = projects.filter(p => p.status === 'active' || p.status === 'draft');
    return active.slice(0, MAX_VISIBLE).map(p => {
      const spent = allExpenses
        .filter(e => e.project_id === p.id && e.type === 'expense' && e.status === 'approved')
        .reduce((sum, e) => sum + e.amount, 0);
      const pct = p.total_budget > 0 ? Math.min(100, Math.round((spent / p.total_budget) * 100)) : 0;
      return { project: p, spent, pct };
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
        {activeProjects.map(({ project, spent, pct }, idx) => {
          const color = project.color || DEFAULT_PROJECT_COLORS[idx % DEFAULT_PROJECT_COLORS.length];
          const overBudget = project.total_budget > 0 && spent > project.total_budget;
          return (
            <motion.button
              key={project.id}
              initial={{ opacity: 0, x: 10 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: idx * 0.04 }}
              whileTap={{ scale: 0.97 }}
              onClick={() => handleNav('/projects')}
              className="snap-start min-w-[150px] max-w-[170px] p-3 rounded-2xl border border-border/50 bg-card hover:shadow-md transition-all text-left flex flex-col gap-2 relative overflow-hidden"
              style={{
                borderLeftWidth: 3,
                borderLeftColor: color,
              }}
            >
              <div
                className="absolute -top-6 -right-6 w-16 h-16 rounded-full opacity-[0.08] pointer-events-none"
                style={{ background: `radial-gradient(circle, ${color} 0%, transparent 70%)` }}
              />
              <div className="flex items-center gap-2 relative">
                <span className="text-xl leading-none">{project.icon || '📁'}</span>
                <p className="font-semibold text-sm truncate flex-1">{project.name}</p>
              </div>
              {project.total_budget > 0 ? (
                <>
                  <div className="h-1.5 w-full rounded-full bg-muted overflow-hidden">
                    <div
                      className="h-full rounded-full transition-all"
                      style={{
                        width: `${pct}%`,
                        backgroundColor: overBudget ? 'hsl(var(--destructive))' : color,
                      }}
                    />
                  </div>
                  <p className={`text-[11px] ${overBudget ? 'text-destructive font-medium' : 'text-muted-foreground'}`}>
                    {t('nav.projectProgress', { percent: pct, defaultValue: `${pct}% iskorišteno` })}
                  </p>
                </>
              ) : (
                <p className="text-[11px] text-muted-foreground">—</p>
              )}
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
          className="snap-start min-w-[150px] max-w-[170px] p-3 rounded-2xl border-2 border-dashed border-primary/30 bg-primary/5 hover:bg-primary/10 transition-colors text-left flex flex-col items-center justify-center gap-2"
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
