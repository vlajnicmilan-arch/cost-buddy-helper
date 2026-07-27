/**
 * Faza C3 — period-scope override read za PDF izvještaj.
 *
 * Sve 3 override tablice (`krug_expense_split_override`, `_share`,
 * `_confirmation`) imaju SELECT RLS za punopravne članove Kruga, pa čitamo
 * direktno kroz Supabase JS klijenta — bez novog RPC-a i bez migracije.
 *
 * Uključuje sve non-pending statuse (potvrdjena, povucena, odbijena) za
 * transparentnost governancea (Milanova odluka).
 *
 * Period filter je po `expenses.date` — semantički odgovara periodu
 * izvještaja i poklapa se s onim što `krug_settlement_preview` uzima u
 * obračun.
 */
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import type { OverrideStatus, OverrideShare } from './useKrugExpenseOverride';

export interface OverrideExpenseMeta {
  id: string;
  description: string | null;
  amount: number;
  currency: string;
  date: string; // YYYY-MM-DD
}

export interface OverrideHistoryRow {
  id: string;
  expense: OverrideExpenseMeta;
  krug_id: string;
  proposed_by: string;
  status: OverrideStatus;
  activated_at: string | null;
  reject_reason: string | null;
  created_at: string;
  shares: OverrideShare[];
  confirmations: { user_id: string; confirmed_at: string }[];
}

interface Args {
  krugId: string | null | undefined;
  periodStart: string; // YYYY-MM-DD (inclusive)
  periodEnd: string;   // YYYY-MM-DD (inclusive)
  enabled?: boolean;
}

/**
 * Fetches all overrides whose underlying expense.date falls within the
 * given period. Includes non-pending statuses only.
 */
export function useKrugPeriodOverrides({ krugId, periodStart, periodEnd, enabled = true }: Args) {
  return useQuery({
    queryKey: ['krug', 'periodOverrides', krugId, periodStart, periodEnd],
    enabled: !!krugId && enabled,
    staleTime: 60 * 1000,
    queryFn: async (): Promise<OverrideHistoryRow[]> => {
      if (!krugId) return [];

      // 1) All non-pending overrides for this krug (broad filter — we refine
      //    by expense.date below).
      const { data: overrides, error } = await supabase
        .from('krug_expense_split_override' as any)
        .select('id, expense_id, krug_id, proposed_by, status, activated_at, reject_reason, created_at')
        .eq('krug_id', krugId)
        .in('status', ['potvrdjena', 'povucena', 'odbijena'])
        .order('created_at', { ascending: false })
        .limit(500);
      if (error) throw error;
      const overrideRows = (overrides ?? []) as any[];
      if (overrideRows.length === 0) return [];

      const overrideIds = overrideRows.map((r) => r.id);
      const expenseIds = Array.from(new Set(overrideRows.map((r) => r.expense_id)));

      const [sharesRes, confirmsRes, expensesRes] = await Promise.all([
        supabase.from('krug_expense_split_share' as any).select('*').in('override_id', overrideIds),
        supabase.from('krug_expense_split_confirmation' as any).select('*').in('override_id', overrideIds),
        supabase.from('expenses').select('id, description, amount, currency, date').in('id', expenseIds),
      ]);
      if (sharesRes.error) throw sharesRes.error;
      if (confirmsRes.error) throw confirmsRes.error;
      if (expensesRes.error) throw expensesRes.error;

      const shares = (sharesRes.data ?? []) as any[];
      const confirms = (confirmsRes.data ?? []) as any[];
      const expensesMap = new Map<string, OverrideExpenseMeta>(
        ((expensesRes.data ?? []) as any[]).map((e) => [
          e.id as string,
          {
            id: e.id,
            description: e.description ?? null,
            amount: Number(e.amount ?? 0),
            currency: (e.currency as string) || 'EUR',
            date: (e.date as string) || '',
          },
        ]),
      );

      const inPeriod = (d: string) => !!d && d >= periodStart && d <= periodEnd;

      const rows: OverrideHistoryRow[] = overrideRows
        .map((r) => {
          const expense = expensesMap.get(r.expense_id);
          if (!expense) return null;
          if (!inPeriod(expense.date)) return null;
          return {
            id: r.id,
            expense,
            krug_id: r.krug_id,
            proposed_by: r.proposed_by,
            status: r.status as OverrideStatus,
            activated_at: r.activated_at ?? null,
            reject_reason: r.reject_reason ?? null,
            created_at: r.created_at,
            shares: shares
              .filter((s) => s.override_id === r.id)
              .map((s) => ({ user_id: s.user_id, share_percent: Number(s.share_percent) })),
            confirmations: confirms
              .filter((c) => c.override_id === r.id)
              .map((c) => ({ user_id: c.user_id, confirmed_at: c.confirmed_at })),
          };
        })
        .filter((r): r is OverrideHistoryRow => r !== null)
        .sort((a, b) => (a.expense.date < b.expense.date ? 1 : -1));

      return rows;
    },
  });
}
