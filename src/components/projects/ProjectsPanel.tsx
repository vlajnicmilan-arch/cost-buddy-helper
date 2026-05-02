import { useState, useMemo, useEffect, useCallback } from 'react';
import { useLocation } from 'react-router-dom';
import { useProjects } from '@/hooks/useProjects';
import { useProjectStats } from '@/hooks/useProjectStats';
import { useProjectMilestones } from '@/hooks/useProjectMilestones';
import { useProjectMembers } from '@/hooks/useProjectMembers';
import { Project, ProjectWithOwnership } from '@/types/project';
import { ProjectCard } from './ProjectCard';
import { ProjectDialog } from './ProjectDialog';
import { ProjectFullScreenView } from './ProjectFullScreenView';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { useTranslation } from 'react-i18next';
import { Plus, FolderKanban, Loader2, Search, X, Briefcase } from 'lucide-react';
import { EmptyState } from '@/components/EmptyState';
import { AnimatePresence, motion } from 'framer-motion';
import { useCurrency } from '@/contexts/CurrencyContext';
import { supabase } from '@/integrations/supabase/client';
import { useAppState } from '@/contexts/AppStateContext';
import { applyTemplateToProject } from '@/lib/projectTemplateApply';
import type { ProjectTemplate } from '@/hooks/useProjectTemplates';

interface ProjectsPanelProps {
  onRefreshExpenses?: () => void;
  canCreate?: boolean;
}

