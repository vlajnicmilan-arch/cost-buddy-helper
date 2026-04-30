import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { showError, showSuccess } from '@/hooks/useStatusFeedback';
import { tr } from '@/lib/errorMessages';

export interface ChecklistItem {
  id: string;
  milestone_id: string;
  user_id: string;
  title: string;
  is_done: boolean;
  sort_order: number;
  done_at?: string | null;
  done_by?: string | null;
  created_at?: string;
  updated_at?: string;
}

export const useMilestoneChecklist = (milestoneId: string | null) => {
  const { user } = useAuth();
  const [items, setItems] = useState<ChecklistItem[]>([]);
  const [loading, setLoading] = useState(false);

  const fetchItems = useCallback(async () => {
    if (!milestoneId || !user) {
      setItems([]);
      return;
    }
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('milestone_checklist_items')
        .select('*')
        .eq('milestone_id', milestoneId)
        .order('sort_order', { ascending: true });
      if (error) throw error;
      setItems(data || []);
    } catch (e) {
      console.error('checklist fetch', e);
    } finally {
      setLoading(false);
    }
  }, [milestoneId, user]);

  useEffect(() => { fetchItems(); }, [fetchItems]);

  const addItem = async (title: string) => {
    if (!user || !milestoneId || !title.trim()) return;
    try {
      const { data, error } = await supabase
        .from('milestone_checklist_items')
        .insert({
          milestone_id: milestoneId,
          user_id: user.id,
          title: title.trim(),
          sort_order: items.length,
        })
        .select()
        .single();
      if (error) throw error;
      setItems(prev => [...prev, data]);
    } catch (e) {
      console.error(e);
      showError(tr('errors.milestone.addFailed', 'Greška kod dodavanja'));
    }
  };

  const addItemsBulk = async (titles: string[]) => {
    if (!user || !milestoneId || titles.length === 0) return;
    try {
      const rows = titles.map((t, i) => ({
        milestone_id: milestoneId,
        user_id: user.id,
        title: t.trim(),
        sort_order: items.length + i,
      }));
      const { data, error } = await supabase
        .from('milestone_checklist_items')
        .insert(rows)
        .select();
      if (error) throw error;
      setItems(prev => [...prev, ...(data || [])]);
      showSuccess(`Dodano ${data?.length} stavki`);
    } catch (e) {
      console.error(e);
      showError(tr('errors.milestone.addFailed', 'Greška kod dodavanja'));
    }
  };

  const toggleItem = async (id: string, is_done: boolean) => {
    try {
      const { error } = await supabase
        .from('milestone_checklist_items')
        .update({
          is_done,
          done_at: is_done ? new Date().toISOString() : null,
          done_by: is_done ? user?.id : null,
        })
        .eq('id', id);
      if (error) throw error;
      setItems(prev => prev.map(it => it.id === id ? {
        ...it, is_done,
        done_at: is_done ? new Date().toISOString() : null,
        done_by: is_done ? user?.id || null : null,
      } : it));
    } catch (e) {
      console.error(e);
      showError(tr('errors.generic', 'Nešto je pošlo po krivu. Pokušajte ponovno.'));
    }
  };

  const updateTitle = async (id: string, title: string) => {
    if (!title.trim()) return;
    try {
      const { error } = await supabase
        .from('milestone_checklist_items')
        .update({ title: title.trim() })
        .eq('id', id);
      if (error) throw error;
      setItems(prev => prev.map(it => it.id === id ? { ...it, title: title.trim() } : it));
    } catch (e) { console.error(e); showError(tr('errors.generic', 'Nešto je pošlo po krivu. Pokušajte ponovno.')); }
  };

  const deleteItem = async (id: string) => {
    try {
      const { error } = await supabase
        .from('milestone_checklist_items')
        .delete()
        .eq('id', id);
      if (error) throw error;
      setItems(prev => prev.filter(it => it.id !== id));
    } catch (e) { console.error(e); showError(tr('errors.generic', 'Nešto je pošlo po krivu. Pokušajte ponovno.')); }
  };

  return { items, loading, addItem, addItemsBulk, toggleItem, updateTitle, deleteItem, refetch: fetchItems };
};

// Predefined checklist templates per milestone keywords
export const CHECKLIST_TEMPLATES: Record<string, string[]> = {
  'žbukanje': ['Pripremiti zid (čišćenje, prajmer)', 'Postaviti vodilice', 'Nanijeti grubu žbuku', 'Izglačati i osušiti', 'Završno brušenje'],
  'pločice': ['Izmjeriti i izrezati', 'Pripremiti ljepilo', 'Postaviti pločice', 'Fugirati', 'Očistiti spojeve'],
  'vodoinstalacije': ['Iskopati/probiti rupe', 'Postaviti cijevi', 'Spojiti odvod', 'Tlačni test', 'Zatvoriti zidove'],
  'elektroinstalacije': ['Označiti šliceve', 'Postaviti cijevi/kanalice', 'Provući kablove', 'Spojiti utičnice/prekidače', 'Test napona'],
  'soboslikarski': ['Zaštititi pod/namještaj', 'Brušenje i kitanje', 'Prajmer', 'Prvi nanos boje', 'Drugi nanos boje'],
  'krov': ['Demontaža starog pokrova', 'Izolacija/folije', 'Letvanje', 'Postavljanje pokrova', 'Olukovi i opšavi'],
  'temelj': ['Iskop', 'Postavljanje armature', 'Oplata', 'Betoniranje', 'Hidroizolacija'],
  'parket': ['Pripremiti podlogu', 'Postaviti podlogu', 'Polagati parket', 'Lajsne', 'Lakiranje'],
  'kuhinja': ['Mjerenje prostora', 'Vodoinstalacije', 'Elektroinstalacije', 'Postavljanje elemenata', 'Spajanje uređaja'],
  'kupaonica': ['Demontaža', 'Vodoinstalacije', 'Hidroizolacija', 'Pločice', 'Sanitarija i spojevi'],
  'fasada': ['Skela', 'Priprema podloge', 'Stiropor/izolacija', 'Mreža i ljepilo', 'Završni sloj'],
  'default': ['Priprema materijala', 'Glavni rad', 'Završni pregled'],
};

export const suggestChecklistTemplate = (milestoneName: string): string[] => {
  const lower = milestoneName.toLowerCase();
  for (const [key, items] of Object.entries(CHECKLIST_TEMPLATES)) {
    if (key !== 'default' && lower.includes(key)) return items;
  }
  return CHECKLIST_TEMPLATES.default;
};
