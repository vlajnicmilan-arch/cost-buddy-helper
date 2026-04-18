import { useEffect, useRef } from 'react';
import { useAppState } from '@/contexts/AppStateContext';
import { useSubscription } from '@/contexts/SubscriptionContext';
import { useAuth } from '@/hooks/useAuth';

/**
 * Auto-disables business mode for users who lost (or never had) Business access.
 *
 * Hardened against startup race conditions:
 * - Waits for an authenticated user session.
 * - Waits for subscription to finish loading.
 * - Only disables when the backend has returned a definitive answer
 *   (i.e. `source` is set, or the trial has unequivocally expired).
 * - Requires two consecutive "no access" cycles before disabling, to avoid
 *   flipping off mid-resolve due to a transient network/JWT error.
 */
export const BusinessModeGuard = () => {
  const { businessModeEnabled, setBusinessModeEnabled } = useAppState();
  const { user } = useAuth();
  const { loading, subscribed, trialActive, trialExpired, source, tier } = useSubscription();

  // Debounce: require N consecutive "no access" reads before flipping off.
  const noAccessStreak = useRef(0);
  const REQUIRED_STREAK = 2;

  useEffect(() => {
    // Bail if business mode isn't even on — nothing to disable.
    if (!businessModeEnabled) {
      noAccessStreak.current = 0;
      return;
    }

    // Wait for auth + subscription to fully resolve before deciding.
    if (!user || loading) {
      return;
    }

    // Has access if subscribed (any tier) OR currently on trial.
    const hasBusinessAccess = subscribed || trialActive;
    if (hasBusinessAccess) {
      noAccessStreak.current = 0;
      return;
    }

    // We only trust a "no access" verdict when the backend has actually
    // spoken: source must be set (stripe/admin) OR trial must be confirmed expired.
    const backendAnswered = source !== null || trialExpired;
    if (!backendAnswered) {
      // Still on provisional defaults — do nothing.
      return;
    }

    noAccessStreak.current += 1;
    if (noAccessStreak.current >= REQUIRED_STREAK) {
      console.log('[BusinessModeGuard] Disabling business mode after confirmed no-access', {
        tier, subscribed, trialActive, trialExpired, source,
      });
      setBusinessModeEnabled(false);
      noAccessStreak.current = 0;
    }
  }, [businessModeEnabled, user, loading, subscribed, trialActive, trialExpired, source, tier, setBusinessModeEnabled]);

  return null;
};
