/**
 * Faza B — per-expense split override.
 * Multi-signature governance: predlagatelj + potvrde SVIH ostalih punopravnih.
 * Solo krug (1 punopravni) → auto-active.
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import i18n from '@/i18n';
import { showError, showSuccess } from '@/hooks/useStatusFeedback';

export type OverrideStatus = 'pending' | 'potvrdjena' | 'povucena' | 'odbijena';

export interface OverrideShare { user_id: string; share_percent: number }
export interface OverrideRow {
  id: string;
  expense_id: string;
  krug_id: string;
  proposed_by: string;
  status: OverrideStatus;
  activated_at: string | null;
  reject_reason: string | null;
  created_at: string;
  shares: OverrideShare[];
  confirmations: { user_id: string; confirmed_at: string }[];
}

function reportError(err: any) {
  const msg = err?.message || '';
  const map: Record<string, string> = {
    unauthenticated: i18n.t('krug.override.error.unauthenticated', 'Prijava je istekla.'),
    expense_not_eligible: i18n.t('krug.override.error.expense_not_eligible', 'Trošak nije u zajedničkom toku.'),
    not_full_member: i18n.t('krug.override.error.not_full_member', 'Nemaš pravo predložiti podjelu.'),
    shares_invalid: i18n.t('krug.override.error.shares_invalid', 'Neispravan format podjele.'),
    shares_must_cover_all_full_members: i18n.t('krug.override.error.shares_all_members', 'Podjela mora obuhvatiti sve punopravne članove.'),
    shares_users_mismatch: i18n.t('krug.override.error.shares_users_mismatch', 'Skup članova u podjeli ne odgovara članovima Kruga.'),
    shares_sum_not_100: i18n.t('krug.override.error.shares_sum', 'Zbroj postotaka mora biti 100%.'),
    not_pending: i18n.t('krug.override.error.not_pending', 'Prijedlog više nije aktivan za odlučivanje.'),
    proposer_cannot_reject: i18n.t('krug.override.error.proposer_cannot_reject', 'Predlagatelj ne može odbiti vlastiti prijedlog. Umjesto toga možeš ga povući.'),
    only_proposer_can_withdraw: i18n.t('krug.override.error.only_proposer_withdraw', 'Samo predlagatelj može povući prijedlog.'),
    not_found: i18n.t('krug.override.error.not_found', 'Prijedlog ne postoji.'),
  };
  for (const k of Object.keys(map)) {
    if (msg.includes(k)) { showError(map[k]); return; }
  }
  // eslint-disable-next-line no-console
  console.error('[krug override]', err);
  showError(i18n.t('krug.override.error.generic', 'Greška pri obradi prijedloga.'));
}

export function useKrugExpenseOverride(expenseId: string | null, enabled = true) {
  return useQuery({
    queryKey: ['krug', 'override', expenseId],
    enabled: !!expenseId && enabled,
    staleTime: 15 * 1000,
    queryFn: async (): Promise<{ active: OverrideRow | null; pending: OverrideRow | null }> => {
      const { data: overrides, error } = await supabase
        .from('krug_expense_split_override' as any)
        .select('*')
        .eq('expense_id', expenseId!)
        .in('status', ['pending', 'potvrdjena'])
        .order('created_at', { ascending: false });
      if (error) throw error;
      const rows = (overrides ?? []) as any[];
      const ids = rows.map((r) => r.id);

      let shares: any[] = [];
      let confirms: any[] = [];
      if (ids.length > 0) {
        const [sh, cf] = await Promise.all([
          supabase.from('krug_expense_split_share' as any).select('*').in('override_id', ids),
          supabase.from('krug_expense_split_confirmation' as any).select('*').in('override_id', ids),
        ]);
        shares = (sh.data ?? []) as any[];
        confirms = (cf.data ?? []) as any[];
      }

      const build = (r: any): OverrideRow => ({
        ...r,
        shares: shares.filter((s) => s.override_id === r.id)
          .map((s) => ({ user_id: s.user_id, share_percent: Number(s.share_percent) })),
        confirmations: confirms.filter((c) => c.override_id === r.id)
          .map((c) => ({ user_id: c.user_id, confirmed_at: c.confirmed_at })),
      });

      return {
        active: rows.find((r) => r.status === 'potvrdjena') ? build(rows.find((r) => r.status === 'potvrdjena')) : null,
        pending: rows.find((r) => r.status === 'pending') ? build(rows.find((r) => r.status === 'pending')) : null,
      };
    },
  });
}

export function useKrugProposeOverride() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (vars: { expenseId: string; shares: OverrideShare[] }) => {
      const { data, error } = await (supabase as any).rpc('krug_override_propose', {
        p_expense_id: vars.expenseId,
        p_shares: vars.shares,
      });
      if (error) throw error;
      return data;
    },
    onSuccess: (data, vars) => {
      const activated = (data as any)?.auto_activated;
      showSuccess(activated
        ? i18n.t('krug.override.success.activated', 'Ručna podjela aktivirana.')
        : i18n.t('krug.override.success.proposed', 'Prijedlog poslan na potvrdu.'));
      qc.invalidateQueries({ queryKey: ['krug', 'override', vars.expenseId] });
      qc.invalidateQueries({ queryKey: ['krug', 'settlement'] });
    },
    onError: reportError,
  });
}

export function useKrugConfirmOverride() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (vars: { overrideId: string; expenseId: string }) => {
      const { data, error } = await (supabase as any).rpc('krug_override_confirm', {
        p_override_id: vars.overrideId,
      });
      if (error) throw error;
      return data;
    },
    onSuccess: (data, vars) => {
      const activated = (data as any)?.activated;
      showSuccess(activated
        ? i18n.t('krug.override.success.activated', 'Ručna podjela aktivirana.')
        : i18n.t('krug.override.success.confirmed', 'Potvrda zabilježena.'));
      qc.invalidateQueries({ queryKey: ['krug', 'override', vars.expenseId] });
      qc.invalidateQueries({ queryKey: ['krug', 'settlement'] });
    },
    onError: reportError,
  });
}

export function useKrugRejectOverride() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (vars: { overrideId: string; expenseId: string; reason?: string }) => {
      const { data, error } = await (supabase as any).rpc('krug_override_reject', {
        p_override_id: vars.overrideId,
        p_reason: vars.reason ?? null,
      });
      if (error) throw error;
      return data;
    },
    onSuccess: (_d, vars) => {
      showSuccess(i18n.t('krug.override.success.rejected', 'Prijedlog odbijen.'));
      qc.invalidateQueries({ queryKey: ['krug', 'override', vars.expenseId] });
    },
    onError: reportError,
  });
}

export function useKrugWithdrawOverride() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (vars: { overrideId: string; expenseId: string }) => {
      const { data, error } = await (supabase as any).rpc('krug_override_withdraw', {
        p_override_id: vars.overrideId,
      });
      if (error) throw error;
      return data;
    },
    onSuccess: (_d, vars) => {
      showSuccess(i18n.t('krug.override.success.withdrawn', 'Prijedlog povučen.'));
      qc.invalidateQueries({ queryKey: ['krug', 'override', vars.expenseId] });
    },
    onError: reportError,
  });
}

/**
 * Validator (client-side gate) prije slanja proposea. Server je autoritativan.
 */
export function validateOverrideShares(
  shares: OverrideShare[],
  fullMemberIds: string[],
): { ok: true } | { ok: false; error: 'missing_members' | 'extra_members' | 'sum_not_100' | 'negative' } {
  const provided = new Set(shares.map((s) => s.user_id));
  const expected = new Set(fullMemberIds);
  for (const id of expected) if (!provided.has(id)) return { ok: false, error: 'missing_members' };
  for (const id of provided) if (!expected.has(id)) return { ok: false, error: 'extra_members' };
  for (const s of shares) if (s.share_percent < 0) return { ok: false, error: 'negative' };
  const sum = shares.reduce((a, s) => a + s.share_percent, 0);
  if (Math.abs(sum - 100) > 0.01) return { ok: false, error: 'sum_not_100' };
  return { ok: true };
}
