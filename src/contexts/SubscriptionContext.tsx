import React, { createContext, useContext, useState, useEffect, useCallback, useMemo } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { SubscriptionTier } from '@/lib/subscriptionTiers';
import { getFreshAccessToken } from '@/lib/supabaseRetry';
import { markOnce } from '@/lib/bootTiming';

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
  /**
   * Postaje true nakon prvog dovršenog checkSubscription (i pri grešci), ili
   * kad je auth razriješen bez sesije. Dok je false, prava se JOŠ NE ZNAJU —
   * nijedan gate ne smije donositi odluku.
   */
  subscriptionReady: boolean;
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
  subscriptionReady: false,
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




/**
 * Lokalna predmemorija prava (samo ubrzanje ulaska).
 * Ključ je vezan uz user_id; briše se pri odjavi/promjeni korisnika kroz
 * USER_SCOPED_KEY_PREFIXES ('subscription_cache:') u AppStateContextu.
 */
export const SUBSCRIPTION_CACHE_PREFIX = 'subscription_cache:v1:';
const SUBSCRIPTION_CACHE_MAX_AGE_MS = 24 * 60 * 60 * 1000;

interface SubscriptionCachePayload {
  user_id: string;
  saved_at: string;
  tier: SubscriptionTier;
  subscribed: boolean;
  subscription_end: string | null;
  source: SubscriptionState['source'];
  entitlements: Record<EntitlementModule, ModuleEntitlement>;
  entitlements_mode: EntitlementsMode;
}

export const readSubscriptionCache = (
  userId: string,
  now: number = Date.now(),
): SubscriptionCachePayload | null => {
  try {
    const raw = localStorage.getItem(SUBSCRIPTION_CACHE_PREFIX + userId);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as SubscriptionCachePayload;
    if (!parsed || parsed.user_id !== userId) return null;
    const savedAt = new Date(parsed.saved_at).getTime();
    if (!Number.isFinite(savedAt)) return null;
    if (now - savedAt > SUBSCRIPTION_CACHE_MAX_AGE_MS) return null;
    return parsed;
  } catch {
    return null;
  }
};

export const writeSubscriptionCache = (payload: SubscriptionCachePayload): void => {
  try {
    localStorage.setItem(SUBSCRIPTION_CACHE_PREFIX + payload.user_id, JSON.stringify(payload));
  } catch { /* quota */ }
};

export const SubscriptionProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { session, loading: authLoading } = useAuth();
  const [tier, setTier] = useState<SubscriptionTier>('free');
  const [subscribed, setSubscribed] = useState(false);
  const [loading, setLoading] = useState(true);
  const [subscriptionReady, setSubscriptionReady] = useState(false);
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
      setSubscriptionReady(true);
    } catch (err) {
      const errMsg = String((err as any)?.message || err);
      if (/jwt|token.*expir|unauthorized/i.test(errMsg)) {
        console.log('[Subscription] Transient auth error, will retry next cycle');
      } else {
        console.error('Error checking subscription:', err);
      }
      // I pri grešci: gate smije odlučivati, korisnik se ne smije zaglaviti.
      setSubscriptionReady(true);
    }
  }, [session?.access_token]);

  // Bez sesije nema što čekati: gate ne smije visjeti u loaderu.
  useEffect(() => {
    if (!authLoading && !session) setSubscriptionReady(true);
  }, [authLoading, session]);

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

  // Boot timing only: first moment the subscription state became ready.
  useEffect(() => { if (subscriptionReady) markOnce('subscription_ready'); }, [subscriptionReady]);

  const contextValue = useMemo(() => ({
    tier,
    subscribed,
    loading,
    subscriptionReady,
    trialActive,
    trialDaysRemaining,
    subscriptionEnd,
    source,
    entitlements,
    entitlementsMode,
    checkSubscription,
  }), [tier, subscribed, loading, subscriptionReady, trialActive, trialDaysRemaining, subscriptionEnd, source, entitlements, entitlementsMode, checkSubscription]);


  return (
    <SubscriptionContext.Provider value={contextValue}>
      {children}
    </SubscriptionContext.Provider>
  );
};

