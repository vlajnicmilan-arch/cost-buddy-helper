import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { Expense } from '@/types/expense';
import { showSuccess, showError } from '@/hooks/useStatusFeedback';
import { tr } from '@/lib/errorMessages';

export const usePendingTransactions = (incomeSourceId: string | null) => {
  const { user } = useAuth();
  const [pendingTransactions, setPendingTransactions] = useState<Expense[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchPending = useCallback(async () => {
    if (!incomeSourceId || !user) {
      setLoading(false);
      return;
    }

    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('expenses')
        .select('*')
        .eq('income_source_id', incomeSourceId)
        .eq('status', 'pending')
        .order('created_at', { ascending: false });

      if (error) throw error;
      
      // Convert date strings to Date objects
      const transactions = (data || []).map(t => ({
        ...t,
        date: new Date(t.date)
      })) as Expense[];
      
      setPendingTransactions(transactions);
    } catch (error) {
      console.error('Error fetching pending transactions:', error);
      showError(tr('errors.fetch.pending', 'Greška pri učitavanju transakcija na čekanju'));
    } finally {
      setLoading(false);
    }
  }, [incomeSourceId, user]);

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
      showSuccess('Transakcija odobrena');
    } catch (error) {
      console.error('Error approving transaction:', error);
      showError(tr('errors.transactions.approveFailed', 'Greška pri odobravanju transakcije'));
    }
  };

  const rejectTransaction = async (transactionId: string) => {
    try {
      const { error } = await supabase
        .from('expenses')
        .update({ status: 'rejected' })
        .eq('id', transactionId);

      if (error) throw error;

      setPendingTransactions(prev => prev.filter(t => t.id !== transactionId));
      showSuccess('Transakcija odbijena');
    } catch (error) {
      console.error('Error rejecting transaction:', error);
      showError(tr('errors.transactions.rejectFailed', 'Greška pri odbijanju transakcije'));
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
