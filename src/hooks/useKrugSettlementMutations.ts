/**
 * Faza B — settle ledger + void mutations.
 * RPC-only writes. Invalidira settlement, ledger i history query keys.
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import i18n from '@/i18n';
import { showError, showSuccess } from '@/hooks/useStatusFeedback';

export interface KrugSettlementLedgerRow {
  id: string;
  krug_id: string;
  from_user: string;
  to_user: string;
  amount: number;
  currency: string;
  note: string | null;
  marked_by: string;
  marked_at: string;
  voided_at: string | null;
  voided_by: string | null;
  void_reason: string | null;
}

function reportError(err: any, fallbackKey: string, fallback: string) {
  const msg = err?.message || '';
  const map: Record<string, string> = {
    not_full_member: i18n.t('krug.settle.error.not_full_member', 'Nemaš pravo označiti podmirenje u ovom Krugu.'),
    from_equals_to: i18n.t('krug.settle.error.from_equals_to', 'Isti član ne može biti pošiljatelj i primatelj.'),
    party_not_full_member: i18n.t('krug.settle.error.party_not_full_member', 'Odabrani član nije punopravni.'),
    invalid_amount: i18n.t('krug.settle.error.invalid_amount', 'Neispravan iznos.'),
    invalid_currency: i18n.t('krug.settle.error.invalid_currency', 'Neispravna valuta.'),
    already_voided: i18n.t('krug.settle.error.already_voided', 'Podmirenje je već poništeno.'),
    reason_required: i18n.t('krug.settle.error.reason_required', 'Razlog je obavezan.'),
    not_found: i18n.t('krug.settle.error.not_found', 'Zapis ne postoji.'),
  };
  for (const k of Object.keys(map)) {
    if (msg.includes(k)) { showError(map[k]); return; }
  }
  // eslint-disable-next-line no-console
  console.error('[krug settle]', err);
  showError(i18n.t(fallbackKey, fallback));
}

export function useKrugMarkSettled(krugId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (vars: {
      fromUser: string; toUser: string; amount: number; currency: string; note?: string;
    }) => {
      const { data, error } = await (supabase as any).rpc('krug_mark_settled', {
        p_krug_id: krugId,
        p_from_user: vars.fromUser,
        p_to_user: vars.toUser,
        p_amount: vars.amount,
        p_currency: vars.currency,
        p_note: vars.note ?? null,
      });
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      showSuccess(i18n.t('krug.settle.success.marked', 'Podmirenje zabilježeno.'));
      qc.invalidateQueries({ queryKey: ['krug', 'settlement', krugId] });
      qc.invalidateQueries({ queryKey: ['krug', 'ledger', krugId] });
    },
    onError: (err) => reportError(err, 'krug.settle.error.generic', 'Nije moguće spremiti podmirenje.'),
  });
}

export function useKrugVoidSettlement(krugId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (vars: { ledgerId: string; reason: string }) => {
      const { data, error } = await (supabase as any).rpc('krug_void_settlement', {
        p_ledger_id: vars.ledgerId,
        p_reason: vars.reason,
      });
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      showSuccess(i18n.t('krug.settle.success.voided', 'Podmirenje poništeno.'));
      qc.invalidateQueries({ queryKey: ['krug', 'settlement', krugId] });
      qc.invalidateQueries({ queryKey: ['krug', 'ledger', krugId] });
    },
    onError: (err) => reportError(err, 'krug.settle.error.generic', 'Nije moguće poništiti.'),
  });
}

export function useKrugSettlementLedger(krugId: string | null, enabled = true) {
  return useQuery({
    queryKey: ['krug', 'ledger', krugId],
    enabled: !!krugId && enabled,
    staleTime: 30 * 1000,
    queryFn: async (): Promise<KrugSettlementLedgerRow[]> => {
      const { data, error } = await supabase
        .from('krug_settlement_ledger' as any)
        .select('*')
        .eq('krug_id', krugId!)
        .order('marked_at', { ascending: false })
        .limit(200);
      if (error) throw error;
      return (data ?? []) as any;
    },
  });
}
