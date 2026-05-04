import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';

export interface ProjectTemplateMilestone {
  name: string;
  order: number;
  days_offset: number;
}

export interface ProjectTemplate {
  id: string;
  name: string;
  description: string | null;
  icon: string;
  color: string;
  category: string | null;
  default_milestones: ProjectTemplateMilestone[];
  is_public: boolean;
  is_active: boolean;
  created_by: string | null;
}

export const useProjectTemplates = () => {
  const [templates, setTemplates] = useState<ProjectTemplate[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchTemplates = useCallback(async () => {
    setLoading(true);
    try {
      const { data, error } = await (supabase
        .from('project_templates') as any)
        .select('*')
        .eq('is_active', true)
        .order('is_public', { ascending: false })
        .order('name', { ascending: true });
      if (error) throw error;
      setTemplates((data || []) as ProjectTemplate[]);
    } catch (err) {
      console.error('Error fetching project templates:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchTemplates(); }, [fetchTemplates]);

  return { templates, loading, refetch: fetchTemplates };
};
