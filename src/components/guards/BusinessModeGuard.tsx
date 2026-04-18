import { useEffect } from 'react';
import { useAppState } from '@/contexts/AppStateContext';
import { useFeatureAccess } from '@/hooks/useFeatureAccess';
import { useSubscription } from '@/contexts/SubscriptionContext';

/**
 * Auto-disables business mode for users who lost (or never had) Business access.
 * Waits for subscription to load before acting to avoid disabling for legitimate users.
 */
export const BusinessModeGuard = () => {
  const { businessModeEnabled, setBusinessModeEnabled } = useAppState();
  const { hasAccess } = useFeatureAccess();
  const { loading } = useSubscription();

  useEffect(() => {
    if (loading) return;
    if (businessModeEnabled && !hasAccess('business_module')) {
      console.log('[BusinessModeGuard] Disabling business mode — user lacks business_module access');
      setBusinessModeEnabled(false);
    }
  }, [businessModeEnabled, hasAccess, setBusinessModeEnabled, loading]);

  return null;
};
