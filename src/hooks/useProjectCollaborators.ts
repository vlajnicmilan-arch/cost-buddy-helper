import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { ProjectCollaborator, ProjectCollaboratorInput } from '@/types/projectCollaborator';
import { toast } from 'sonner';
import { useTranslation } from 'react-i18next';

export const useProjectCollaborators = (projectId: string | null) => {
  const { t } = useTranslation();
  const [collaborators, setCollaborators] = useState<ProjectCollaborator[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchCollaborators = useCallback(async () => {
    if (!projectId) {
      setCollaborators([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    try {
      const { data, error } = await (supabase
        .from('project_collaborators') as any)
        .select('*')
        .eq('project_id', projectId)
        .order('created_at', { ascending: false });

      if (error) throw error;

      setCollaborators((data || []).map((c: any) => ({
        ...c,
        total_price: Number(c.total_price),
        paid_amount: Number(c.paid_amount || 0),
      })));
    } catch (error) {
      console.error('Error fetching collaborators:', error);
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => {
    fetchCollaborators();
  }, [fetchCollaborators]);

  const addCollaborator = async (input: ProjectCollaboratorInput) => {
    if (!projectId) return null;
    try {
      const { data, error } = await (supabase
        .from('project_collaborators') as any)
        .insert({
          project_id: projectId,
          first_name: input.first_name,
          last_name: input.last_name,
          company_name: input.company_name || null,
          service_description: input.service_description,
          total_price: input.total_price,
          milestone_id: input.milestone_id || null,
          status: input.status || 'active',
          contact_info: input.contact_info || null,
          note: input.note || null,
        })
        .select()
        .single();

      if (error) throw error;

      const newItem = { ...data, total_price: Number(data.total_price) };
      setCollaborators(prev => [newItem, ...prev]);
      toast.success(t('collaborators.added', 'Suradnik dodan'));
      return newItem;
    } catch (error) {
      console.error('Error adding collaborator:', error);
      toast.error(t('common.error'));
      return null;
    }
  };

  const updateCollaborator = async (collaborator: ProjectCollaborator) => {
    try {
      const { error } = await (supabase
        .from('project_collaborators') as any)
        .update({
          first_name: collaborator.first_name,
          last_name: collaborator.last_name,
          company_name: collaborator.company_name || null,
          service_description: collaborator.service_description,
          total_price: collaborator.total_price,
          milestone_id: collaborator.milestone_id || null,
          status: collaborator.status,
          contact_info: collaborator.contact_info || null,
          note: collaborator.note || null,
        })
        .eq('id', collaborator.id);

      if (error) throw error;

      setCollaborators(prev => prev.map(c => c.id === collaborator.id ? { ...collaborator } : c));
      toast.success(t('collaborators.updated', 'Suradnik ažuriran'));
    } catch (error) {
      console.error('Error updating collaborator:', error);
      toast.error(t('common.error'));
    }
  };

  const deleteCollaborator = async (id: string) => {
    try {
      const { error } = await (supabase
        .from('project_collaborators') as any)
        .delete()
        .eq('id', id);

      if (error) throw error;

      setCollaborators(prev => prev.filter(c => c.id !== id));
      toast.success(t('collaborators.deleted', 'Suradnik uklonjen'));
    } catch (error) {
      console.error('Error deleting collaborator:', error);
      toast.error(t('common.error'));
    }
  };

  const totalCost = collaborators.reduce((sum, c) => sum + c.total_price, 0);

  return {
    collaborators,
    loading,
    addCollaborator,
    updateCollaborator,
    deleteCollaborator,
    refetch: fetchCollaborators,
    totalCost,
  };
};
