import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { showError, showSuccess } from '@/hooks/useStatusFeedback';
import { useTranslation } from 'react-i18next';

export type FamilyRelationship =
  | 'partner'
  | 'child'
  | 'parent'
  | 'sibling'
  | 'roommate'
  | 'grandparent'
  | 'other';

export interface FamilyMemberConsentData {
  id: string;
  user_id: string;
  income_share_consent: boolean;
  income_share_consent_at: string | null;
  declared_monthly_income: number | null;
  declared_income_currency: string;
  monthly_contribution: number;
  relationship: FamilyRelationship | null;
}

/**
 * Returns the *current user's* consent + declared income / contribution for a group.
 * Each member can update only their own row (enforced by RLS).
 */
export function useFamilyMemberConsent(groupId: string | null) {
  const { user } = useAuth();
  const { t } = useTranslation();
  const [data, setData] = useState<FamilyMemberConsentData | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    if (!groupId || !user) return;
    setLoading(true);
    try {
      const { data: row, error } = await supabase
        .from('family_members')
        .select('id, user_id, income_share_consent, income_share_consent_at, declared_monthly_income, declared_income_currency, monthly_contribution')
        .eq('group_id', groupId)
        .eq('user_id', user.id)
        .maybeSingle();
      if (error) throw error;
      if (row) setData(row as FamilyMemberConsentData);
    } catch (e) {
      console.error('[useFamilyMemberConsent] load failed', e);
    } finally {
      setLoading(false);
    }
  }, [groupId, user]);

  useEffect(() => {
    load();
  }, [load]);

  const save = useCallback(
    async (patch: Partial<Omit<FamilyMemberConsentData, 'id' | 'user_id' | 'income_share_consent_at'>>) => {
      if (!data) return;
      setSaving(true);
      try {
        const update: Record<string, unknown> = { ...patch };
        // Stamp consent timestamp when toggled on/off
        if (typeof patch.income_share_consent === 'boolean') {
          update.income_share_consent_at = patch.income_share_consent ? new Date().toISOString() : null;
          // Clear declared income when consent revoked
          if (!patch.income_share_consent) {
            update.declared_monthly_income = null;
          }
        }
        const { error } = await supabase
          .from('family_members')
          .update(update)
          .eq('id', data.id);
        if (error) throw error;
        setData((d) => (d ? { ...d, ...(update as any) } : d));
        showSuccess(t('family.split.consent.saved', 'Spremljeno'));
      } catch (e: any) {
        console.error('[useFamilyMemberConsent] save failed', e);
        showError(t('family.split.consent.saveError', 'Greška pri spremanju'));
      } finally {
        setSaving(false);
      }
    },
    [data, t]
  );

  return { data, loading, saving, save, reload: load };
}
