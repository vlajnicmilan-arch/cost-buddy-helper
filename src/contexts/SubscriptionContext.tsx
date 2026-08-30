import React, { createContext, useContext, useState, useEffect, useCallback, useMemo } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { SubscriptionTier } from '@/lib/subscriptionTiers';
import { getFreshAccessToken } from '@/lib/supabaseRetry';

export type EntitlementModule = 'smjer' | 'krug' | 'projekti' | 'biznis';
export type EntitlementsMode = 'legacy' | 'dual' | 'entitlements';

export interface ModuleEntitlement {
  active: boolean;
  source: string | null;
  period_end: string | null;
}

const EMPTY_ENTITLEMENTS: Record<EntitlementModule, ModuleEntitlement> = {
  smjer: { active: false, source: null, period_end: null },
  krug: { active: false, source: null, period_end: null },
  projekti: { active: false, source: null, period_end: null },
  biznis: { active: false, source: null, period_end: null },
};

interface SubscriptionState {
  tier: SubscriptionTier;
  subscribed: boolean;
  loading: boolean;
  trialActive: boolean;
  trialDaysRemaining: number;
  subscriptionEnd: string | null;
  source: 'admin' | 'paddle' | null;
  entitlements: Record<EntitlementModule, ModuleEntitlement>;
  entitlementsMode: EntitlementsMode;
  checkSubscription: () => Promise<void>;
}

const SubscriptionContext = createContext<SubscriptionState>({
  tier: 'free',
  subscribed: false,
  loading: true,
  trialActive: false,
  trialDaysRemaining: 0,
  subscriptionEnd: null,
  source: null,
  entitlements: EMPTY_ENTITLEMENTS,
  entitlementsMode: 'dual',
  checkSubscription: async () => {},
});

export const useSubscription = () => useContext(SubscriptionContext);

/**
 * Kill-switch: čita app_settings.entitlements_mode.
 * Fallback = 'dual' (safe: dual čita i tier i entitlements).
 */
async function fetchEntitlementsMode(): Promise<EntitlementsMode> {
  try {
    const { data } = await supabase
      .from('app_settings')
      .select('value')
      .eq('key', 'entitlements_mode')
      .maybeSingle();
    const raw = data?.value;
    const parsed = typeof raw === 'string' ? raw : (raw as any);
    if (parsed === 'legacy' || parsed === 'dual' || parsed === 'entitlements') return parsed;
    return 'dual';
  } catch {
    return 'dual';
  }
}




export const SubscriptionProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { session } = useAuth();
  const [tier, setTier] = useState<SubscriptionTier>('free');
  const [subscribed, setSubscribed] = useState(false);
  const [loading, setLoading] = useState(true);
  const [subscriptionEnd, setSubscriptionEnd] = useState<string | null>(null);
  const [source, setSource] = useState<SubscriptionState['source']>(null);
  const [entitlements, setEntitlements] = useState<Record<EntitlementModule, ModuleEntitlement>>(EMPTY_ENTITLEMENTS);
  const [entitlementsMode, setEntitlementsMode] = useState<EntitlementsMode>('dual');

  const checkSubscription = useCallback(async () => {
    if (!session?.access_token) {
      console.log('[Subscription] No session yet, keeping loading=true until auth resolves');
      return;
    }

    try {
      const freshToken = await getFreshAccessToken();
      if (!freshToken) {
        console.log('[Subscription] No fresh token available, will retry next cycle');
        return;
      }

      // Paralelno: kill-switch + check-subscription (jedini poziv koji vraća entitlements + legacy tier)
      const [mode, subRes] = await Promise.all([
        fetchEntitlementsMode(),
        supabase.functions.invoke('check-subscription', {
          headers: { Authorization: `Bearer ${freshToken}` },
        }),
      ]);
      setEntitlementsMode(mode);

      if (subRes.error) throw subRes.error;
      const data = subRes.data as any;

      setSubscribed(!!data.subscribed);
      setTier((data.tier as SubscriptionTier) || 'free');
      setSubscriptionEnd(data.subscription_end || null);
      setSource((data.source as any) || null);
      if (data.entitlements) {
        setEntitlements({
          smjer: data.entitlements.smjer ?? EMPTY_ENTITLEMENTS.smjer,
          krug: data.entitlements.krug ?? EMPTY_ENTITLEMENTS.krug,
          projekti: data.entitlements.projekti ?? EMPTY_ENTITLEMENTS.projekti,
          biznis: data.entitlements.biznis ?? EMPTY_ENTITLEMENTS.biznis,
        });
      }
      setLoading(false);
    } catch (err) {
      const errMsg = String((err as any)?.message || err);
      if (/jwt|token.*expir|unauthorized/i.test(errMsg)) {
        console.log('[Subscription] Transient auth error, will retry next cycle');
      } else {
        console.error('Error checking subscription:', err);
      }
    }
  }, [session?.access_token]);

  useEffect(() => {
    checkSubscription();
  }, [checkSubscription]);

  useEffect(() => {
    if (!session) return;
    const interval = setInterval(checkSubscription, 60000);
    return () => clearInterval(interval);
  }, [session, checkSubscription]);

  // FAZA 5: trial se čita iz user_entitlements (source='trial'), NE iz profiles.created_at.
  const trialFromEntitlements = useMemo(() => {
    const trialRows = (['smjer', 'krug', 'projekti', 'biznis'] as EntitlementModule[])
      .map((m) => entitlements[m])
      .filter((e) => e.source === 'trial' && e.active && e.period_end);
    if (trialRows.length === 0) return null;
    const maxEnd = trialRows.reduce((max, e) => {
      const t = new Date(e.period_end!).getTime();
      return t > max ? t : max;
    }, 0);
    return {
      active: true,
      daysRemaining: Math.max(0, Math.ceil((maxEnd - Date.now()) / (1000 * 60 * 60 * 24))),
      periodEnd: new Date(maxEnd).toISOString(),
    };
  }, [entitlements]);

  // Trial se čita ISKLJUČIVO iz user_entitlements (source='trial') i djeluje
  // samo po modulu. Nema naslijeđenog izračuna iz auth.users.created_at i
  // nema globalnog isteka — besplatan račun je besplatan zauvijek.
  const { trialActive, trialDaysRemaining } = useMemo(() => {
    if (subscribed || !trialFromEntitlements) {
      return { trialActive: false, trialDaysRemaining: 0 };
    }
    return {
      trialActive: trialFromEntitlements.daysRemaining > 0,
      trialDaysRemaining: trialFromEntitlements.daysRemaining,
    };
  }, [subscribed, trialFromEntitlements]);

  const contextValue = useMemo(() => ({
    tier,
    subscribed,
    loading,
    trialActive,
    trialDaysRemaining,
    subscriptionEnd,
    source,
    entitlements,
    entitlementsMode,
    checkSubscription,
  }), [tier, subscribed, loading, trialActive, trialDaysRemaining, subscriptionEnd, source, entitlements, entitlementsMode, checkSubscription]);


  return (
    <SubscriptionContext.Provider value={contextValue}>
      {children}
    </SubscriptionContext.Provider>
  );
};

