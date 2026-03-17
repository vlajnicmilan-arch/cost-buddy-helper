import { useState, useEffect } from 'react';
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
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { Plus, FolderKanban, Download, Loader2, Check } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useCurrency } from '@/contexts/CurrencyContext';
import { toast } from 'sonner';
import { AnimatePresence, motion } from 'framer-motion';

interface BusinessProjectsProps {
  onRefreshExpenses?: () => void;
}

export const BusinessProjects = ({ onRefreshExpenses }: BusinessProjectsProps) => {
  const { t } = useTranslation();
  const { user } = useAuth();
  const { activeBusinessProfileId } = useAppState();
  const { formatAmount } = useCurrency();
  const { projects, loading, addProject, updateProject, deleteProject, refetch } = useProjects();

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

  // Filter only business projects for this profile
  const businessProjects = projects.filter(p => 
    (p as any).business_profile_id === activeBusinessProfileId
  );

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
      // Create a copy of the project linked to the business profile
      const { data, error } = await supabase
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
        })
        .select()
        .single();

      if (error) throw error;

      toast.success(t('projects.imported', `Projekt "${project.name}" uvezen`).replace('"', '"'));
      refetch();
      onRefreshExpenses?.();
    } catch (err) {
      console.error('Error importing project:', err);
      toast.error(t('common.error'));
    } finally {
      setImportingIds(prev => {
        const next = new Set(prev);
        next.delete(project.id);
        return next;
      });
    }
  };

  const handleDeleteProject = async () => {
    if (!projectToDelete) return;
    await deleteProject(projectToDelete);
    setDeleteConfirmOpen(false);
    setProjectToDelete(null);
    onRefreshExpenses?.();
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
      {/* Header */}
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold flex items-center gap-2">
          <FolderKanban className="w-5 h-5 text-primary" />
          {t('nav.projects', 'Projekti')}
        </h2>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            className="gap-1.5 rounded-xl"
            onClick={() => {
              setImportDialogOpen(true);
              fetchPersonalProjects();
            }}
          >
            <Download className="w-4 h-4" />
            {t('projects.importPersonal', 'Uvezi')}
          </Button>
          <Button
            size="sm"
            className="gap-1.5 rounded-xl"
            onClick={() => {
              setEditingProject(null);
              setDialogOpen(true);
            }}
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
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {businessProjects.map((project) => (
              <motion.div
                key={project.id}
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.95 }}
              >
                <ProjectCard
                  project={project}
                  onClick={() => {
                    setSelectedProject(project);
                    setDetailDialogOpen(true);
                  }}
                  onEdit={(p) => {
                    setEditingProject(p);
                    setDialogOpen(true);
                  }}
                  onDelete={(id) => {
                    setProjectToDelete(id);
                    setDeleteConfirmOpen(true);
                  }}
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
        onSave={async (projectData) => {
          if (editingProject) {
            await updateProject({ ...editingProject, ...projectData });
          } else {
            await addProject({ ...projectData, business_profile_id: activeBusinessProfileId } as any);
          }
          setDialogOpen(false);
          setEditingProject(null);
          onRefreshExpenses?.();
        }}
      />

      {/* Full Screen View */}
      {selectedProject && (
        <ProjectFullScreenView
          project={selectedProject}
          open={detailDialogOpen}
          onOpenChange={setDetailDialogOpen}
          onEdit={(p) => {
            setEditingProject(p);
            setDialogOpen(true);
          }}
          onDelete={(id) => {
            setProjectToDelete(id);
            setDeleteConfirmOpen(true);
          }}
          onUpdate={async (p) => {
            await updateProject(p);
            refetch();
          }}
        />
      )}

      {/* Delete Confirm */}
      <AlertDialog open={deleteConfirmOpen} onOpenChange={setDeleteConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('projects.deleteConfirmTitle', 'Obriši projekt?')}</AlertDialogTitle>
            <AlertDialogDescription>
              {t('projects.deleteConfirmDescription', 'Ova radnja je nepovratna. Svi podaci projekta bit će trajno obrisani.')}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('common.cancel', 'Odustani')}</AlertDialogCancel>
            <AlertDialogAction onClick={handleDeleteProject} className="bg-destructive text-destructive-foreground">
              {t('common.delete', 'Obriši')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

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
    </div>
  );
};
