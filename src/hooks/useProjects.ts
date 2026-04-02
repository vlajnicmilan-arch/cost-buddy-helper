import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { Project, ProjectWithOwnership, ProjectRole, ProjectStatus } from '@/types/project';
import { toast } from 'sonner';
import { useTranslation } from 'react-i18next';
import { useAppState } from '@/contexts/AppStateContext';

const LOCAL_PROJECTS_KEY = 'finmate.projects';

export const useProjects = () => {
  const { user } = useAuth();
  const { t } = useTranslation();
  const { emitAvatarEvent, activeBusinessProfileId } = useAppState();
  const [projects, setProjects] = useState<ProjectWithOwnership[]>([]);
  const [loading, setLoading] = useState(true);

  const isLocalMode = !user;

  const fetchProjects = useCallback(async () => {
    setLoading(true);
    try {
      if (isLocalMode) {
        // Local mode - load from localStorage
        const stored = localStorage.getItem(LOCAL_PROJECTS_KEY);
        if (stored) {
          const parsed = JSON.parse(stored);
          setProjects(parsed.map((p: Project) => ({ ...p, isOwner: true, role: 'manager' as ProjectRole })));
        } else {
          setProjects([]);
        }
      } else {
        // Cloud mode - fetch from Supabase
        // 1. Fetch owned projects with business context filter
        let ownedQuery = supabase
          .from('projects')
          .select('*')
          .eq('user_id', user.id)
          .order('created_at', { ascending: false });

        if (activeBusinessProfileId) {
          ownedQuery = ownedQuery.eq('business_profile_id', activeBusinessProfileId);
        }
        // Personal mode: show ALL projects (including migrated ones with basic tabs)

        const { data: ownedProjects, error: ownedError } = await ownedQuery;

        if (ownedError) throw ownedError;

        // 2. Fetch projects where user is a member
        const { data: membershipData, error: membershipError } = await supabase
          .from('project_members')
          .select('project_id, role')
          .eq('user_id', user.id);

        if (membershipError) throw membershipError;

        const memberProjectIds = membershipData
          ?.filter(m => !ownedProjects?.some(p => p.id === m.project_id))
          .map(m => m.project_id) || [];

        let sharedProjects: Project[] = [];
        if (memberProjectIds.length > 0) {
          let sharedQuery = supabase
            .from('projects')
            .select('*')
            .in('id', memberProjectIds);

          if (activeBusinessProfileId) {
            sharedQuery = sharedQuery.eq('business_profile_id', activeBusinessProfileId);
          }
          // Personal mode: show ALL shared projects too

          const { data: shared, error: sharedError } = await sharedQuery;

          if (!sharedError && shared) {
            sharedProjects = shared.map(p => ({
              ...p,
              status: p.status as ProjectStatus,
              total_budget: Number(p.total_budget) || 0
            }));
          }
        }

        // Combine and mark ownership
        const memberRoleMap = new Map(membershipData?.map(m => [m.project_id, m.role as ProjectRole]));
        
        const allProjects: ProjectWithOwnership[] = [
          ...(ownedProjects || []).map(p => ({ 
            ...p, 
            status: p.status as ProjectStatus,
            isOwner: true, 
            role: 'manager' as ProjectRole,
            total_budget: Number(p.total_budget) || 0
          })),
          ...sharedProjects.map(p => ({ 
            ...p, 
            isOwner: false, 
            role: memberRoleMap.get(p.id) || 'member' as ProjectRole,
            total_budget: Number(p.total_budget) || 0
          })),
        ];

        // Sort by created_at
        allProjects.sort((a, b) => 
          new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime()
        );

        setProjects(allProjects);
      }
    } catch (error) {
      console.error('Error fetching projects:', error);
      toast.error(t('common.error'));
    } finally {
      setLoading(false);
    }
  }, [user, isLocalMode, t, activeBusinessProfileId]);

  useEffect(() => {
    fetchProjects();
  }, [fetchProjects]);

  const addProject = async (
    project: Omit<Project, 'id' | 'user_id' | 'created_at' | 'updated_at'>
  ): Promise<ProjectWithOwnership | null> => {
    try {
      if (isLocalMode) {
        const newProject: ProjectWithOwnership = {
          ...project,
          id: crypto.randomUUID(),
          user_id: 'local',
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
          isOwner: true,
          role: 'manager'
        };
        const updated = [newProject, ...projects];
        localStorage.setItem(LOCAL_PROJECTS_KEY, JSON.stringify(updated));
        setProjects(updated);
        emitAvatarEvent('happy', 'Novi projekt, nove prilike! 🚀');
        toast.success(t('projects.created'));
        return newProject;
      }

      const { data, error } = await supabase
        .from('projects')
        .insert({
          user_id: user!.id,
          name: project.name,
          description: project.description,
          icon: project.icon,
          color: project.color,
          status: project.status,
          total_budget: project.total_budget,
          start_date: project.start_date,
          end_date: project.end_date,
          business_profile_id: (project as any).business_profile_id || activeBusinessProfileId || null,
        })
        .select()
        .single();

      if (error) throw error;

      const newProject: ProjectWithOwnership = {
        ...data,
        status: data.status as ProjectStatus,
        total_budget: Number(data.total_budget) || 0,
        isOwner: true,
        role: 'manager'
      };
      
      setProjects(prev => [newProject, ...prev]);
      emitAvatarEvent('happy', 'Novi projekt, nove prilike! 🚀');
      toast.success(t('projects.created'));
      return newProject;
    } catch (error) {
      console.error('Error adding project:', error);
      toast.error(t('common.error'));
      return null;
    }
  };

  const updateProject = async (project: Project): Promise<void> => {
    try {
      if (isLocalMode) {
        const updated = projects.map(p => 
          p.id === project.id 
            ? { ...project, updated_at: new Date().toISOString(), isOwner: true, role: 'manager' as ProjectRole } 
            : p
        );
        localStorage.setItem(LOCAL_PROJECTS_KEY, JSON.stringify(updated));
        setProjects(updated);
        toast.success(t('projects.updated'));
        return;
      }

      // Check if budget changed for revision log
      const currentProject = projects.find(p => p.id === project.id);
      const budgetChanged = currentProject && Number(currentProject.total_budget) !== Number(project.total_budget);

      const { error } = await supabase
        .from('projects')
        .update({
          name: project.name,
          description: project.description,
          icon: project.icon,
          color: project.color,
          status: project.status,
          total_budget: project.total_budget,
          start_date: project.start_date,
          end_date: project.end_date,
        })
        .eq('id', project.id);

      if (error) throw error;

      // Log budget revision if budget changed
      if (budgetChanged && currentProject) {
        await (supabase.from('project_budget_revisions') as any)
          .insert({
            project_id: project.id,
            user_id: user!.id,
            previous_amount: Number(currentProject.total_budget),
            new_amount: Number(project.total_budget),
            reason: null,
          });
      }

      setProjects(prev => prev.map(p => 
        p.id === project.id 
          ? { ...project, total_budget: Number(project.total_budget), isOwner: p.isOwner, role: p.role } 
          : p
      ));
      toast.success(t('projects.updated'));
    } catch (error) {
      console.error('Error updating project:', error);
      toast.error(t('common.error'));
    }
  };

  const deleteProject = async (id: string): Promise<void> => {
    try {
      if (isLocalMode) {
        const updated = projects.filter(p => p.id !== id);
        localStorage.setItem(LOCAL_PROJECTS_KEY, JSON.stringify(updated));
        setProjects(updated);
        toast.success(t('projects.deleted'));
        return;
      }

      const { error } = await supabase
        .from('projects')
        .delete()
        .eq('id', id);

      if (error) throw error;

      setProjects(prev => prev.filter(p => p.id !== id));
      toast.success(t('projects.deleted'));
    } catch (error) {
      console.error('Error deleting project:', error);
      toast.error(t('common.error'));
    }
  };

  const migrateToBusinessMode = async (projectId: string, businessProfileId: string): Promise<boolean> => {
    try {
      if (isLocalMode) {
        const updated = projects.map(p =>
          p.id === projectId
            ? { ...p, business_profile_id: businessProfileId, updated_at: new Date().toISOString() }
            : p
        );
        localStorage.setItem(LOCAL_PROJECTS_KEY, JSON.stringify(updated));
        setProjects(updated);
        toast.success(t('projects.migratedToBusiness', 'Projekt premješten u poslovni mod'));
        return true;
      }

      // Update project
      const { error } = await supabase
        .from('projects')
        .update({ business_profile_id: businessProfileId })
        .eq('id', projectId);

      if (error) throw error;

      // Also update all related transactions
      await (supabase
        .from('expenses') as any)
        .update({ business_profile_id: businessProfileId })
        .eq('project_id', projectId)
        .is('business_profile_id', null);

      // Remove from current view (user will see it when switching to business mode)
      setProjects(prev => prev.filter(p => p.id !== projectId));
      toast.success(t('projects.migratedToBusiness', 'Projekt premješten u poslovni mod'));
      return true;
    } catch (error) {
      console.error('Error migrating project:', error);
      toast.error(t('common.error'));
      return false;
    }
  };

  const getProjectById = (id: string): ProjectWithOwnership | undefined => {
    return projects.find(p => p.id === id);
  };

  return {
    projects,
    loading,
    addProject,
    updateProject,
    deleteProject,
    migrateToBusinessMode,
    getProjectById,
    refetch: fetchProjects,
    isLocalMode,
    activeBusinessProfileId
  };
};
