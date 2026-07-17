/**
 * useWriteGuard — jedini klijentski autoritet za "smijem li pisati?".
 *
 * Pravilo (Milanova politika):
 *   - Free razina: dozvoljeno stvaranje unutar limita (30 tx / 1 wallet / 1 budget).
 *   - Iznad limita i za sve module bez entitlementa: ČITANJE I IZVOZ,
 *     ali sve CUD operacije su blokirane s jasnom porukom + CTA na paywall.
 *   - Brisanje je dopušteno, ali NE oslobađa mjesečni limit (server trigger je increment-only).
 *
 * Vraća `guard(action)` koji:
 *   - ako je pisanje dopušteno → izvršava `action()` i vraća njen rezultat,
 *   - ako nije → prikazuje toast s razlogom + CTA "Aktiviraj", vraća `undefined`.
 */
import { useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { useFeatureAccess, Feature, FREE_LIMITS } from '@/hooks/useFeatureAccess';
import { useFreeTierUsage } from '@/hooks/useFreeTierUsage';

export type WriteScope =
  | { kind: 'module'; feature: Feature }
  | { kind: 'freeTx' }                    // 30 tx/mj limit za free
  | { kind: 'freePaymentSource'; currentCount: number }
  | { kind: 'freeBudget'; currentCount: number };

interface GuardResult {
  canWrite: boolean;
  blockReason: string | null;
  guard: <T>(action: () => T | Promise<T>) => Promise<T | undefined>;
}

export function useWriteGuard(scope: WriteScope): GuardResult {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { hasAccess, isFreeTier } = useFeatureAccess();
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
        blockReason = t(
          'access.freeTxLimitReached',
          'Iskoristio si {{used}}/{{limit}} besplatnih transakcija ovaj mjesec. Brisanje ne oslobađa limit.',
          { used, limit: FREE_LIMITS.transactions_per_month }
        );
      }
    }
  } else if (scope.kind === 'freePaymentSource') {
    if (!hasAccess('unlimited_payment_sources') && scope.currentCount >= FREE_LIMITS.payment_sources) {
      canWrite = false;
      blockReason = t(
        'access.freePaymentSourceLimit',
        'Free plan dopušta {{limit}} novčanik. Aktiviraj Smjer za više.',
        { limit: FREE_LIMITS.payment_sources }
      );
    }
  } else if (scope.kind === 'freeBudget') {
    if (!hasAccess('unlimited_budgets') && scope.currentCount >= FREE_LIMITS.budgets) {
      canWrite = false;
      blockReason = t(
        'access.freeBudgetLimit',
        'Free plan dopušta {{limit}} budžet. Aktiviraj Smjer za više.',
        { limit: FREE_LIMITS.budgets }
      );
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
            toast.error(t('access.freeLimitServer', 'Prekoračen je Free limit — potrebna je pretplata.'), {
              action: { label: ctaLabel, onClick: () => navigate('/paywall') },
            });
            return undefined;
          }
          throw err;
        }
      }
      toast.error(blockReason ?? t('access.blocked', 'Akcija nije dopuštena bez pretplate.'), {
        action: { label: ctaLabel, onClick: () => navigate('/paywall') },
      });
      return undefined;
    },
    [canWrite, blockReason, ctaLabel, navigate, t]
  );

  return { canWrite, blockReason, guard };
}
