import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { showError, showSuccess } from '@/hooks/useStatusFeedback';
import { useTranslation } from 'react-i18next';

export interface FamilySettlementRow {
  id: string;
  group_id: string;
  period_start: string;
  period_end: string;
  debtor_user_id: string;
  creditor_user_id: string;
  amount: number;
  currency: string;
  status: 'pending' | 'paid' | 'cancelled';
  paid_at: string | null;
  payment_expense_id: string | null;
  note: string | null;
  created_at: string;
}

function defaultPeriod(): { start: string; end: string } {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), 1);
  const end = new Date(now.getFullYear(), now.getMonth() + 1, 0);
  const fmt = (d: Date) => d.toISOString().slice(0, 10);
  return { start: fmt(start), end: fmt(end) };
}

/**
 * Settlements ("who owes whom") for a family group + period.
 * `recompute()` refreshes the snapshot then runs compute_family_settlements.
 */
export function useFamilySettlements(groupId: string | null) {
  const { t } = useTranslation();
  const initial = defaultPeriod();
  const [periodStart, setPeriodStart] = useState<string>(initial.start);
  const [periodEnd, setPeriodEnd] = useState<string>(initial.end);
  const [rows, setRows] = useState<FamilySettlementRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [computing, setComputing] = useState(false);

  const load = useCallback(async () => {
    if (!groupId) return;
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('family_settlements')
        .select('*')
        .eq('group_id', groupId)
        .eq('period_start', periodStart)
        .eq('period_end', periodEnd)
        .order('amount', { ascending: false });
      if (error) throw error;
      setRows((data || []) as FamilySettlementRow[]);
    } catch (e) {
      console.error('[useFamilySettlements] load failed', e);
    } finally {
      setLoading(false);
    }
  }, [groupId, periodStart, periodEnd]);

  useEffect(() => {
    load();
  }, [load]);

  const recompute = useCallback(async () => {
    if (!groupId) return;
    setComputing(true);
    try {
      const { error: snapErr } = await supabase.rpc('refresh_family_split_snapshot', {
        p_group_id: groupId,
        p_period_start: periodStart,
        p_period_end: periodEnd,
      });
      if (snapErr) throw snapErr;
      const { error: settErr } = await supabase.rpc('compute_family_settlements', {
        p_group_id: groupId,
        p_period_start: periodStart,
        p_period_end: periodEnd,
      });
      if (settErr) throw settErr;
      showSuccess(t('family.split.settlements.computed', 'Izračunato'));
      await load();
    } catch (e: any) {
      console.error('[useFamilySettlements] recompute failed', e);
      showError(t('family.split.settlements.computeError', 'Greška pri izračunu'));
    } finally {
      setComputing(false);
    }
  }, [groupId, periodStart, periodEnd, t, load]);

  const markPaid = useCallback(
    async (id: string, note?: string) => {
      try {
        const { error } = await supabase.rpc('record_settlement', {
          p_settlement_id: id,
          p_payment_expense_id: null,
          p_note: note ?? null,
        });
        if (error) throw error;
        showSuccess(t('family.split.settlements.marked', 'Označeno kao plaćeno'));
        await load();
      } catch (e: any) {
        console.error('[useFamilySettlements] markPaid failed', e);
        showError(t('family.split.settlements.markError', 'Greška'));
      }
    },
    [t, load]
  );

  return {
    rows,
    loading,
    computing,
    periodStart,
    periodEnd,
    setPeriodStart,
    setPeriodEnd,
    recompute,
    markPaid,
    reload: load,
  };
}
