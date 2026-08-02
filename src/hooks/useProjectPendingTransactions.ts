import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { showSuccess, showError } from '@/hooks/useStatusFeedback';
import { useTranslation } from 'react-i18next';
import { invokeNotifyFunction } from '@/lib/notifyHelper';

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
  status?: string | null;
  rejection_reason?: string | null;
}

export const useProjectPendingTransactions = (projectId: string | null) => {
  const { user } = useAuth();
  const { t } = useTranslation();
  const [pendingTransactions, setPendingTransactions] = useState<ProjectPendingTransaction[]>([]);
  // Korak E: odbijeni zapisi ostaju vidljivi (s razlogom), bez učinka na zbrojeve.
  const [rejectedTransactions, setRejectedTransactions] = useState<ProjectPendingTransaction[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchPending = useCallback(async () => {
    if (!projectId || !user) {
      setPendingTransactions([]);
      setRejectedTransactions([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    try {
      const { data, error } = await (supabase
        .from('expenses')
        .select('*') as any)
        .eq('project_id', projectId)
        .in('status', ['pending', 'rejected'])
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

      setPendingTransactions(transactions.filter((t: any) => t.status === 'pending'));
      setRejectedTransactions(transactions.filter((t: any) => t.status === 'rejected'));
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
      // Korak E: stanje se mijenja isključivo kroz namjenski RPC
      // (trigger `trg_guard_expense_review_writes` je druga brava).
      const { error } = await (supabase.rpc as any)('review_project_expense', {
        p_expense_id: transactionId,
        p_decision: 'approve',
        p_reason: null,
      });

      if (error) throw error;

      // Notify project members that an approved transaction now exists (fire-and-forget).
      if (projectId) {
        invokeNotifyFunction({
          functionName: 'notify-project-transaction',
          body: { expense_id: transactionId, project_id: projectId, action: 'created' },
        });
      }

      invokeNotifyFunction({
        functionName: 'notify-project-expense-review',
        body: { expense_id: transactionId, action: 'reviewed', decision: 'approve' },
      });

      setPendingTransactions(prev => prev.filter(t => t.id !== transactionId));
      showSuccess(t('projects.transactionApproved', 'Transakcija odobrena'));
    } catch (error) {
      console.error('Error approving transaction:', error);
      showError(t('common.error'));
    }
  };

  const rejectTransaction = async (transactionId: string, reason?: string) => {
    try {
      // Odbijeni trošak OSTAJE kao zapis (bez učinka na saldo) — nema brisanja.
      const { error } = await (supabase.rpc as any)('review_project_expense', {
        p_expense_id: transactionId,
        p_decision: 'reject',
        p_reason: reason ?? null,
      });

      if (error) throw error;

      invokeNotifyFunction({
        functionName: 'notify-project-expense-review',
        body: {
          expense_id: transactionId,
          action: 'reviewed',
          decision: 'reject',
          rejection_reason: reason ?? null,
        },
      });

      setPendingTransactions(prev => prev.filter(t => t.id !== transactionId));
      showSuccess(t('projects.transactionRejected', 'Transakcija odbijena'));
    } catch (error) {
      console.error('Error rejecting transaction:', error);
      showError(t('common.error'));
    }
  };

  return {
    pendingTransactions,
    rejectedTransactions,
    loading,
    approveTransaction,
    rejectTransaction,
    refetch: fetchPending,
    pendingCount: pendingTransactions.length
  };
};
