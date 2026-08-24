import { useCallback, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useTranslation } from 'react-i18next';
import { showSuccess, showError } from '@/hooks/useStatusFeedback';
import { logFunnelEvent } from '@/lib/funnelTracking';
import { logDiagnostic } from '@/lib/diagnosticLogger';
import { APP_VERSION } from '@/lib/version';
import { MANUAL_MERGE_ENABLED } from '@/lib/featureFlags';
import {
  canMergeSelection,
  type MergeCandidateExpense,
  type MergeCheck,
} from '@/lib/manualBankMergePair';
import { describeMergeError, MERGE_FAILURE_I18N_KEY } from '@/lib/mergeFailureReason';

export interface MergePairOptions {
  /**
   * True when the manual/scanned row was already written to the books in this
   * same flow — the user must be told they now have two records if we fail.
   */
  rowAlreadySaved?: boolean;
  /** Where the merge was triggered from (`bulk_toolbar`, `duplicate_dialog`, …). */
  context?: string;
}

/**
 * Manual ↔ bank transaction merge (Phase 1).
 *
 * Calls the `merge_manual_with_bank` RPC, then invalidates all cached
 * expense/balance queries so the UI reflects the new state immediately.
 *
 * Every attempt leaves a diagnostic trail in `app_diagnostics_logs`
 * (`manual_bank_merge_ok` / `manual_bank_merge_failed`) so a failure can be
 * diagnosed without asking the user anything. Only ids, codes and the raw
 * database message are logged — never personal content.
 */
export function useManualBankMerge() {
  const qc = useQueryClient();
  const { t } = useTranslation();
  const [isMerging, setIsMerging] = useState(false);

  const mergePair = useCallback(
    async (
      manualId: string | null | undefined,
      bankId: string | null | undefined,
      options: MergePairOptions = {},
    ): Promise<boolean> => {
      const { rowAlreadySaved = false, context = 'unknown' } = options;

      const failureMessage = (reasonText: string) =>
        rowAlreadySaved
          ? t('transactions.merge.savedButFailed', {
              reason: reasonText,
              defaultValue: 'Trošak je spremljen, ali spajanje nije uspjelo: {{reason}}',
            })
          : reasonText;

      if (!MANUAL_MERGE_ENABLED) {
        showError(t('import.frozen'));
        return false;
      }

      // Guard 1 — the id never arrived here (save path lost it). Must be
      // distinguishable in the logs from "RPC ran and refused".
      if (!manualId || !bankId) {
        const reasonText = t('transactions.merge.errors.missingId', 'Nedostaje oznaka transakcije');
        logDiagnostic({
          event: 'manual_bank_merge_failed',
          severity: 'error',
          details: {
            rpc_called: false,
            reason: 'missing_id',
            context,
            row_already_saved: rowAlreadySaved,
            manual_id: manualId ?? null,
            bank_id: bankId ?? null,
            manual_id_missing: !manualId,
            bank_id_missing: !bankId,
            app_version: APP_VERSION ?? null,
          },
        });
        showError(failureMessage(reasonText));
        return false;
      }

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

        logDiagnostic({
          event: 'manual_bank_merge_ok',
          severity: 'info',
          details: {
            rpc_called: true,
            context,
            row_already_saved: rowAlreadySaved,
            manual_id: manualId,
            bank_id: bankId,
            app_version: APP_VERSION ?? null,
          },
        });

        showSuccess(t('transactions.merge.success', 'Spojeno'));
        return true;
      } catch (err: unknown) {
        console.error('[useManualBankMerge] failed', err);
        const described = describeMergeError(err);

        logDiagnostic({
          event: 'manual_bank_merge_failed',
          severity: 'error',
          details: {
            rpc_called: true,
            reason: described.code,
            context,
            row_already_saved: rowAlreadySaved,
            manual_id: manualId,
            bank_id: bankId,
            db_code: described.db_code,
            db_message: described.db_message,
            app_version: APP_VERSION ?? null,
          },
        });

        const key = MERGE_FAILURE_I18N_KEY[described.code];
        const reasonText =
          described.code === 'unknown'
            ? t('transactions.merge.errorGeneric', 'Spajanje nije uspjelo')
            : t(`transactions.merge.errors.${key}`);
        showError(failureMessage(reasonText));
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
