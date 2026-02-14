import { useState, useMemo, useEffect, useCallback } from 'react';
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
import { Plus, FolderKanban, Loader2, Search, X } from 'lucide-react';
import { AnimatePresence, motion } from 'framer-motion';
import { useCurrency } from '@/contexts/CurrencyContext';
import { supabase } from '@/integrations/supabase/client';

interface ProjectsPanelProps {
  onRefreshExpenses?: () => void;
}

export const ProjectsPanel = ({ onRefreshExpenses }: ProjectsPanelProps) => {
  const { t } = useTranslation();
  const { projects, loading, addProject, updateProject, deleteProject, refetch } = useProjects();
  const { formatAmount } = useCurrency();

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingProject, setEditingProject] = useState<Project | null>(null);
  const [selectedProject, setSelectedProject] = useState<ProjectWithOwnership | null>(null);
  const [detailDialogOpen, setDetailDialogOpen] = useState(false);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [projectToDelete, setProjectToDelete] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');

  // Fetch stats for all projects - unified logic: spent = sum of completed milestones budgets
  const [projectStats, setProjectStats] = useState<Record<string, { spent: number; income: number; memberCount: number; milestoneCount: number }>>({});

  const fetchAllStats = useCallback(async () => {
    if (projects.length === 0) return;

    const stats: Record<string, { spent: number; income: number; memberCount: number; milestoneCount: number }> = {};
    
    for (const project of projects) {
      // Fetch income transactions for this project (approved or null status = approved)
      const { data: expenses, error: expError } = await (supabase
        .from('expenses')
        .select('amount, type, status') as any)
        .eq('project_id', project.id);

      if (expError) {
        console.error('Error fetching project expenses:', expError);
      }

      // Filter only approved income transactions
      const approvedIncomes = (expenses || []).filter(
        (e: any) => e.type === 'income' && (!e.status || e.status === 'approved')
      );

      const income = approvedIncomes.reduce((sum: number, e: any) => sum + Number(e.amount), 0);

      // Fetch project_funding to add allocated amounts
      const { data: fundingData, error: fundError } = await supabase
        .from('project_funding')
        .select('allocated_amount')
        .eq('project_id', project.id);

      if (fundError) {
        console.error('Error fetching project funding:', fundError);
      }

      const fundingTotal = (fundingData || []).reduce((sum, f) => sum + Number(f.allocated_amount || 0), 0);
      const totalIncome = income + fundingTotal;

      // Fetch milestones to calculate spent (sum of completed milestones budgets)
      const { data: milestones, error: msError } = await supabase
        .from('project_milestones')
        .select('budget, status')
        .eq('project_id', project.id);

      if (msError) {
        console.error('Error fetching milestones:', msError);
      }

      const completedMilestones = (milestones || []).filter((m: any) => m.status === 'completed');
      const spent = completedMilestones.reduce((sum: number, m: any) => sum + Number(m.budget || 0), 0);
      const milestoneCount = (milestones || []).length;

      // Fetch member count
      const { count: memberCount } = await (supabase
        .from('project_members') as any)
        .select('*', { count: 'exact', head: true })
        .eq('project_id', project.id);

      stats[project.id] = {
        spent,
        income: totalIncome,
        memberCount: memberCount || 0,
        milestoneCount
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

  const handleProjectClick = (project: ProjectWithOwnership) => {
    setSelectedProject(project);
    setDetailDialogOpen(true);
  };

  const handleCloseFullScreen = () => {
    setDetailDialogOpen(false);
    setSelectedProject(null);
    refetch();
    fetchAllStats();
  };

  const handleSave = async (projectData: Omit<Project, 'id' | 'user_id' | 'created_at' | 'updated_at'>) => {
    await addProject(projectData);
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

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="font-semibold flex items-center gap-2">
          <FolderKanban className="w-5 h-5" />
          {t('projects.title')}
        </h3>
        <Button onClick={() => { setEditingProject(null); setDialogOpen(true); }} size="sm">
          <Plus className="w-4 h-4 mr-2" />
          {t('projects.add')}
        </Button>
      </div>

      {/* Search */}
      {projects.length > 0 && (
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

      {projects.length === 0 ? (
        <div className="text-center py-8 text-muted-foreground">
          <FolderKanban className="w-12 h-12 mx-auto mb-2 opacity-50" />
          <p>{t('projects.noProjects')}</p>
          <p className="text-sm">{t('projects.noProjectsHint')}</p>
        </div>
      ) : (
        <AnimatePresence mode="popLayout">
          <div className="space-y-3">
            {projects
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
                  onEdit={handleEdit}
                  onDelete={handleDelete}
                  onClick={handleProjectClick}
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
    </div>
  );
};
