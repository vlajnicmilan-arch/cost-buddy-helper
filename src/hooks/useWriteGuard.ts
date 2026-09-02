/**
 * useWriteGuard — jedini klijentski autoritet za "smijem li pisati?".
 *
 * Free račun ima kvotu od 30 transakcija mjesečno. Modulskim značajkama
 * bez prava i dalje se upravlja kroz module entitlement gateove.
 */
import { useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { showError } from '@/hooks/useStatusFeedback';
import { useFeatureAccess, Feature, FREE_LIMITS } from '@/hooks/useFeatureAccess';
import { useFreeTierUsage } from '@/hooks/useFreeTierUsage';
import { getFreeTransactionLimitPeriod } from '@/lib/freeTransactionLimit';

export type WriteScope =
  | { kind: 'module'; feature: Feature }
  | { kind: 'freeTx' }; // 30 tx/mj limit za free


interface GuardResult {
  canWrite: boolean;
  blockReason: string | null;
  guard: <T>(action: () => T | Promise<T>) => Promise<T | undefined>;
}

export function useWriteGuard(scope: WriteScope): GuardResult {
  const { t, i18n } = useTranslation();
  const language = i18n?.language ?? 'hr';
  const navigate = useNavigate();
  const { hasAccess } = useFeatureAccess();
  const { usage } = useFreeTierUsage();

  let canWrite = true;
  let blockReason: string | null = null;
  let ctaLabel = t('access.cta', 'Aktiviraj pretplatu');

  if (scope.kind === 'module') {
    if (!hasAccess(scope.feature)) {
      canWrite = false;
      blockReason = t('access.moduleBlocked', 'Za ovu značajku potrebna je aktivna pretplata. Podatke vidiš i možeš izvesti.');
    }
  } else if (scope.kind === 'freeTx') {
    if (!hasAccess('unlimited_transactions')) {
      const used = usage?.transactions_created ?? 0;
      if (used >= FREE_LIMITS.transactions_per_month) {
        canWrite = false;
        const { month, resetDate } = getFreeTransactionLimitPeriod(language);
        blockReason = t('access.freeTxLimitReached', { month, date: resetDate });
      }
    }
  }


  const guard = useCallback(
    async <T,>(action: () => T | Promise<T>): Promise<T | undefined> => {
      if (canWrite) {
        try {
          return await action();
        } catch (err: any) {
          const msg = String(err?.message || err);
          // Server je poslao "free_limit_exceeded" — pretvori u prijateljski toast.
          if (/free_limit_exceeded/i.test(msg)) {
            if (scope.kind === 'freeTx') {
              const { month, resetDate } = getFreeTransactionLimitPeriod(language);
              showError(t('access.freeTxLimitReached', { month, date: resetDate }));
            } else {
              showError(t('access.freeLimitServer', 'Prekoračen je Free limit — potrebna je pretplata.'), {
                action: { label: ctaLabel, onClick: () => navigate('/paywall') },
              });
            }
            return undefined;
          }
          throw err;
        }
      }
      if (scope.kind === 'freeTx') {
        showError(blockReason ?? t('access.freeTxLimitReached'));
      } else {
        showError(blockReason ?? t('access.blocked', 'Akcija nije dopuštena bez pretplate.'), {
          action: { label: ctaLabel, onClick: () => navigate('/paywall') },
        });
      }
      return undefined;
    },
    [canWrite, blockReason, ctaLabel, language, navigate, scope.kind, t]
  );

  return { canWrite, blockReason, guard };
}
