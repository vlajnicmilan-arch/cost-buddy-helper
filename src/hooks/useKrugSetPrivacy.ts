/**
 * T7 frontend — wrapper za `krug_set_privacy` RPC.
 *
 * Hook ne donosi nikakvu odluku o dopuštenoj tranziciji — sve drži RPC + RLS.
 * Klijent samo prevodi outcome u StatusFeedback i invalidira keševe transakcija.
 *
 * Defaulti privatnosti na create-u NE žive ovdje (Implementation Sprint v1.1 T7):
 * preset resolver na UI sloju mora odrediti `krug_privacy` i proslijediti ga
 * write putu. Ovaj hook se bavi isključivo post-create tranzicijama.
 */
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import type { Database } from '@/integrations/supabase/types';
import { showError, showSuccess } from '@/hooks/useStatusFeedback';
import { friendlyError, tr } from '@/lib/errorMessages';

export type KrugPrivacy = Database['public']['Enums']['krug_privacy'];

export interface KrugSetPrivacyOutcome {
  outcome: string;
  expense_id?: string;
  krug_id?: string;
  previous_privacy?: KrugPrivacy | null;
  new_privacy?: KrugPrivacy | null;
  previous_status?: string | null;
  new_status?: string | null;
}

const OK_OUTCOMES = new Set([
  'ok_set_personal',
  'ok_set_private',
  'ok_proposed_shared',
  'noop_already_in_target_state',
]);

export function useKrugSetPrivacy() {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async (vars: { expenseId: string; newPrivacy: KrugPrivacy }) => {
      const { data, error } = await supabase.rpc('krug_set_privacy', {
        p_expense_id: vars.expenseId,
        p_new_privacy: vars.newPrivacy,
      });
      if (error) throw error;
      return (data ?? { outcome: 'unknown' }) as unknown as KrugSetPrivacyOutcome;
    },
    onSuccess: (res) => {
      if (OK_OUTCOMES.has(res.outcome)) {
        showSuccess();
        qc.invalidateQueries({ queryKey: ['expenses'] });
      } else {
        // Business odbijenice (not_author / not_full_member / wrong_state / ...)
        showError(tr(`krug.act.error.${res.outcome}`, 'Akcija nije dopuštena.'));
      }
    },
    onError: (err: any) => {
      showError(friendlyError(err, 'krug.act.error.network', 'Akcija trenutno nije moguća. Pokušaj ponovno.'));
    },
  });
}
