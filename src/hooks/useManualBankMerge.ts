import { useCallback, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useTranslation } from 'react-i18next';
import { showSuccess, showError } from '@/hooks/useStatusFeedback';
import { logFunnelEvent } from '@/lib/funnelTracking';
import {
  canMergeSelection,
  type MergeCandidateExpense,
  type MergeCheck,
} from '@/lib/manualBankMergePair';

/**
 * Manual ↔ bank transaction merge (Phase 1).
 *
 * Calls the `merge_manual_with_bank` RPC, then invalidates all cached
 * expense/balance queries so the UI reflects the new state immediately.
 */
export function useManualBankMerge() {
  const qc = useQueryClient();
  const { t } = useTranslation();
  const [isMerging, setIsMerging] = useState(false);

  const mergePair = useCallback(
    async (manualId: string, bankId: string): Promise<boolean> => {
      setIsMerging(true);
      try {
        const { error } = await supabase.rpc('merge_manual_with_bank' as any, {
          p_manual_id: manualId,
          p_bank_id: bankId,
        });
        if (error) throw error;

        await Promise.allSettled([
          qc.invalidateQueries({ queryKey: ['expenses'] }),
          qc.invalidateQueries({ queryKey: ['paymentSources'] }),
          qc.invalidateQueries({ queryKey: ['customPaymentSources'] }),
          qc.invalidateQueries({ queryKey: ['balances'] }),
          qc.invalidateQueries({ queryKey: ['import-batches'] }),
        ]);

        // Notify any local-state expense lists (Wallet/Home) to refresh.
        window.dispatchEvent(new CustomEvent('expenses-changed'));

        logFunnelEvent('manual_merge_used').catch(() => {});

        showSuccess(t('transactions.merge.success', 'Spojeno'));
        return true;
      } catch (err: any) {
        console.error('[useManualBankMerge] failed', err);
        const code = String(err?.message ?? '');
        const map: Record<string, string> = {
          different_type: t('transactions.merge.errors.differentType', 'Različita vrsta transakcije'),
          transfer_not_allowed: t('transactions.merge.errors.transferNature', 'Prijenosi se ne mogu spojiti'),
          correction_not_allowed: t('transactions.merge.errors.correctionNature', 'Korekcije se ne mogu spojiti'),
          different_source: t('transactions.merge.errors.differentSource', 'Različiti izvor plaćanja'),
          different_currency: t('transactions.merge.errors.differentCurrency', 'Različita valuta'),
          different_amount: t('transactions.merge.errors.differentAmount', 'Različit iznos'),
          date_too_far: t('transactions.merge.errors.dateTooFar', 'Datumi su predaleko (>3 dana)'),
          advance_protected: t('transactions.merge.errors.advanceProtected', 'Avansi se ne mogu spojiti'),
          already_confirmed: t('transactions.merge.errors.alreadyConfirmed', 'Već potvrđeno'),
          manual_is_bank: t('transactions.merge.errors.bothBank', 'Obje su iz banke'),
          bank_is_manual: t('transactions.merge.errors.bothManual', 'Obje su ručne'),
          not_authorized: t('transactions.merge.errors.notAuthorized', 'Nije dopušteno'),
        };
        const matched = Object.keys(map).find((k) => code.includes(k));
        showError(matched ? map[matched] : t('transactions.merge.errorGeneric', 'Spajanje nije uspjelo'));
        return false;
      } finally {
        setIsMerging(false);
      }
    },
    [qc, t]
  );

  const checkSelection = useCallback(
    (selected: readonly MergeCandidateExpense[]): MergeCheck => canMergeSelection(selected),
    []
  );

  return { mergePair, checkSelection, isMerging };
}
