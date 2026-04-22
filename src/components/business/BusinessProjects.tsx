import { useState, useEffect, useCallback, useMemo } from 'react';
import { useProjects } from '@/hooks/useProjects';
import { useAppState } from '@/contexts/AppStateContext';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { ProjectWithOwnership, Project } from '@/types/project';
import { ProjectCard } from '@/components/projects/ProjectCard';
import { ProjectDialog } from '@/components/projects/ProjectDialog';
import { ProjectFullScreenView } from '@/components/projects/ProjectFullScreenView';
import { EmptyState } from '@/components/EmptyState';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuLabel, DropdownMenuSeparator } from '@/components/ui/dropdown-menu';
import { Plus, FolderKanban, Download, Loader2, Camera as CameraIcon, ImagePlus, Zap, Mic, BookOpen } from 'lucide-react';
import { DailyStandupSheet } from '@/components/projects/DailyStandupSheet';
import { WorkLogDialog } from '@/components/projects/WorkLogDialog';
import { useProjectWorkLogs } from '@/hooks/useProjectWorkLogs';
import { useProjectMilestones } from '@/hooks/useProjectMilestones';
import { useTranslation } from 'react-i18next';
import { useCurrency } from '@/contexts/CurrencyContext';
import { showSuccess, showError } from '@/hooks/useStatusFeedback';
import { AnimatePresence, motion } from 'framer-motion';
import { applyTemplateToProject } from '@/lib/projectTemplateApply';
import { useNativeCamera } from '@/hooks/useNativeCamera';
import { dataUrlToFile, saveDocument } from '@/lib/documentStorage';

interface BusinessProjectsProps {
  onRefreshExpenses?: () => void;
}

interface ProjectStat {
  spent: number;
  income: number;
  memberCount: number;
  milestoneCount: number;
  milestones: Array<{ status: any; due_date?: string | null }>;
}

