import React, { createContext, useContext, useState, useEffect, useCallback, useMemo } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { SubscriptionTier, isTrialExpired, getTrialDaysRemaining } from '@/lib/subscriptionTiers';
import { getFreshAccessToken } from '@/lib/supabaseRetry';

interface SubscriptionState {
  tier: SubscriptionTier;
  subscribed: boolean;
  loading: boolean;
  trialActive: boolean;
  trialDaysRemaining: number;
  trialExpired: boolean;
  subscriptionEnd: string | null;
  source: 'stripe' | 'admin' | null;
  checkSubscription: () => Promise<void>;
}

const SubscriptionContext = createContext<SubscriptionState>({
  tier: 'free',
  subscribed: false,
  loading: true,
  trialActive: false,
  trialDaysRemaining: 0,
  trialExpired: false,
  subscriptionEnd: null,
  source: null,
  checkSubscription: async () => {},
});

export const useSubscription = () => useContext(SubscriptionContext);

export const SubscriptionProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user, session } = useAuth();
  const [tier, setTier] = useState<SubscriptionTier>('free');
  const [subscribed, setSubscribed] = useState(false);
  const [loading, setLoading] = useState(true);
  const [subscriptionEnd, setSubscriptionEnd] = useState<string | null>(null);
  const [source, setSource] = useState<'stripe' | 'admin' | null>(null);
  const [trialActive, setTrialActive] = useState(false);
  const [trialDaysRemaining, setTrialDaysRemaining] = useState(0);
  const [trialExpired, setTrialExpired] = useState(false);

  const checkSubscription = useCallback(async () => {
    if (!session?.access_token) {
      // No session yet — stay in "loading" state to avoid downstream guards
      // reacting to a provisional 'free' tier before auth has resolved.
      console.log('[Subscription] No session yet, keeping loading=true until auth resolves');
      return;
    }

    try {
      console.log('[Subscription] Checking subscription...');
      // Get fresh token to avoid stale JWT issues
      const freshToken = await getFreshAccessToken();
      if (!freshToken) {
        console.log('[Subscription] No fresh token available, will retry next cycle');
        return;
      }

      const { data, error } = await supabase.functions.invoke('check-subscription', {
        headers: { Authorization: `Bearer ${freshToken}` },
      });

      if (error) throw error;

      setSubscribed(data.subscribed);
      setTier(data.tier || 'free');
      setSubscriptionEnd(data.subscription_end || null);
      setSource(data.source || null);

      // Calculate trial status based on user creation date
      if (!data.subscribed && user?.created_at) {
        const expired = isTrialExpired(user.created_at);
        const remaining = getTrialDaysRemaining(user.created_at);
        setTrialExpired(expired);
        setTrialActive(!expired);
        setTrialDaysRemaining(remaining);
      } else {
        setTrialActive(false);
        setTrialExpired(false);
        setTrialDaysRemaining(0);
      }
      // Mark resolved only after a real backend response
      setLoading(false);
    } catch (err) {
      // Silently handle auth/JWT errors — they'll resolve on next cycle
      // IMPORTANT: do NOT reset tier/subscribed to defaults — preserve last known
      // good state so transient errors don't strip access (and disable business mode).
      const errMsg = String((err as any)?.message || err);
      if (/jwt|token.*expir|unauthorized/i.test(errMsg)) {
        console.log('[Subscription] Transient auth error, will retry next cycle');
      } else {
        console.error('Error checking subscription:', err);
      }
      // Do not flip loading=false here — keep guards waiting until we get a real answer.
    }
  }, [session?.access_token, user?.created_at]);

  // Check on mount and auth change
  useEffect(() => {
    checkSubscription();
  }, [checkSubscription]);

  // Auto-refresh every 60 seconds
  useEffect(() => {
    if (!session) return;
    const interval = setInterval(checkSubscription, 60000);
    return () => clearInterval(interval);
  }, [session, checkSubscription]);

  const contextValue = useMemo(() => ({
    tier, subscribed, loading, trialActive, trialDaysRemaining,
    trialExpired, subscriptionEnd, source, checkSubscription,
  }), [tier, subscribed, loading, trialActive, trialDaysRemaining, trialExpired, subscriptionEnd, source, checkSubscription]);

  return (
    <SubscriptionContext.Provider value={contextValue}>
      {children}
    </SubscriptionContext.Provider>
  );
};
