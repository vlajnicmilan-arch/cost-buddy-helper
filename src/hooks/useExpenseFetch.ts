import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Expense, Category, PaymentSource, TransactionType } from '@/types/expense';
import { useAuth } from './useAuth';
import { useStorage } from '@/contexts/StorageContext';
import { useAppState } from '@/contexts/AppStateContext';
import { toast } from 'sonner';
import { getLocalExpenses, initLocalDB } from '@/lib/storage/indexedDB';

export const useExpenseFetch = () => {
  const { user } = useAuth();
  const { storageMode } = useStorage();
  const { activeBusinessProfileId } = useAppState();

  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [ownedSourceIds, setOwnedSourceIds] = useState<Set<string>>(new Set());
  const [sharedPaymentSourceIds, setSharedPaymentSourceIds] = useState<Set<string>>(new Set());
  const [fullAccessSourceIds, setFullAccessSourceIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const realtimeChannelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);

  const isLocalMode = storageMode === 'local' && !user;

  const fetchOwnedSources = useCallback(async () => {
    if (isLocalMode || !user) {
      setOwnedSourceIds(new Set());
      setSharedPaymentSourceIds(new Set());
      setFullAccessSourceIds(new Set());
      return;
    }

    try {
      const [incomeRes, memberRes, ownedPsRes] = await Promise.all([
        supabase.from('income_sources').select('id').eq('user_id', user.id),
        supabase.from('payment_source_members').select('payment_source_id, role').eq('user_id', user.id),
        supabase.from('custom_payment_sources').select('id').eq('user_id', user.id),
      ]);

      if (incomeRes.error) throw incomeRes.error;
      setOwnedSourceIds(new Set((incomeRes.data || []).map(s => s.id)));

      const psIds = new Set<string>();
      const fullIds = new Set<string>();
      (memberRes.data || []).forEach(m => {
        psIds.add(m.payment_source_id);
        if (m.role === 'full') fullIds.add(m.payment_source_id);
      });
      (ownedPsRes.data || []).forEach(s => {
        psIds.add(s.id);
        fullIds.add(s.id);
      });
      setSharedPaymentSourceIds(psIds);
      setFullAccessSourceIds(fullIds);
    } catch (error) {
      console.error('Error fetching owned sources:', error);
    }
  }, [user, isLocalMode]);

  const fetchExpenses = useCallback(async () => {
    setLoading(true);
    try {
      if (isLocalMode) {
        await initLocalDB();
        const localExpenses = await getLocalExpenses();
        setExpenses(localExpenses);
      } else {
        if (!user) {
          setExpenses([]);
          setLoading(false);
          return;
        }

        const { data, error } = await supabase
          .from('expenses')
          .select('*')
          .order('date', { ascending: false });

        if (error) throw error;

        setExpenses(data?.map(e => ({
          ...e,
          date: new Date(e.date),
          category: e.category as Category,
          type: e.type as TransactionType,
          payment_source: (e.payment_source || 'cash') as PaymentSource,
          income_source_id: e.income_source_id,
          payment_source_card_id: e.payment_source_card_id,
          expense_nature: (e.expense_nature as 'regular' | 'extraordinary') || undefined
        })) || []);
      }
    } catch (error) {
      console.error('Error fetching expenses:', error);
      toast.error('Greška pri učitavanju troškova');
    } finally {
      setLoading(false);
    }
  }, [user, isLocalMode]);

  const parseExpense = useCallback((raw: Record<string, unknown>): Expense => ({
    ...(raw as unknown as Expense),
    date: new Date(raw.date as string),
    category: raw.category as Category,
    type: raw.type as TransactionType,
    payment_source: ((raw.payment_source as string) || 'cash') as PaymentSource,
    income_source_id: raw.income_source_id as string | undefined,
    payment_source_card_id: raw.payment_source_card_id as string | undefined,
    expense_nature: (raw.expense_nature as 'regular' | 'extraordinary') || undefined,
  }), []);

  // Initial data load
  useEffect(() => {
    fetchOwnedSources();
    fetchExpenses();
  }, [fetchOwnedSources, fetchExpenses]);

  // Realtime subscription for cloud mode
  useEffect(() => {
    if (isLocalMode || !user) return;

    // Clean up existing channel
    if (realtimeChannelRef.current) {
      supabase.removeChannel(realtimeChannelRef.current);
    }

    const channel = supabase
      .channel(`expenses-realtime-${user.id}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'expenses',
        },
        (payload) => {
          const newExpense = parseExpense(payload.new as Record<string, unknown>);
          setExpenses(prev => {
            // Avoid duplicate if already added optimistically
            if (prev.some(e => e.id === newExpense.id)) return prev;
            return [newExpense, ...prev].sort((a, b) => b.date.getTime() - a.date.getTime());
          });
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'expenses',
        },
        (payload) => {
          const updated = parseExpense(payload.new as Record<string, unknown>);
          setExpenses(prev => prev.map(e => e.id === updated.id ? updated : e));
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'DELETE',
          schema: 'public',
          table: 'expenses',
        },
        (payload) => {
          const deletedId = (payload.old as { id: string }).id;
          setExpenses(prev => prev.filter(e => e.id !== deletedId));
        }
      )
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          console.log('✅ Realtime expenses subscription active');
        }
      });

    realtimeChannelRef.current = channel;

    return () => {
      supabase.removeChannel(channel);
      realtimeChannelRef.current = null;
    };
  }, [user, isLocalMode, parseExpense]);

  // Filtered view for dashboard (respects payment source access levels)
  const dashboardExpenses = useMemo(() => {
    if (isLocalMode || !user) return expenses;

    return expenses.filter(expense => {
      const cleanPs = expense.payment_source?.replace('custom:', '');
      const isOnSharedPaymentSource = cleanPs && sharedPaymentSourceIds.has(cleanPs);

      if (isOnSharedPaymentSource) {
        if (fullAccessSourceIds.has(cleanPs!)) return true;
        return expense.user_id === user.id;
      }

      if (expense.type === 'transfer' && expense.income_source_id) {
        const destId = expense.income_source_id;
        if (sharedPaymentSourceIds.has(destId)) {
          if (fullAccessSourceIds.has(destId)) return true;
          return expense.user_id === user.id;
        }
      }

      if (expense.project_id) return expense.user_id === user.id;
      if (!expense.income_source_id) return true;
      if (ownedSourceIds.has(expense.income_source_id)) return true;
      return false;
    });
  }, [expenses, ownedSourceIds, sharedPaymentSourceIds, fullAccessSourceIds, isLocalMode, user]);

  return {
    expenses,          // raw — all accessible expenses
    dashboardExpenses, // filtered — for display
    loading,
    isLocalMode,
    setExpenses,
    refetch: fetchExpenses,
  };
};
