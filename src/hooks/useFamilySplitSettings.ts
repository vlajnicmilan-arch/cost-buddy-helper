import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { showError, showSuccess } from '@/hooks/useStatusFeedback';
import { useTranslation } from 'react-i18next';

export type SplitMode = 'equal' | 'proportional_income' | 'manual';
export type SplitIncomeSource = 'auto_3m' | 'declared' | 'hybrid';

export interface FamilySplitSettings {
  split_mode: SplitMode;
  split_income_source: SplitIncomeSource;
  shared_categories: string[];
  currency: string;
}

/**
 * Owner-managed settings for proportional / shared expense splitting.
 * Reads + writes family_groups columns directly (RLS allows owner UPDATE).
 */
export function useFamilySplitSettings(groupId: string | null) {
  const { t } = useTranslation();
  const [settings, setSettings] = useState<FamilySplitSettings | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    if (!groupId) return;
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('family_groups')
        .select('split_mode, split_income_source, shared_categories, currency')
        .eq('id', groupId)
        .maybeSingle();
      if (error) throw error;
      if (data) {
        setSettings({
          split_mode: (data.split_mode as SplitMode) || 'equal',
          split_income_source: (data.split_income_source as SplitIncomeSource) || 'hybrid',
          shared_categories: data.shared_categories || [],
          currency: data.currency || 'EUR',
        });
      }
    } catch (e) {
      console.error('[useFamilySplitSettings] load failed', e);
    } finally {
      setLoading(false);
    }
  }, [groupId]);

  useEffect(() => {
    load();
  }, [load]);

  const save = useCallback(
    async (patch: Partial<FamilySplitSettings>) => {
      if (!groupId) return;
      setSaving(true);
      try {
        const { error } = await supabase
          .from('family_groups')
          .update(patch)
          .eq('id', groupId);
        if (error) throw error;
        setSettings((s) => (s ? { ...s, ...patch } : s));
        showSuccess(t('family.split.settings.saved', 'Postavke spremljene'));
      } catch (e: any) {
        console.error('[useFamilySplitSettings] save failed', e);
        showError(t('family.split.settings.saveError', 'Greška pri spremanju'));
      } finally {
        setSaving(false);
      }
    },
    [groupId, t]
  );

  return { settings, loading, saving, save, reload: load };
}
