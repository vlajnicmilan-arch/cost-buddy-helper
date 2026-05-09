import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from './useAuth';
import { useAppState } from '@/contexts/AppStateContext';
import { BusinessDebt, DebtType, DebtStatus } from '@/types/businessDebt';
import { showSuccess, showError } from '@/hooks/useStatusFeedback';
import { useTranslation } from 'react-i18next';

export const useBusinessDebts = () => {
  const { t } = useTranslation();
  const { user } = useAuth();
  const { activeBusinessProfileId } = useAppState();
  const [debts, setDebts] = useState<BusinessDebt[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchDebts = useCallback(async () => {
    if (!user || !activeBusinessProfileId) {
      setDebts([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('business_debts' as any)
        .select('*')
        .eq('user_id', user.id)
        .eq('business_profile_id', activeBusinessProfileId)
        .order('created_at', { ascending: false });
      if (error) throw error;
      setDebts((data as any[]) || []);
    } catch (e) {
      console.error('Error fetching debts:', e);
    } finally {
      setLoading(false);
    }
  }, [user, activeBusinessProfileId]);

  useEffect(() => { fetchDebts(); }, [fetchDebts]);

  const addDebt = async (debt: Omit<BusinessDebt, 'id' | 'user_id' | 'created_at' | 'updated_at'>) => {
    if (!user) return;
    const { error } = await supabase
      .from('business_debts' as any)
      .insert({ ...debt, user_id: user.id } as any);
    if (error) { showError(t('toasts.premiseAddError')); return; }
    showSuccess(t('toasts.debtAdded'));
    fetchDebts();
  };

  const updateDebt = async (id: string, updates: Partial<BusinessDebt>) => {
    const { error } = await supabase
      .from('business_debts' as any)
      .update(updates as any)
      .eq('id', id);
    if (error) { showError(t('toasts.recategorizeError')); return; }
    showSuccess(t('toasts.updated'));
    fetchDebts();
  };

  const deleteDebt = async (id: string) => {
    const { error } = await supabase
      .from('business_debts' as any)
      .delete()
      .eq('id', id);
    if (error) { showError(t('toasts.cashRegisterDeleteError')); return; }
    showSuccess(t('toasts.deleted'));
    fetchDebts();
  };

  const totalReceivable = debts.filter(d => d.type === 'receivable' && d.status === 'active').reduce((s, d) => s + d.amount - d.paid_amount, 0);
  const totalPayable = debts.filter(d => d.type === 'payable' && d.status === 'active').reduce((s, d) => s + d.amount - d.paid_amount, 0);

  return { debts, loading, addDebt, updateDebt, deleteDebt, totalReceivable, totalPayable, refetch: fetchDebts };
};
