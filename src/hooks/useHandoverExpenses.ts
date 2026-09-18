/**
 * Predaja knjigovođi — dohvat troškova kandidata za paket.
 *
 * Samo čitanje (SELECT) pod postojećim RLS-om: rashodi sa slikom, bez
 * obrisanih i bez vezanih na eRačun. Poslovnost i razdoblje određuje čisti
 * `selectHandoverExpenses` — hook je samo dohvat.
 */
import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { isCountedExpenseRow } from '@/lib/countedExpense';
import { useAuth } from '@/hooks/useAuth';
import { logDiagnostic } from '@/lib/diagnosticLogger';
import { describeDbError } from '@/lib/eracun/dbError';
import { getBuildStamp } from '@/lib/buildStamp';
import type { HandoverExpenseLike } from '@/lib/accounting/handoverPackage';

const SELECT_COLUMNS = [
  'id', 'type', 'merchant_name', 'description', 'date', 'amount', 'currency',
  'vat_amount', 'vat_rate', 'payment_source', 'category', 'receipt_url',
  'deleted_at', 'invoice_id', 'business_profile_id', 'project_id',
  'owner_funding_choice', 'accounting_category',
].join(', ');

export interface SetExpenseAccountingCategoryInput {
  expenseId: string;
  category: 'tool' | 'fixed_asset' | null;
}

export const useHandoverExpenses = (businessProfileId: string | null) => {
  const { user, authReady } = useAuth();
  const [expenses, setExpenses] = useState<HandoverExpenseLike[]>([]);
  const [loading, setLoading] = useState(false);

  const fetchExpenses = useCallback(async (): Promise<void> => {
    if (!user || !businessProfileId) {
      setExpenses([]);
      return;
    }
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('expenses')
        .select(SELECT_COLUMNS)
        .eq('user_id', user.id)
        .eq('type', 'expense')
        .is('deleted_at', null)
        .is('invoice_id', null)
        .not('receipt_url', 'is', null)
        .order('date', { ascending: false });
      if (error) throw error;
      setExpenses((data ?? []) as unknown as HandoverExpenseLike[]);
    } catch (err) {
      logDiagnostic({
        event: 'accounting_handover_expenses_fetch_failed',
        severity: 'error',
        details: {
          action: 'expenses.selectHandoverCandidates',
          business_profile_id: businessProfileId,
          code: (err as { code?: string })?.code ?? null,
          message: err instanceof Error ? err.message : String(err),
          build: getBuildStamp(),
        },
      });
      throw err;
    } finally {
      setLoading(false);
    }
  }, [user, businessProfileId]);

  useEffect(() => {
    if (!authReady) return;
    void fetchExpenses().catch(() => { /* poruku prikazuje pozivatelj */ });
  }, [authReady, fetchExpenses]);

  /**
   * Spremanje ručno odabrane kategorije („alat" / „osnovna sredstva", ili
   * poništenje). Pad upisa → dijagnostika + greška pozivatelju; kad upis
   * prođe a osvježenje padne, baca `refresh_failed` da poruka kaže oboje.
   */
  const setExpenseAccountingCategory = useCallback(async (
    input: SetExpenseAccountingCategoryInput,
  ): Promise<void> => {
    if (!user) throw new Error('not_authenticated');
    const { error } = await supabase
      .from('expenses')
      .update({ accounting_category: input.category })
      .eq('id', input.expenseId);

    if (error) {
      logDiagnostic({
        event: 'accounting_handover_category_failed',
        severity: 'error',
        details: {
          action: 'expenses.setAccountingCategory',
          expense_id: input.expenseId,
          code: error.code ?? null,
          message: error.message ?? null,
          details: error.details ?? null,
          hint: error.hint ?? null,
          build: getBuildStamp(),
        },
      });
      throw error;
    }

    try {
      await fetchExpenses();
    } catch {
      throw new Error('refresh_failed');
    }
  }, [user, fetchExpenses]);

  return { expenses, loading, setExpenseAccountingCategory, refetch: fetchExpenses };
};

/** Čitljiv opis greške baze za poruke u traci predaje. */
export { describeDbError };