export const BusinessProjects = ({ onRefreshExpenses }: BusinessProjectsProps) => {
  const { t } = useTranslation();
  const { user } = useAuth();
  const { activeBusinessProfileId } = useAppState();
  const { formatAmount } = useCurrency();
  const { projects, loading, addProject, updateProject, deleteProject, refetch } = useProjects();
  const { takePhoto, pickFromGallery, cameraInputRef, galleryInputRef } = useNativeCamera();

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingProject, setEditingProject] = useState<Project | null>(null);
  const [selectedProject, setSelectedProject] = useState<ProjectWithOwnership | null>(null);
  const [detailDialogOpen, setDetailDialogOpen] = useState(false);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [projectToDelete, setProjectToDelete] = useState<string | null>(null);
  const [importDialogOpen, setImportDialogOpen] = useState(false);
  const [personalProjects, setPersonalProjects] = useState<any[]>([]);
  const [loadingPersonal, setLoadingPersonal] = useState(false);
  const [importingIds, setImportingIds] = useState<Set<string>>(new Set());
  const [projectStats, setProjectStats] = useState<Record<string, ProjectStat>>({});
  const [quickPhotoOpen, setQuickPhotoOpen] = useState(false);
  const [quickPhotoUploading, setQuickPhotoUploading] = useState(false);
  const [quickPhotoSource, setQuickPhotoSource] = useState<'camera' | 'gallery' | null>(null);
  const [standupOpen, setStandupOpen] = useState(false);
  const [standupProject, setStandupProject] = useState<ProjectWithOwnership | null>(null);
  const [workLogPickerOpen, setWorkLogPickerOpen] = useState(false);
  const [workLogProjectId, setWorkLogProjectId] = useState<string | null>(null);
  const [workLogDialogOpen, setWorkLogDialogOpen] = useState(false);

  // Show owned projects assigned to this profile + shared projects joined under this profile.
  const businessProjects = useMemo(
    () => projects.filter((p) => {
      if (!activeBusinessProfileId) return false;
      const isOwnedBusinessProject = p.business_profile_id === activeBusinessProfileId;
      const isSharedBusinessProject = !p.isOwner && p.member_context === 'business' && p.member_business_profile_id === activeBusinessProfileId;
      return isOwnedBusinessProject || isSharedBusinessProject;
    }),
    [projects, activeBusinessProfileId]
  );

  // Stable key for stats refetch dependency
  const projectIdsKey = useMemo(
    () => businessProjects.map(p => p.id).sort().join(','),
    [businessProjects]
  );

  // Fetch stats for all business projects (parallel batch query)
  const fetchAllStats = useCallback(async () => {
    if (businessProjects.length === 0) {
      setProjectStats({});
      return;
    }
    const projectIds = businessProjects.map(p => p.id);

    const [expensesRes, fundingRes, milestonesRes, membersRes] = await Promise.all([
      (supabase.from('expenses').select('project_id, amount, type, status, expense_nature') as any).in('project_id', projectIds),
      supabase.from('project_funding').select('project_id, allocated_amount').in('project_id', projectIds),
      supabase.from('project_milestones').select('project_id, status, due_date').in('project_id', projectIds),
      (supabase.from('project_members') as any).select('project_id').in('project_id', projectIds),
    ]);

    const allExpenses = expensesRes.data || [];
    const allFunding = fundingRes.data || [];
    const allMilestones = milestonesRes.data || [];
    const allMembers = membersRes.data || [];

    const { calculateProjectSpent, calculateProjectIncome } = await import('@/lib/projectCalculations');
    const stats: Record<string, ProjectStat> = {};

    for (const project of businessProjects) {
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
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectIdsKey]);

  useEffect(() => { fetchAllStats(); }, [fetchAllStats]);

  const fetchPersonalProjects = async () => {
    if (!user) return;
    setLoadingPersonal(true);
    try {
      const { data, error } = await supabase
        .from('projects')
        .select('*')
        .eq('user_id', user.id)
        .is('business_profile_id', null)
        .order('created_at', { ascending: false });
      if (error) throw error;
      setPersonalProjects(data || []);
    } catch (err) {
      console.error('Error fetching personal projects:', err);
    } finally {
      setLoadingPersonal(false);
    }
  };

  const handleImportProject = async (project: any) => {
    if (!user || !activeBusinessProfileId) return;
    setImportingIds(prev => new Set(prev).add(project.id));
    try {
      const { error } = await supabase
        .from('projects')
        .insert({
          user_id: user.id,
          name: project.name,
          description: project.description,
          icon: project.icon,
          color: project.color,
          status: project.status,
          total_budget: project.total_budget,
          start_date: project.start_date,
          end_date: project.end_date,
          business_profile_id: activeBusinessProfileId,
        });
      if (error) throw error;
      showSuccess(`Projekt "${project.name}" uvezen`);
      refetch();
      onRefreshExpenses?.();
    } catch (err) {
      console.error('Error importing project:', err);
      showError(t('common.error'));
    } finally {
      setImportingIds(prev => { const n = new Set(prev); n.delete(project.id); return n; });
    }
  };

  const handleCloseFullScreen = () => {
    setDetailDialogOpen(false);
    setSelectedProject(null);
    refetch();
    fetchAllStats();
  };

  // Quick FAB: capture/upload a receipt photo and attach to a project
  const openQuickPhoto = (source: 'camera' | 'gallery') => {
    setQuickPhotoSource(source);
    setQuickPhotoOpen(true);
  };

  const handleQuickPhotoForProject = async (projectId: string) => {
    if (!quickPhotoSource) return;
    try {
      const dataUrl = quickPhotoSource === 'camera' ? await takePhoto() : await pickFromGallery();
      if (!dataUrl) return;
      setQuickPhotoUploading(true);
      const file = dataUrlToFile(dataUrl, `racun_${Date.now()}.jpg`);
      const { storage_path, size_bytes, storage_mode } = await saveDocument(projectId, file, 'local');
      const { error } = await (supabase.from('project_documents') as any).insert({
        project_id: projectId,
        name: file.name,
        mime_type: file.type || 'image/jpeg',
        size_bytes,
        storage_mode,
        storage_path,
        document_kind: 'receipt',
        captured_at: new Date().toISOString(),
        uploaded_by: user?.id,
      });
      if (error) throw error;
      showSuccess(t('projects.quickPhoto.saved', 'Račun spremljen u projekt'));
      setQuickPhotoOpen(false);
      setQuickPhotoSource(null);
    } catch (err: any) {
      console.error(err);
      showError(err?.message || t('common.error', 'Greška'));
    } finally {
      setQuickPhotoUploading(false);
    }
  };

  if (loading) {
    return (
      <div className="py-12 flex items-center justify-center">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Hidden inputs used by useNativeCamera on web */}
      <input ref={cameraInputRef} type="file" accept="image/*" capture="environment" className="hidden" />
      <input ref={galleryInputRef} type="file" accept="image/*" className="hidden" />

      {/* Header */}
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <h2 className="text-lg font-semibold flex items-center gap-2">
          <FolderKanban className="w-5 h-5 text-primary" />
          {t('nav.projects', 'Projekti')}
        </h2>
        <div className="flex items-center gap-2">
          {businessProjects.length > 0 && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="outline"
                  size="sm"
                  className="gap-1.5 rounded-xl border-primary/40 text-primary hover:bg-primary/10"
                  title={t('projects.quickPhoto.title', 'Brzi unos računa')}
                >
                  <Zap className="w-4 h-4" />
                  {t('projects.quickPhoto.button', 'Brzi račun')}
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="z-[70]">
                <DropdownMenuLabel className="text-xs">{t('projects.quickPhoto.source', 'Izvor')}</DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={() => openQuickPhoto('camera')}>
                  <CameraIcon className="w-4 h-4 mr-2" />
                  {t('projects.documents.takePhoto', 'Slikaj')}
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => openQuickPhoto('gallery')}>
                  <ImagePlus className="w-4 h-4 mr-2" />
                  {t('projects.documents.gallery', 'Galerija')}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          )}
          {businessProjects.length > 0 && (
            <Button
              variant="outline"
              size="sm"
              className="gap-1.5 rounded-xl"
              onClick={() => { setStandupProject(null); setStandupOpen(true); }}
              title={t('projects.standup.title', 'Dnevni izvještaj')}
            >
              <Mic className="w-4 h-4" />
              {t('projects.standup.button', 'Dnevni izvještaj')}
            </Button>
          )}
          <Button
            variant="outline"
            size="sm"
            className="gap-1.5 rounded-xl"
            onClick={() => { setImportDialogOpen(true); fetchPersonalProjects(); }}
          >
            <Download className="w-4 h-4" />
            {t('projects.importPersonal', 'Uvezi')}
          </Button>
          <Button
            size="sm"
            className="gap-1.5 rounded-xl"
            onClick={() => { setEditingProject(null); setDialogOpen(true); }}
          >
            <Plus className="w-4 h-4" />
            {t('projects.new', 'Novi')}
          </Button>
        </div>
      </div>

      {/* Project List */}
      {businessProjects.length === 0 ? (
        <EmptyState
          variant="projects"
          title={t('projects.noProjects', 'Nema projekata')}
          description={t('projects.noProjectsBusiness', 'Kreirajte novi projekt ili uvezite iz osobnih financija.')}
        />
      ) : (
        <AnimatePresence mode="popLayout">
          <div className="space-y-3">
            {businessProjects.map((project) => (
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
                  onEdit={(p) => { setEditingProject(p); setDialogOpen(true); }}
                  onDelete={(id) => { setProjectToDelete(id); setDeleteConfirmOpen(true); }}
                  onClick={(p) => { setSelectedProject(p); setDetailDialogOpen(true); }}
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
        onSave={async (projectData, template, addContingency) => {
          if (editingProject) {
            await updateProject({ ...editingProject, ...projectData });
          } else {
            const created = await addProject({ ...projectData, business_profile_id: activeBusinessProfileId } as any);
            if (created && (template || (addContingency && (created.total_budget || 0) > 0))) {
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
          setDialogOpen(false);
          setEditingProject(null);
          onRefreshExpenses?.();
        }}
      />

      {/* Full Screen View */}
      <ProjectFullScreenView
        open={detailDialogOpen}
        onClose={handleCloseFullScreen}
        project={selectedProject}
        onRefreshExpenses={() => { refetch(); fetchAllStats(); onRefreshExpenses?.(); }}
      />

      {/* Delete Confirm */}
      <AlertDialog open={deleteConfirmOpen} onOpenChange={setDeleteConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('projects.deleteConfirmTitle', 'Obriši projekt?')}</AlertDialogTitle>
            <AlertDialogDescription>
              {t('projects.deleteConfirmDescription', 'Ova radnja je nepovratna.')}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('common.cancel', 'Odustani')}</AlertDialogCancel>
            <AlertDialogAction
              onClick={async () => {
                if (projectToDelete) {
                  await deleteProject(projectToDelete);
                  setDeleteConfirmOpen(false);
                  setProjectToDelete(null);
                  onRefreshExpenses?.();
                }
              }}
              className="bg-destructive text-destructive-foreground"
            >
              {t('common.delete', 'Obriši')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Quick Photo: pick project */}
      <Dialog open={quickPhotoOpen} onOpenChange={(o) => { if (!o) { setQuickPhotoOpen(false); setQuickPhotoSource(null); } }}>
        <DialogContent className="max-w-md max-h-[70vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Zap className="w-5 h-5 text-primary" />
              {t('projects.quickPhoto.pickProject', 'Odaberi projekt za račun')}
            </DialogTitle>
            <DialogDescription>
              {t('projects.quickPhoto.hint', 'Račun će biti spremljen lokalno na tvom uređaju.')}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2 mt-2">
            {quickPhotoUploading ? (
              <div className="py-8 flex items-center justify-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="w-4 h-4 animate-spin" />
                {t('projects.documents.uploading', 'Učitavanje...')}
              </div>
            ) : (
              businessProjects.map((p) => (
                <button
                  key={p.id}
                  onClick={() => handleQuickPhotoForProject(p.id)}
                  className="w-full flex items-center gap-3 p-3 rounded-xl border border-border/50 hover:bg-accent/50 hover:border-primary/40 transition-colors text-left"
                >
                  <div
                    className="w-10 h-10 rounded-lg flex items-center justify-center text-xl shrink-0"
                    style={{ background: `${p.color || '#3b82f6'}20` }}
                  >
                    {p.icon || '📁'}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium truncate">{p.name}</p>
                    {p.description && (
                      <p className="text-xs text-muted-foreground truncate">{p.description}</p>
                    )}
                  </div>
                </button>
              ))
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* Import from Personal Dialog */}
      <Dialog open={importDialogOpen} onOpenChange={setImportDialogOpen}>
        <DialogContent className="max-w-md max-h-[70vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Download className="w-5 h-5 text-primary" />
              {t('projects.importFromPersonal', 'Uvezi projekt iz osobnih financija')}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-2 mt-2">
            {loadingPersonal ? (
              <div className="py-8 flex items-center justify-center">
                <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
              </div>
            ) : personalProjects.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-8">
                {t('projects.noPersonalProjects', 'Nemate osobnih projekata za uvoz.')}
              </p>
            ) : (
              personalProjects.map((project) => (
                <div
                  key={project.id}
                  className="flex items-center justify-between p-3 rounded-xl border border-border/50 hover:bg-accent/50 transition-colors"
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="text-lg">{project.icon || '📁'}</span>
                    <div className="min-w-0">
                      <p className="text-sm font-medium truncate">{project.name}</p>
                      {project.description && (
                        <p className="text-xs text-muted-foreground truncate">{project.description}</p>
                      )}
                    </div>
                  </div>
                  <Button
                    size="sm"
                    variant="outline"
                    className="shrink-0 gap-1 rounded-lg"
                    disabled={importingIds.has(project.id)}
                    onClick={() => handleImportProject(project)}
                  >
                    {importingIds.has(project.id) ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <Download className="w-3.5 h-3.5" />
                    )}
                    {t('common.import', 'Uvezi')}
                  </Button>
                </div>
              ))
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* Daily Standup Sheet */}
      <DailyStandupSheet
        open={standupOpen}
        onOpenChange={setStandupOpen}
        projects={businessProjects}
        initialProjectId={standupProject?.id || null}
        onApplied={() => { fetchAllStats(); onRefreshExpenses?.(); }}
      />
    </div>
  );
};
