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
import { instantCache } from '@/lib/instantCache';
import { buildExpenseScopeFilter, belongsToMyScope, type ScopeContext } from '@/lib/expenseScope';

// v2: bumped after P0 Core Financial Contamination fix — invalidates any
// cached datasets that may have leaked foreign project transactions via
// the is_project_member RLS branch.
const expensesCacheKey = (userId: string | undefined) =>
  `expenses:v2:${userId || 'anon'}`;

export const useExpenseFetch = () => {
  const { user } = useAuth();
  const { storageMode } = useStorage();
  const { businessProfileId: viewBusinessProfileId, isPersonalView, isBusinessView } = useWalletViewMode();

  const initialExpensesKey = expensesCacheKey(user?.id);
  const initialExpensesCached = user ? instantCache.read<Expense[]>(initialExpensesKey) : null;
  const initialExpenses = (initialExpensesCached || []).map(e => ({
    ...e,
    date: e.date instanceof Date ? e.date : new Date(e.date as unknown as string),
  }));
  const [expenses, setExpenses] = useState<Expense[]>(initialExpenses);
  const [ownedSourceIds, setOwnedSourceIds] = useState<Set<string>>(new Set());
  const [sharedPaymentSourceIds, setSharedPaymentSourceIds] = useState<Set<string>>(new Set());
  const [fullAccessSourceIds, setFullAccessSourceIds] = useState<Set<string>>(new Set());
  const [sourceBusinessMap, setSourceBusinessMap] = useState<Map<string, string | null>>(new Map());
  // Hidden source ids come from a shared, sessionStorage-seeded cache to avoid
  // any flicker when navigating back to the dashboard.
  const { hiddenIds: hiddenPaymentSourceIds, isHidden: isPaymentSourceHidden } = useHiddenPaymentSources();
  const [loading, setLoading] = useState(initialExpenses.length === 0);
  const realtimeChannelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
  const hydratedKeyRef = useRef<string | null>(initialExpenses.length > 0 ? initialExpensesKey : null);
  // Kept in a ref so the realtime handler always sees the current shared set
  // without re-subscribing the channel on every shared-source change.
  const sharedIdsRef = useRef<Set<string>>(new Set());

  const isLocalMode = storageMode === 'local' && !user;

  /**
   * Fetches the caller's payment-source memberships and owned income sources.
   * Returns the fresh shared set so `fetchExpenses` can apply scope filtering
   * synchronously on the first render (no race where expenses query fires
   * before shared ids are known).
   */
  const fetchOwnedSources = useCallback(async (): Promise<{
    sharedIds: Set<string>;
  }> => {
    if (isLocalMode || !user) {
      setOwnedSourceIds(new Set());
      setSharedPaymentSourceIds(new Set());
      setFullAccessSourceIds(new Set());
      sharedIdsRef.current = new Set();
      return { sharedIds: new Set() };
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
      sharedIdsRef.current = psIds;

      // Map source.id -> business_profile_id (or null when personal)
      const map = new Map<string, string | null>();
      (allPsRes.data || []).forEach((s: any) => {
        map.set(s.id, s.business_profile_id || null);
      });
      setSourceBusinessMap(map);

      return { sharedIds: psIds };
    } catch (error) {
      console.error('Error fetching owned sources:', error);
      return { sharedIds: sharedIdsRef.current };
    }
  }, [user, isLocalMode]);

  const fetchExpenses = useCallback(async (sharedIdsOverride?: Set<string>) => {
    const cacheKey = expensesCacheKey(user?.id);
    const hasHydrated = hydratedKeyRef.current === cacheKey;
    if (!hasHydrated) setLoading(true);
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

        // P0: explicit personal-scope filter. Server-side narrows to
        // "my rows OR rows on a payment source I have access to". Without
        // this the RLS is_project_member branch leaks foreign project
        // transactions into the personal dataset.
        const sharedIds = sharedIdsOverride ?? sharedIdsRef.current;
        const scopeCtx: ScopeContext = {
          userId: user.id,
          sharedPaymentSourceIds: sharedIds,
        };
        const orFilter = buildExpenseScopeFilter(scopeCtx);

        // Paginated fetch to bypass Supabase 1000-row limit
        let allData: any[] = [];
        let from = 0;
        const pageSize = 1000;

        while (true) {
          let query = supabase
            .from('expenses')
            .select('*')
            .order('date', { ascending: false })
            .range(from, from + pageSize - 1);

          if (orFilter) query = query.or(orFilter);

          const { data, error } = await query;

          if (error) throw error;
          if (!data || data.length === 0) break;
          allData = allData.concat(data);
          if (data.length < pageSize) break;
          from += pageSize;
        }

        const mapped = allData.map(e => ({
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
        }));
        setExpenses(mapped);
        instantCache.write(cacheKey, mapped);
      }
    } catch (error) {
      const errMsg = String((error as any)?.message || error);
      if (/jwt|token.*expir|unauthorized/i.test(errMsg) || (error as any)?.status === 401) {
        console.log('[Expenses] Auth error, refreshing session and retrying...');
        try {
          await supabase.auth.refreshSession();
          // Retry with pagination — SAME scope filter as primary path.
          const sharedIds = sharedIdsOverride ?? sharedIdsRef.current;
          const scopeCtx: ScopeContext = {
            userId: user!.id,
            sharedPaymentSourceIds: sharedIds,
          };
          const orFilter = buildExpenseScopeFilter(scopeCtx);

          let retryData: any[] = [];
          let retryFrom = 0;
          while (true) {
            let q = supabase
              .from('expenses')
              .select('*')
              .order('date', { ascending: false })
              .range(retryFrom, retryFrom + 999);
            if (orFilter) q = q.or(orFilter);
            const { data, error: retryError } = await q;
            if (retryError || !data || data.length === 0) break;
            retryData = retryData.concat(data);
            if (data.length < 1000) break;
            retryFrom += 1000;
          }
          if (retryData.length > 0) {
            const mappedRetry = retryData.map(e => ({
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
            }));
            setExpenses(mappedRetry);
            instantCache.write(cacheKey, mappedRetry);
            hydratedKeyRef.current = cacheKey;
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
      hydratedKeyRef.current = cacheKey;
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

  // Hydrate from cache instantly on user change
  useEffect(() => {
    if (isLocalMode || !user) return;
    const key = expensesCacheKey(user.id);
    const cached = instantCache.read<Expense[]>(key);
    if (cached && cached.length > 0) {
      // Defensive: ensure dates are Date objects (reviver should already do this)
      setExpenses(cached.map(e => ({
        ...e,
        date: e.date instanceof Date ? e.date : new Date(e.date as unknown as string),
      })));
      setLoading(false);
      hydratedKeyRef.current = key;
    } else {
      hydratedKeyRef.current = null;
    }
  }, [user?.id, isLocalMode, user]);

  // Initial data load (hiddenIds handled by useHiddenPaymentSources hook).
  // P0: fetchOwnedSources MUST complete before fetchExpenses, otherwise the
  // first SELECT runs with an empty shared set and legitimately-shared
  // payment-source transactions disappear on first render.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { sharedIds } = await fetchOwnedSources();
      if (cancelled) return;
      await fetchExpenses(sharedIds);
    })();
    return () => {
      cancelled = true;
    };
  }, [fetchOwnedSources, fetchExpenses]);

  // Realtime subscription for cloud mode
  useEffect(() => {
    if (isLocalMode || !user) return;

    // Clean up existing channel
    if (realtimeChannelRef.current) {
      supabase.removeChannel(realtimeChannelRef.current);
    }

    // P0: realtime events bypass the SELECT filter, so we must re-check
    // scope client-side. Without this, foreign project transactions still
    // stream in via postgres_changes on the is_project_member RLS branch.
    const inScope = (row: Record<string, unknown>): boolean =>
      belongsToMyScope(row as any, {
        userId: user.id,
        sharedPaymentSourceIds: sharedIdsRef.current,
      });

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
          if (!inScope(payload.new as Record<string, unknown>)) return;
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
          if (!inScope(payload.new as Record<string, unknown>)) {
            // Row may have moved out of scope — drop it from local state.
            const id = (payload.new as { id?: string })?.id;
            if (id) setExpenses(prev => prev.filter(e => e.id !== id));
            return;
          }
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

  // Helper: business_profile_id of the source attached to an expense (null if personal)
  const expenseSourceBusinessProfileId = useCallback((e: Expense): string | null => {
    const ps = e.payment_source?.replace('custom:', '');
    if (ps && sourceBusinessMap.has(ps)) return sourceBusinessMap.get(ps) || null;
    if (e.type === 'transfer' && e.income_source_id && sourceBusinessMap.has(e.income_source_id)) {
      return sourceBusinessMap.get(e.income_source_id) || null;
    }
    return null;
  }, [sourceBusinessMap]);

  // A "cross-mode" expense = company-tagged transaction paid from a personal source
  // (i.e. owner loan to company). Visible in BOTH personal and business views.
  const isCrossModeExpense = useCallback((e: Expense): boolean => {
    const sourceBp = expenseSourceBusinessProfileId(e);
    const expenseBp = (e as any).business_profile_id || null;
    return sourceBp === null && !!expenseBp;
  }, [expenseSourceBusinessProfileId]);

  // Apply view-mode filter (Osobno / per-company)
  // Personal view = source is personal (drains personal balance — includes cross-mode)
  // Business view = expense.business_profile_id matches (booked to company — includes cross-mode)
  const applyViewMode = useCallback((list: Expense[]) => {
    if (isPersonalView) return list.filter(e => expenseSourceBusinessProfileId(e) === null);
    if (isBusinessView && viewBusinessProfileId) {
      return list.filter(e => {
        const sourceBp = expenseSourceBusinessProfileId(e);
        const expenseBp = (e as any).business_profile_id || null;
        // Same-company source OR cross-mode expense booked to this company
        return sourceBp === viewBusinessProfileId || (sourceBp === null && expenseBp === viewBusinessProfileId);
      });
    }
    return list;
  }, [isPersonalView, isBusinessView, viewBusinessProfileId, expenseSourceBusinessProfileId]);

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
    rawExpenses: expenses,             // unfiltered: use for per-source views (source defines context)
    dashboardExpenses,                 // further filtered for display
    hiddenPaymentSourceIds,            // for UI badges & dashboard balance aggregation
    isCrossModeExpense,                // helper for cross-mode badges
    loading,
    isLocalMode,
    setExpenses,
    refetch: fetchExpenses,
  };
};
