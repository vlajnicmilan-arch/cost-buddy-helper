import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { showError, showSuccess } from '@/hooks/useStatusFeedback';
import { tr } from '@/lib/errorMessages';

export interface ProjectShareLink {
  id: string;
  project_id: string;
  token: string;
  created_by: string;
  show_financials: boolean;
  show_photos: boolean;
  show_milestones: boolean;
  expires_at?: string | null;
  revoked_at?: string | null;
  last_viewed_at?: string | null;
  view_count: number;
  created_at?: string;
}

export const useProjectShareLinks = (projectId: string | null) => {
  const { user } = useAuth();
  const [links, setLinks] = useState<ProjectShareLink[]>([]);
  const [loading, setLoading] = useState(false);

  const fetch = useCallback(async () => {
    if (!projectId || !user) { setLinks([]); return; }
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('project_share_links')
        .select('*')
        .eq('project_id', projectId)
        .order('created_at', { ascending: false });
      if (error) throw error;
      setLinks(data || []);
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  }, [projectId, user]);

  useEffect(() => { fetch(); }, [fetch]);

  const create = async (opts: {
    show_financials?: boolean;
    show_photos?: boolean;
    show_milestones?: boolean;
    expires_at?: string | null;
  } = {}) => {
    if (!user || !projectId) return null;
    try {
      const { data, error } = await supabase
        .from('project_share_links')
        .insert({
          project_id: projectId,
          created_by: user.id,
          show_financials: opts.show_financials ?? false,
          show_photos: opts.show_photos ?? true,
          show_milestones: opts.show_milestones ?? true,
          expires_at: opts.expires_at || null,
        })
        .select()
        .single();
      if (error) throw error;
      setLinks(prev => [data, ...prev]);
      showSuccess('Link kreiran');
      return data;
    } catch (e) { console.error(e); showError(tr('errors.generic', 'Nešto je pošlo po krivu. Pokušajte ponovno.')); return null; }
  };

  const update = async (id: string, patch: Partial<ProjectShareLink>) => {
    try {
      const { error } = await supabase
        .from('project_share_links')
        .update(patch)
        .eq('id', id);
      if (error) throw error;
      setLinks(prev => prev.map(l => l.id === id ? { ...l, ...patch } : l));
    } catch (e) { console.error(e); showError(tr('errors.generic', 'Nešto je pošlo po krivu. Pokušajte ponovno.')); }
  };

  const revoke = async (id: string) => {
    await update(id, { revoked_at: new Date().toISOString() });
    showSuccess('Link opozvan');
  };

  const remove = async (id: string) => {
    try {
      const { error } = await supabase
        .from('project_share_links')
        .delete()
        .eq('id', id);
      if (error) throw error;
      setLinks(prev => prev.filter(l => l.id !== id));
      showSuccess('Obrisano');
    } catch (e) { console.error(e); showError(tr('errors.generic', 'Nešto je pošlo po krivu. Pokušajte ponovno.')); }
  };

  return { links, loading, create, update, revoke, remove, refetch: fetch };
};
