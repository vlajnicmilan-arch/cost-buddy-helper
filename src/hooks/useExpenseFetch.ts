import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Expense, Category, PaymentSource, TransactionType } from '@/types/expense';
import { useAuth } from './useAuth';
import { useStorage } from '@/contexts/StorageContext';

import { showError } from '@/hooks/useStatusFeedback';
import { tr } from '@/lib/errorMessages';
import { getLocalExpenses, initLocalDB } from '@/lib/storage/indexedDB';
import { withAuthRetry } from '@/lib/supabaseRetry';
import { useHiddenPaymentSources } from './useHiddenPaymentSources';
import { useWalletViewMode } from '@/contexts/WalletViewModeContext';

export const useExpenseFetch = () => {
  const { user } = useAuth();
  const { storageMode } = useStorage();
  const { mode: viewMode } = useWalletViewMode();

  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [ownedSourceIds, setOwnedSourceIds] = useState<Set<string>>(new Set());
  const [sharedPaymentSourceIds, setSharedPaymentSourceIds] = useState<Set<string>>(new Set());
  const [fullAccessSourceIds, setFullAccessSourceIds] = useState<Set<string>>(new Set());
  const [businessSourceIds, setBusinessSourceIds] = useState<Set<string>>(new Set());
  // Hidden source ids come from a shared, sessionStorage-seeded cache to avoid
  // any flicker when navigating back to the dashboard.
  const { hiddenIds: hiddenPaymentSourceIds } = useHiddenPaymentSources();
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
      const [incomeRes, memberRes, ownedPsRes, allPsRes] = await Promise.all([
        supabase.from('income_sources').select('id').eq('user_id', user.id),
        supabase.from('payment_source_members').select('payment_source_id, role').eq('user_id', user.id),
        supabase.from('custom_payment_sources').select('id').eq('user_id', user.id),
        supabase.from('custom_payment_sources').select('id, business_profile_id'),
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

      // Map source.id -> business_profile_id (or null when personal)
      const map = new Map<string, string | null>();
      (allPsRes.data || []).forEach((s: any) => {
        map.set(s.id, s.business_profile_id || null);
      });
      setSourceBusinessMap(map);
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

        // Paginated fetch to bypass Supabase 1000-row limit
        let allData: any[] = [];
        let from = 0;
        const pageSize = 1000;

        while (true) {
          const { data, error } = await supabase
            .from('expenses')
            .select('*')
            .order('date', { ascending: false })
            .range(from, from + pageSize - 1);

          if (error) throw error;
          if (!data || data.length === 0) break;
          allData = allData.concat(data);
          if (data.length < pageSize) break;
          from += pageSize;
        }

        setExpenses(allData.map(e => ({
          ...e,
          date: new Date(e.date),
          category: e.category as Category,
          type: e.type as TransactionType,
          payment_source: (e.payment_source || 'cash') as PaymentSource,
          income_source_id: e.income_source_id,
          payment_source_card_id: e.payment_source_card_id,
          expense_nature: (e.expense_nature as 'regular' | 'extraordinary') || undefined,
          business_profile_id: (e as any).business_profile_id || null,
          currency: (e as any).currency || null,
        })));
      }
    } catch (error) {
      const errMsg = String((error as any)?.message || error);
      if (/jwt|token.*expir|unauthorized/i.test(errMsg) || (error as any)?.status === 401) {
        console.log('[Expenses] Auth error, refreshing session and retrying...');
        try {
          await supabase.auth.refreshSession();
          // Retry with pagination
          let retryData: any[] = [];
          let retryFrom = 0;
          while (true) {
            const { data, error: retryError } = await supabase
              .from('expenses')
              .select('*')
              .order('date', { ascending: false })
              .range(retryFrom, retryFrom + 999);
            if (retryError || !data || data.length === 0) break;
            retryData = retryData.concat(data);
            if (data.length < 1000) break;
            retryFrom += 1000;
          }
          if (retryData.length > 0) {
            setExpenses(retryData.map(e => ({
              ...e,
              date: new Date(e.date),
              category: e.category as Category,
              type: e.type as TransactionType,
              payment_source: (e.payment_source || 'cash') as PaymentSource,
              income_source_id: e.income_source_id,
              payment_source_card_id: e.payment_source_card_id,
              expense_nature: (e.expense_nature as 'regular' | 'extraordinary') || undefined,
              business_profile_id: (e as any).business_profile_id || null,
              currency: (e as any).currency || null,
            })));
            setLoading(false);
            return;
          }
        } catch (retryErr) {
          console.error('Retry also failed:', retryErr);
        }
      }
      console.error('Error fetching expenses:', error);
      showError(tr('errors.fetch.expenses', 'Greška pri učitavanju troškova'));
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
    business_profile_id: (raw as any).business_profile_id || null,
    currency: (raw as any).currency || null,
  }), []);

  // Initial data load (hiddenIds handled by useHiddenPaymentSources hook)
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

  // Helper: determine if an expense belongs to a business source
  const isBusinessExpense = useCallback((e: Expense) => {
    const ps = e.payment_source?.replace('custom:', '');
    if (ps && businessSourceIds.has(ps)) return true;
    if (e.type === 'transfer' && e.income_source_id && businessSourceIds.has(e.income_source_id)) return true;
    return false;
  }, [businessSourceIds]);

  // Apply view-mode filter (Sve / Osobno / Poslovno)
  const applyViewMode = useCallback((list: Expense[]) => {
    if (viewMode === 'all') return list;
    if (viewMode === 'business') return list.filter(isBusinessExpense);
    return list.filter(e => !isBusinessExpense(e));
  }, [viewMode, isBusinessExpense]);

  // Filtered view for dashboard (respects payment source access levels + hidden toggle)
  const dashboardExpenses = useMemo(() => {
    let filtered = applyViewMode(expenses);

    // Exclude transactions whose payment source is hidden from dashboard
    if (hiddenPaymentSourceIds.size > 0) {
      filtered = filtered.filter(e => {
        const cleanPs = e.payment_source?.replace('custom:', '');
        if (cleanPs && hiddenPaymentSourceIds.has(cleanPs)) return false;
        // For transfers, also exclude if destination source is hidden
        if (e.type === 'transfer' && e.income_source_id && hiddenPaymentSourceIds.has(e.income_source_id)) {
          return false;
        }
        return true;
      });
    }

    if (isLocalMode || !user) return filtered;

    return filtered.filter(expense => {
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
  }, [expenses, ownedSourceIds, sharedPaymentSourceIds, fullAccessSourceIds, hiddenPaymentSourceIds, isLocalMode, user, applyViewMode]);

  // View-mode filtered expenses (no payment source access filtering)
  const contextFilteredExpenses = useMemo(() => applyViewMode(expenses), [expenses, applyViewMode]);

  return {
    expenses: contextFilteredExpenses, // isolated by business/personal context
    dashboardExpenses,                 // further filtered for display
    hiddenPaymentSourceIds,            // for UI badges & dashboard balance aggregation
    loading,
    isLocalMode,
    setExpenses,
    refetch: fetchExpenses,
  };
};
