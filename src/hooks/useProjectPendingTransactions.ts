import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { showSuccess, showError } from '@/hooks/useStatusFeedback';
import { useTranslation } from 'react-i18next';

export interface ProjectPendingTransaction {
  id: string;
  user_id: string;
  amount: number;
  description: string;
  category: string;
  date: string;
  type: string;
  milestone_id?: string | null;
  submitted_by?: string | null;
  submitter_name?: string;
}

export const useProjectPendingTransactions = (projectId: string | null) => {
  const { user } = useAuth();
  const { t } = useTranslation();
  const [pendingTransactions, setPendingTransactions] = useState<ProjectPendingTransaction[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchPending = useCallback(async () => {
    if (!projectId || !user) {
      setPendingTransactions([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    try {
      const { data, error } = await (supabase
        .from('expenses')
        .select('*') as any)
        .eq('project_id', projectId)
        .eq('status', 'pending')
        .order('created_at', { ascending: false });

      if (error) throw error;

      // Fetch submitter names
      const submitterIds = [...new Set((data || []).map((t: any) => t.submitted_by).filter(Boolean))] as string[];
      let submitterMap = new Map<string, string>();

      if (submitterIds.length > 0) {
        const { data: profiles } = await supabase
          .from('profiles')
          .select('user_id, display_name')
          .in('user_id', submitterIds);

        profiles?.forEach(p => {
          submitterMap.set(p.user_id, p.display_name || 'Nepoznato');
        });
      }

      const transactions = (data || []).map(t => ({
        ...t,
        submitter_name: t.submitted_by ? submitterMap.get(t.submitted_by) || 'Nepoznato' : undefined
      }));

      setPendingTransactions(transactions);
    } catch (error) {
      console.error('Error fetching pending project transactions:', error);
      showError(t('common.error'));
    } finally {
      setLoading(false);
    }
  }, [projectId, user, t]);

  useEffect(() => {
    fetchPending();
  }, [fetchPending]);

  const approveTransaction = async (transactionId: string) => {
    try {
      const { error } = await supabase
        .from('expenses')
        .update({ status: 'approved' })
        .eq('id', transactionId);

      if (error) throw error;

      setPendingTransactions(prev => prev.filter(t => t.id !== transactionId));
      showSuccess(t('projects.transactionApproved', 'Transakcija odobrena'));
    } catch (error) {
      console.error('Error approving transaction:', error);
      showError(t('common.error'));
    }
  };

  const rejectTransaction = async (transactionId: string) => {
    try {
      const { error } = await supabase
        .from('expenses')
        .delete()
        .eq('id', transactionId);

      if (error) throw error;

      setPendingTransactions(prev => prev.filter(t => t.id !== transactionId));
      showSuccess(t('projects.transactionRejected', 'Transakcija odbijena'));
    } catch (error) {
      console.error('Error rejecting transaction:', error);
      showError(t('common.error'));
    }
  };

  return {
    pendingTransactions,
    loading,
    approveTransaction,
    rejectTransaction,
    refetch: fetchPending,
    pendingCount: pendingTransactions.length
  };
};
