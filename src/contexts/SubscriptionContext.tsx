import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { SubscriptionTier, isTrialExpired, getTrialDaysRemaining } from '@/lib/subscriptionTiers';

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
      console.log('[Subscription] No session, skipping check');
      setLoading(false);
      return;
    }

    try {
      console.log('[Subscription] Checking subscription...');
      const { data, error } = await supabase.functions.invoke('check-subscription', {
        headers: { Authorization: `Bearer ${session.access_token}` },
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
    } catch (err) {
      console.error('Error checking subscription:', err);
    } finally {
      setLoading(false);
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

  return (
    <SubscriptionContext.Provider value={{
      tier,
      subscribed,
      loading,
      trialActive,
      trialDaysRemaining,
      trialExpired,
      subscriptionEnd,
      source,
      checkSubscription,
    }}>
      {children}
    </SubscriptionContext.Provider>
  );
};
