import { useState, useMemo, useEffect, useCallback, useRef } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useProjects } from '@/hooks/useProjects';
import { useSoftDeleteWithUndo } from '@/hooks/useSoftDeleteWithUndo';
import { useProjectStats } from '@/hooks/useProjectStats';
import { useProjectMilestones } from '@/hooks/useProjectMilestones';
import { useProjectMembers } from '@/hooks/useProjectMembers';
import { Project, ProjectWithOwnership } from '@/types/project';
import { ProjectCard } from './ProjectCard';
import { ProjectDialog } from './ProjectDialog';
import { ProjectFullScreenView } from './ProjectFullScreenView';
import { peekPendingHighlight } from '@/lib/pendingHighlight';

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
import { useBusinessProfiles } from '@/hooks/useBusinessProfiles';
import { showError, showSuccess } from '@/hooks/useStatusFeedback';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useFeatureAccess } from '@/hooks/useFeatureAccess';
import { logDiagnostic } from '@/lib/diagnosticLogger';

interface ProjectsPanelProps {
  onRefreshExpenses?: () => void;
  canCreate?: boolean;
}

export const ProjectsPanel = ({ onRefreshExpenses, canCreate = true }: ProjectsPanelProps) => {
  const { t } = useTranslation();
  const location = useLocation();
  const navigate = useNavigate();
  // Remembers where user came from (e.g. '/home') so close (X) returns there
  // instead of leaving them stranded on the projects list they never asked for.
  const returnToRef = useRef<string | null>(null);
  const { projects, loading, addProject, updateProject, deleteProject, archiveProject, migrateToBusinessMode, refetch, activeBusinessProfileId } = useProjects();
  const { formatAmount } = useCurrency();
  const { hasAccess } = useFeatureAccess();
  const hasProjectsSubscription = hasAccess('projects');
  const { businessModeEnabled } = useAppState();
  
  // Show migrate button only in personal mode when user has business mode enabled
  const canMigrateToBusiness = !activeBusinessProfileId && businessModeEnabled;

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingProject, setEditingProject] = useState<Project | null>(null);
  const [selectedProject, setSelectedProject] = useState<ProjectWithOwnership | null>(null);
  const [detailDialogOpen, _setDetailDialogOpenRaw] = useState(false);
  const setDetailDialogOpen = useCallback((value: boolean, source: string = 'unknown') => {
    logDiagnostic({ event: 'dbg_panel_detail_open_set', details: { value, source } });
    _setDetailDialogOpenRaw(value);
  }, []);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [projectToDelete, setProjectToDelete] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [pendingExpenseId, setPendingExpenseId] = useState<string | null>(null);
  const [pendingInitialTab, setPendingInitialTab] = useState<string | null>(null);
  const [migrateConfirmOpen, setMigrateConfirmOpen] = useState(false);
  const [projectToMigrate, setProjectToMigrate] = useState<ProjectWithOwnership | null>(null);
  const [migrateTargetProfileId, setMigrateTargetProfileId] = useState<string>('');
  const [showArchived, setShowArchived] = useState(false);
  const { profiles: businessProfiles } = useBusinessProfiles();

  const handleOpenBlankDialog = () => {
    setEditingProject(null);
    setDialogOpen(true);
  };

  // Handle navigation from notification click or dashboard quick-actions.
  // Two paths:
  //  1. React Router state (bell flow + warm push) → state.openProjectId/initialTab.
  //  2. Native cold start → state is empty, ali `peekPendingHighlight()` ima
  //     pending namjeru (route + tab). Ne consume-amo je ovdje — to ostaje na
  //     `HighlightTarget`-u nakon što DOM marker bude pronađen.
  useEffect(() => {
    const state = location.state as
      | { openProjectId?: string; openExpenseId?: string; openNewProject?: boolean; from?: string; initialTab?: string }
      | null;

    let resolvedProjectId: string | undefined = state?.openProjectId;
    let resolvedExpenseId: string | undefined = state?.openExpenseId;
    let resolvedTab: string | undefined = state?.initialTab;
    let fromState: string | undefined = state?.from;
    let openNewProject = !!state?.openNewProject;

    if (!state && projects.length > 0) {
      const pending = peekPendingHighlight();
      if (pending?.route && pending.route.startsWith('/projects')) {
        const qIdx = pending.route.indexOf('?');
        if (qIdx !== -1) {
          try {
            const params = new URLSearchParams(pending.route.slice(qIdx + 1));
            const pid = params.get('id');
            if (pid) {
              resolvedProjectId = pid;
              resolvedTab = pending.tab ?? undefined;
              if (pending.type === 'expense') resolvedExpenseId = pending.id;
            }
          } catch { /* ignore */ }
        }
      }
    }

    if (openNewProject) {
      if (fromState) returnToRef.current = fromState;
      handleOpenBlankDialog();
      window.history.replaceState({}, '');
      return;
    }

    if (resolvedProjectId && projects.length > 0) {
      const project = projects.find(p => p.id === resolvedProjectId);
      if (project) {
        if (fromState) returnToRef.current = fromState;
        setSelectedProject(project as ProjectWithOwnership);
        setDetailDialogOpen(true);
        if (resolvedExpenseId) setPendingExpenseId(resolvedExpenseId);
        if (resolvedTab) setPendingInitialTab(resolvedTab);
        // Clear the state so it doesn't re-trigger
        if (state) window.history.replaceState({}, '');
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
      const projMilestones = allMilestones.filter((m: any) => m.project_id === project.id);
      const memberCount = allMembers.filter((m: any) => m.project_id === project.id).length;

      stats[project.id] = {
        spent: calculateProjectSpent(projExpenses),
        // F3 (Option A): realized income only — funding is a separate KPI, not income.
        income: calculateProjectIncome(projExpenses),
        memberCount,
        milestoneCount: projMilestones.length,
        milestones: projMilestones.map((m: any) => ({ status: m.status, due_date: m.due_date })),
      };
    }
    void allFunding;

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

  const wrapDeleteWithUndo = useSoftDeleteWithUndo({ onRestored: refetch });
  const confirmDelete = async () => {
    if (projectToDelete) {
      const id = projectToDelete;
      try {
        await wrapDeleteWithUndo(() => deleteProject(id), 'project', id);
      } catch {
        // deleteProject već prikazuje showError; samo spriječi neuhvaćeni promise reject.
      } finally {
        setDeleteConfirmOpen(false);
        setProjectToDelete(null);
      }
    }
  };

  const handleMigrateToBusiness = (project: ProjectWithOwnership) => {
    if (businessProfiles.length === 0) {
      showError(t('projects.migrateNoProfiles', 'Nemaš nijednu tvrtku. Kreiraj je u Postavkama → Poslovne tvrtke.'));
      return;
    }
    setProjectToMigrate(project);
    setMigrateTargetProfileId(businessProfiles.length === 1 ? businessProfiles[0].id : '');
    setMigrateConfirmOpen(true);
  };

  const confirmMigrate = async () => {
    if (!projectToMigrate) return;
    if (!migrateTargetProfileId) {
      showError(t('projects.migrateChooseProfile', 'Odaberi tvrtku'));
      return;
    }
    try {
      const ok = await migrateToBusinessMode(projectToMigrate.id, migrateTargetProfileId);
      if (ok) {
        setMigrateConfirmOpen(false);
        setProjectToMigrate(null);
        setMigrateTargetProfileId('');
        refetch();
        fetchAllStats();
      } else {
        showError(t('common.error', 'Greška'));
      }
    } catch (err) {
      console.error('[ProjectsPanel] migrate failed', err);
      showError(t('common.error', 'Greška'));
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
    setPendingInitialTab(null);
    refetch();
    fetchAllStats();
    if (returnToRef.current) {
      const target = returnToRef.current;
      returnToRef.current = null;
      navigate(target);
    }
  };

  const handleCreateDialogOpenChange = (open: boolean) => {
    setDialogOpen(open);
    if (!open && returnToRef.current) {
      const target = returnToRef.current;
      returnToRef.current = null;
      navigate(target);
    }
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
            <Button data-testid="project-create" onClick={handleOpenBlankDialog} size="sm" variant="module">
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
        onOpenChange={handleCreateDialogOpenChange}
        project={editingProject}
        onSave={handleSave}
        onUpdate={handleUpdate}
      />

      {/* Full-screen Project View */}
      <ProjectFullScreenView
        open={detailDialogOpen}
        onClose={handleCloseFullScreen}
        project={selectedProject}
        initialTab={pendingInitialTab ?? (pendingExpenseId ? 'transactions' : undefined)}
        onRequestEdit={(p) => { setEditingProject(p); setDialogOpen(true); }}
        onRequestArchive={(id, archive) => archiveProject(id, archive)}
        onRequestDelete={(id) => handleDelete(id)}
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
      <AlertDialog open={migrateConfirmOpen} onOpenChange={(o) => { setMigrateConfirmOpen(o); if (!o) { setProjectToMigrate(null); setMigrateTargetProfileId(''); } }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('projects.migrateConfirmTitle', 'Premjesti u poslovni mod?')}</AlertDialogTitle>
            <AlertDialogDescription>
              {t('projects.migrateConfirmMessage', 'Projekt će postati vidljiv u poslovnom modu s naprednim funkcijama (radnici, suradnici, P&L). Svi postojeći podaci će biti sačuvani.')}
            </AlertDialogDescription>
          </AlertDialogHeader>
          {businessProfiles.length > 1 ? (
            <div className="space-y-2 py-2">
              <Label className="text-sm">{t('projects.migrateChooseProfile', 'Odaberi tvrtku')}</Label>
              <Select value={migrateTargetProfileId} onValueChange={setMigrateTargetProfileId}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder={t('projects.migrateChooseProfile', 'Odaberi tvrtku')} />
                </SelectTrigger>
                <SelectContent>
                  {businessProfiles.map(p => (
                    <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          ) : businessProfiles.length === 1 ? (
            <p className="text-sm text-muted-foreground py-2">
              {t('projects.migrateTargetCompany', 'Ciljna tvrtka:')} <strong>{businessProfiles[0].name}</strong>
            </p>
          ) : null}
          <AlertDialogFooter>
            <AlertDialogCancel>{t('common.cancel')}</AlertDialogCancel>
            <AlertDialogAction onClick={confirmMigrate} disabled={!migrateTargetProfileId}>
              <Briefcase className="w-4 h-4 mr-2" />
              {t('projects.migrateToBusiness', 'Premjesti u poslovni mod')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};