export const ProjectsPanel = ({ onRefreshExpenses, canCreate = true }: ProjectsPanelProps) => {
  const { t } = useTranslation();
  const location = useLocation();
  const { projects, loading, addProject, updateProject, deleteProject, archiveProject, migrateToBusinessMode, refetch, activeBusinessProfileId } = useProjects();
  const { formatAmount } = useCurrency();
  const { businessModeEnabled } = useAppState();
  
  // Show migrate button only in personal mode when user has business mode enabled
  const canMigrateToBusiness = !activeBusinessProfileId && businessModeEnabled;

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingProject, setEditingProject] = useState<Project | null>(null);
  const [selectedProject, setSelectedProject] = useState<ProjectWithOwnership | null>(null);
  const [detailDialogOpen, setDetailDialogOpen] = useState(false);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [projectToDelete, setProjectToDelete] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [pendingExpenseId, setPendingExpenseId] = useState<string | null>(null);
  const [migrateConfirmOpen, setMigrateConfirmOpen] = useState(false);
  const [projectToMigrate, setProjectToMigrate] = useState<ProjectWithOwnership | null>(null);
  const [showArchived, setShowArchived] = useState(false);

  const handleOpenBlankDialog = () => {
    setEditingProject(null);
    setDialogOpen(true);
  };

  // Handle navigation from notification click
  useEffect(() => {
    const state = location.state as { openProjectId?: string; openExpenseId?: string } | null;
    if (state?.openProjectId && projects.length > 0) {
      const project = projects.find(p => p.id === state.openProjectId);
      if (project) {
        setSelectedProject(project as ProjectWithOwnership);
        setDetailDialogOpen(true);
        if (state.openExpenseId) {
          setPendingExpenseId(state.openExpenseId);
        }
        // Clear the state so it doesn't re-trigger
        window.history.replaceState({}, '');
      }
    }
  }, [location.state, projects]);

  // Fetch stats for all projects (parallel batch query)
  const [projectStats, setProjectStats] = useState<Record<string, { spent: number; income: number; memberCount: number; milestoneCount: number; milestones: Array<{ status: any; due_date?: string | null }> }>>({});

  const fetchAllStats = useCallback(async () => {
    if (projects.length === 0) return;
    const projectIds = projects.map(p => p.id);

    const [expensesRes, fundingRes, milestonesRes, membersRes] = await Promise.all([
      (supabase.from('expenses').select('project_id, amount, type, status, expense_nature') as any).in('project_id', projectIds),
      supabase.from('project_funding').select('project_id, allocated_amount').in('project_id', projectIds),
      supabase.from('project_milestones').select('project_id, budget, status, due_date').in('project_id', projectIds),
      (supabase.from('project_members') as any).select('project_id').in('project_id', projectIds),
    ]);

    const allExpenses = expensesRes.data || [];
    const allFunding = fundingRes.data || [];
    const allMilestones = milestonesRes.data || [];
    const allMembers = membersRes.data || [];

    const { calculateProjectSpent, calculateProjectIncome } = await import('@/lib/projectCalculations');
    const stats: typeof projectStats = {};

    for (const project of projects) {
      const projExpenses = allExpenses.filter((e: any) => e.project_id === project.id);
      const projFunding = allFunding.filter((f: any) => f.project_id === project.id);
      const projMilestones = allMilestones.filter((m: any) => m.project_id === project.id);
      const memberCount = allMembers.filter((m: any) => m.project_id === project.id).length;

      stats[project.id] = {
        spent: calculateProjectSpent(projExpenses),
        income: calculateProjectIncome(projExpenses, projFunding),
        memberCount,
        milestoneCount: projMilestones.length,
        milestones: projMilestones.map((m: any) => ({ status: m.status, due_date: m.due_date })),
      };
    }

    setProjectStats(stats);
  }, [projects]);

  useEffect(() => {
    fetchAllStats();
  }, [fetchAllStats]);

  const handleEdit = (project: Project) => {
    setEditingProject(project);
    setDialogOpen(true);
  };

  const handleDelete = (id: string) => {
    setProjectToDelete(id);
    setDeleteConfirmOpen(true);
  };

  const confirmDelete = async () => {
    if (projectToDelete) {
      await deleteProject(projectToDelete);
      setDeleteConfirmOpen(false);
      setProjectToDelete(null);
    }
  };

  const handleMigrateToBusiness = (project: ProjectWithOwnership) => {
    setProjectToMigrate(project);
    setMigrateConfirmOpen(true);
  };

  const confirmMigrate = async () => {
    if (projectToMigrate) {
      // Get the first active business profile id from localStorage
      const storedProfiles = localStorage.getItem('finmate.businessProfiles');
      let targetProfileId: string | null = null;
      
      if (storedProfiles) {
        try {
          const profiles = JSON.parse(storedProfiles);
          if (profiles.length > 0) targetProfileId = profiles[0].id;
        } catch {}
      }
      
      // If not in localStorage, try fetching from DB
      if (!targetProfileId) {
        const { data } = await supabase
          .from('business_profiles')
          .select('id')
          .eq('is_active', true)
          .limit(1)
          .single();
        if (data) targetProfileId = data.id;
      }
      
      if (targetProfileId) {
        await migrateToBusinessMode(projectToMigrate.id, targetProfileId);
      }
      setMigrateConfirmOpen(false);
      setProjectToMigrate(null);
    }
  };

  const handleProjectClick = (project: ProjectWithOwnership) => {
    setSelectedProject(project);
    setDetailDialogOpen(true);
  };

  const handleCloseFullScreen = () => {
    setDetailDialogOpen(false);
    setSelectedProject(null);
    setPendingExpenseId(null);
    refetch();
    fetchAllStats();
  };

  const handleSave = async (
    projectData: Omit<Project, 'id' | 'user_id' | 'created_at' | 'updated_at'>,
    template?: ProjectTemplate | null,
    addContingency?: boolean
  ) => {
    const created = await addProject(projectData);
    if (created) {
      if (template || (addContingency && (created.total_budget || 0) > 0)) {
        await applyTemplateToProject(
          created.id,
          template ?? ({ default_milestones: [], color: created.color } as any),
          created.start_date || null,
          {
            addContingency,
            totalBudget: Number(created.total_budget) || 0,
            contingencyLabel: t('projects.contingency.milestoneName', 'Rezerva za nepredviđeno'),
          }
        );
      }
    }
  };

  const handleUpdate = async (project: Project) => {
    await updateProject(project);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const visibleProjects = projects.filter(p => showArchived ? !!p.archived_at : !p.archived_at);
  const archivedCount = projects.filter(p => !!p.archived_at).length;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h3 className="font-semibold flex items-center gap-2">
          <FolderKanban className="w-5 h-5" />
          {t('projects.title')}
        </h3>
        <div className="flex items-center gap-2">
          {archivedCount > 0 && (
            <Button
              variant={showArchived ? 'default' : 'ghost'}
              size="sm"
              onClick={() => setShowArchived(v => !v)}
              className="text-xs"
            >
              {showArchived ? t('projects.showActive', 'Aktivni') : t('projects.showArchived', `Arhiva (${archivedCount})`)}
            </Button>
          )}
          {canCreate && (
            <Button onClick={handleOpenBlankDialog} size="sm">
              <Plus className="w-4 h-4 mr-2" />
              {t('projects.add')}
            </Button>
          )}
        </div>
      </div>

      {/* Search */}
      {visibleProjects.length > 0 && (
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder={t('projects.searchPlaceholder', 'Pretraži projekte...')}
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-9 pr-9 h-9 text-sm"
          />
          {searchTerm && (
            <button
              onClick={() => setSearchTerm('')}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>
      )}

      {visibleProjects.length === 0 ? (
        <EmptyState
          variant="projects"
          title={showArchived ? t('projects.noArchived', 'Nema arhiviranih projekata') : t('projects.noProjects')}
          description={showArchived ? '' : t('projects.noProjectsHint')}
          action={showArchived ? undefined : { label: t('projects.add'), onClick: handleOpenBlankDialog }}
        />
      ) : (
        <AnimatePresence mode="popLayout">
          <div className="space-y-3">
            {visibleProjects
              .filter(p => !searchTerm.trim() || p.name.toLowerCase().includes(searchTerm.toLowerCase()) || p.description?.toLowerCase().includes(searchTerm.toLowerCase()))
              .map((project) => (
              <motion.div
                key={project.id}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -20 }}
                layout
              >
                <ProjectCard
                  project={project}
                  spent={projectStats[project.id]?.spent || 0}
                  income={projectStats[project.id]?.income || 0}
                  memberCount={projectStats[project.id]?.memberCount || 0}
                  milestoneCount={projectStats[project.id]?.milestoneCount || 0}
                  milestones={projectStats[project.id]?.milestones || []}
                  onEdit={handleEdit}
                  onDelete={handleDelete}
                  onArchive={(id) => archiveProject(id, !project.archived_at)}
                  isArchived={!!project.archived_at}
                  onClick={handleProjectClick}
                  onMigrateToBusiness={canMigrateToBusiness ? handleMigrateToBusiness : undefined}
                />
              </motion.div>
            ))}
          </div>
        </AnimatePresence>
      )}

      {/* Create/Edit Dialog */}
      <ProjectDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        project={editingProject}
        onSave={handleSave}
        onUpdate={handleUpdate}
      />

      {/* Full-screen Project View */}
      <ProjectFullScreenView
        open={detailDialogOpen}
        onClose={handleCloseFullScreen}
        project={selectedProject}
        initialTab={pendingExpenseId ? 'transactions' : undefined}
        onRefreshExpenses={() => {
          refetch();
          fetchAllStats();
          onRefreshExpenses?.();
        }}
      />

      {/* Delete Confirmation */}
      <AlertDialog open={deleteConfirmOpen} onOpenChange={setDeleteConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('projects.deleteConfirmTitle')}</AlertDialogTitle>
            <AlertDialogDescription>
              {t('projects.deleteConfirmMessage')}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('common.cancel')}</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDelete} className="bg-destructive text-destructive-foreground">
              {t('common.delete')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Migrate to Business Confirmation */}
      <AlertDialog open={migrateConfirmOpen} onOpenChange={setMigrateConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('projects.migrateConfirmTitle', 'Premjesti u poslovni mod?')}</AlertDialogTitle>
            <AlertDialogDescription>
              {t('projects.migrateConfirmMessage', 'Projekt će postati vidljiv u poslovnom modu s naprednim funkcijama (radnici, suradnici, P&L). Svi postojeći podaci će biti sačuvani.')}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('common.cancel')}</AlertDialogCancel>
            <AlertDialogAction onClick={confirmMigrate}>
              <Briefcase className="w-4 h-4 mr-2" />
              {t('projects.migrateToBusiness', 'Premjesti u poslovni mod')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};
