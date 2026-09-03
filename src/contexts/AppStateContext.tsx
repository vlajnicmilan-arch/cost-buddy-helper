import { createContext, useContext, useState, useCallback, useRef, useEffect, useMemo, ReactNode } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { CustomPaymentSource } from '@/types/customPaymentSource';

// ─── Avatar Mood ────────────────────────────────────────────────────────────
export type AvatarMood = 'happy' | 'thinking' | 'worried' | 'proud' | 'neutral';

type AvatarEventHandler = (mood: AvatarMood, message?: string) => void;
type FinancialResetHandler = () => void;
type PaymentSourcesHandler = (sources: CustomPaymentSource[]) => void;

// Usage profile chosen during onboarding. `null` = legacy user (pre-feature) →
// treat as "show everything", do not retro-actively force a choice.
export type UsageProfile = 'finance_only' | 'finance_projects' | null;

interface AppStateContextValue {
  displayName: string;
  setDisplayName: (name: string) => void;
  aiAssistantEnabled: boolean;
  setAiAssistantEnabled: (enabled: boolean) => void;
  // Session view flag — is the business view currently open right now?
  businessModeEnabled: boolean;
  setBusinessModeEnabled: (enabled: boolean) => void;
  activeBusinessProfileId: string | null;
  setActiveBusinessProfileId: (id: string | null) => void;
  onboardingCompleted: boolean;
  setOnboardingCompleted: (completed: boolean) => void;
  // Usage profile: 'finance_only' | 'finance_projects' | null (legacy).
  // OD FAZE 1 MODULARNOG UI-A: nije više UI gate za Projects (zamijenjen
  // sa projectsModuleEnabled). Ostaje za onboarding analitiku/telemetriju.
  usageProfile: UsageProfile;
  setUsageProfile: (p: UsageProfile) => void;
  appStateReady: boolean;
  onAvatarEvent: (handler: AvatarEventHandler) => () => void;
  emitAvatarEvent: (mood: AvatarMood, message?: string) => void;
  onFinancialReset: (handler: FinancialResetHandler) => () => void;
  emitFinancialReset: () => void;
  onPaymentSourcesReordered: (handler: PaymentSourcesHandler) => () => void;
  emitPaymentSourcesReordered: (sources: CustomPaymentSource[]) => void;
}

/**
 * localStorage ključevi koji pripadaju KORISNIKU (ne uređaju) i moraju se
 * očistiti pri odjavi. Ključevi uređaja (`theme`, `finmate-storage-config`,
 * `ai_assistant_enabled`) namjerno ostaju.
 */
const USER_SCOPED_KEYS = [
  'business_feature_enabled',
  'business_mode_enabled',
  'active_business_profile_id',
  'usage_profile',
  'projects_module_enabled',
  'krug_mode_enabled',
  'user_display_name',
  'onboarding_completed',
] as const;

const AppStateContext = createContext<AppStateContextValue | null>(null);

export const AppStateProvider = ({ children }: { children: ReactNode }) => {
  const [displayName, setDisplayNameState] = useState<string>(
    () => localStorage.getItem('user_display_name') || ''
  );
  const [aiAssistantEnabled, setAiAssistantEnabledState] = useState<boolean>(
    () => localStorage.getItem('ai_assistant_enabled') !== 'false'
  );
  // Business view (Personal vs Tvrtka) persists across cold starts, like every
  // other user setting. The chip on the dashboard always shows the current
  // context, so there is no "safety reset" to Personal on app relaunch.
  const [businessModeEnabled, setBusinessModeEnabledState] = useState<boolean>(
    () => localStorage.getItem('business_mode_enabled') === 'true'
  );
  const [activeBusinessProfileId, setActiveBusinessProfileIdState] = useState<string | null>(
    () => localStorage.getItem('active_business_profile_id')
  );
  const [onboardingCompleted, setOnboardingCompletedState] = useState<boolean>(
    () => localStorage.getItem('onboarding_completed') === 'true'
  );
  const [usageProfile, setUsageProfileState] = useState<UsageProfile>(() => {
    const v = localStorage.getItem('usage_profile');
    return v === 'finance_only' || v === 'finance_projects' ? v : null;
  });
  const [appStateReady, setAppStateReady] = useState(false);

  // Jednokratni cleanup uklonjenih legacy ključeva (Faza 2 & 3 revizije postavki):
  //  - `simple_mode_enabled` (Jednostavni način — potpuno maknuto)
  //  - `dashboard_v2_enabled` (Klasični prikaz početne — V2 je jedini put)
  //  - `pwa-auto-update` (Faza 3: auto-update je uvijek ON)
  useEffect(() => {
    try {
      localStorage.removeItem('simple_mode_enabled');
      localStorage.removeItem('dashboard_v2_enabled');
      localStorage.removeItem('pwa-auto-update');
      // Ukinuti prekidači modula — vrijednosti više nemaju čitatelja.
      localStorage.removeItem('krug_mode_enabled');
      localStorage.removeItem('projects_module_enabled');
      localStorage.removeItem('business_feature_enabled');
    } catch {
      /* noop */
    }
  }, []);

  // Zadnji korisnik za kojeg je onboarding STVARNO razriješen. Sprječava puni
  // reset (appStateReady=false → PageLoader → unmount cijelog stabla) na svaki
  // 'SIGNED_IN' koji supabase-js emitira pri povratku fokusa / token refreshu.
  const lastResolvedUserRef = useRef<string | null>(null);

  // Auto-select for invitation-acceptance flow runs only WITHIN the session
  // (acceptance code calls the setters directly). On cold start we never
  // resurrect business mode — user explicitly opts in via the switcher.
  useEffect(() => {
    const resolveOnboarding = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      lastResolvedUserRef.current = session?.user?.id ?? null;

      
      if (!session?.user) {
        // No user — ready immediately, onboarding state from localStorage is fine
        setAppStateReady(true);
        return;
      }

      // User exists — restore cloud storage config if missing
      const hasStorageConfig = localStorage.getItem('finmate-storage-config');
      if (!hasStorageConfig) {
        localStorage.setItem('finmate-storage-config', JSON.stringify({ mode: 'cloud', lastSync: new Date().toISOString() }));
        window.dispatchEvent(new Event('storage-mode-restored'));
      }

      // Validate the remembered business profile still exists (silently clear if not)
      const storedProfileId = localStorage.getItem('active_business_profile_id');
      if (storedProfileId) {
        try {
          const { data: bp } = await supabase
            .from('business_profiles')
            .select('id')
            .eq('id', storedProfileId)
            .eq('user_id', session.user.id)
            .maybeSingle();
          if (!bp) {
            localStorage.removeItem('active_business_profile_id');
            setActiveBusinessProfileIdState(null);
          }
        } catch {
          // Network hiccup — leave the stored id alone, switcher will handle invalid state
        }
      }

      // Backend (profiles.onboarding_completed) je izvor istine.
      // localStorage služi samo kao cache za sinkroni initial render.
      try {
        const { data: profile } = await supabase
          .from('profiles')
          .select('display_name, onboarding_completed, timezone, preferred_language')
          .eq('user_id', session.user.id)
          .maybeSingle();

        const dbCompleted = !!profile?.onboarding_completed;

        if (dbCompleted) {
          localStorage.setItem('onboarding_completed', 'true');
          setOnboardingCompletedState(true);
          if (profile?.display_name?.trim()) {
            localStorage.setItem('user_display_name', profile.display_name);
            setDisplayNameState(profile.display_name);
          }
        } else {
          // DB kaže da nije gotov — očisti stari localStorage flag s prethodnog uređaja/sesije
          // i pokaži onboarding wizard. Ako je localStorage tvrdio "gotov" a baza ne, baza pobjeđuje.
          if (localStorage.getItem('onboarding_completed') === 'true') {
            localStorage.removeItem('onboarding_completed');
          }
          setOnboardingCompletedState(false);
        }

        // Tihi sync timezone i jezika iz preglednika ako u bazi nedostaju.
        // Potrebno za dnevni sažetak push (šalje se u 21:00 lokalno).
        try {
          const browserTz = Intl.DateTimeFormat().resolvedOptions().timeZone;
          const browserLang = (navigator.language || 'hr').toLowerCase().slice(0, 2);
          const supportedLang = ['hr', 'en', 'de'].includes(browserLang) ? browserLang : 'hr';
          const updates: Record<string, string> = {};
          if (browserTz && !(profile as any)?.timezone) updates.timezone = browserTz;
          if (!(profile as any)?.preferred_language) updates.preferred_language = supportedLang;
          if (Object.keys(updates).length > 0) {
            await supabase.from('profiles').update(updates).eq('user_id', session.user.id);
          }
        } catch {
          /* best-effort, ignore */
        }

      } catch (e) {
        console.error('Failed to resolve onboarding state from DB:', e);
        // Fallback na localStorage cache ako je mreža pala — bolje pustiti korisnika u app
        // nego ga zaglaviti u wizardu zbog mrežnog hiccupa.
        if (localStorage.getItem('onboarding_completed') === 'true') {
          setOnboardingCompletedState(true);
        }
      }

      setAppStateReady(true);
    };

    resolveOnboarding();

    // Also listen for auth changes (e.g., sign in after page load).
    // VAŽNO: supabase-js emitira 'SIGNED_IN' i pri povratku fokusa prozora te
    // pri token refreshu. Puni reset radimo SAMO kad se korisnik stvarno
    // promijenio; inače osvježavamo u pozadini bez skidanja appStateReady
    // (bez PageLoadera → dijalozi i ekran ostaju otvoreni).
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'SIGNED_IN') {
        const nextUserId = session?.user?.id ?? null;
        const isSameUser = nextUserId !== null && nextUserId === lastResolvedUserRef.current;
        if (!isSameUser) {
          setAppStateReady(false);
        }
        resolveOnboarding();
      } else if (event === 'SIGNED_OUT') {
        lastResolvedUserRef.current = null;
        // Ključevi vezani UZ RAČUN, ne uz uređaj — inače ih sljedeći korisnik
        // na istom pregledniku naslijedi.
        USER_SCOPED_KEYS.forEach((key) => {
          try { localStorage.removeItem(key); } catch { /* noop */ }
        });
        setOnboardingCompletedState(false);
        setDisplayNameState('');
        setBusinessModeEnabledState(false);
        setActiveBusinessProfileIdState(null);
        setUsageProfileState(null);
        setAppStateReady(true);
      }
    });


    return () => subscription.unsubscribe();
  }, []);

  // Subscriber registries
  const avatarHandlers = useRef<Set<AvatarEventHandler>>(new Set());
  const resetHandlers = useRef<Set<FinancialResetHandler>>(new Set());
  const paymentHandlers = useRef<Set<PaymentSourcesHandler>>(new Set());

  const setDisplayName = useCallback((name: string) => {
    setDisplayNameState(name);
    localStorage.setItem('user_display_name', name);
  }, []);

  const setAiAssistantEnabled = useCallback((enabled: boolean) => {
    setAiAssistantEnabledState(enabled);
    localStorage.setItem('ai_assistant_enabled', enabled.toString());
  }, []);

  const setBusinessModeEnabled = useCallback((enabled: boolean) => {
    setBusinessModeEnabledState(enabled);
    localStorage.setItem('business_mode_enabled', enabled.toString());
    // Note: we intentionally KEEP active_business_profile_id when disabling business view,
    // so the user's last chosen company is remembered for next time they re-enable it.
  }, []);

  const setActiveBusinessProfileId = useCallback((id: string | null) => {
    setActiveBusinessProfileIdState(id);
    if (id) {
      localStorage.setItem('active_business_profile_id', id);
    } else {
      localStorage.removeItem('active_business_profile_id');
    }
  }, []);

  const setOnboardingCompleted = useCallback((completed: boolean) => {
    setOnboardingCompletedState(completed);
    if (completed) localStorage.setItem('onboarding_completed', 'true');
  }, []);

  const setUsageProfile = useCallback((p: UsageProfile) => {
    setUsageProfileState(p);
    if (p === null) {
      localStorage.removeItem('usage_profile');
    } else {
      localStorage.setItem('usage_profile', p);
    }
  }, []);

  const onAvatarEvent = useCallback((handler: AvatarEventHandler) => {
    avatarHandlers.current.add(handler);
    return () => { avatarHandlers.current.delete(handler); };
  }, []);

  const emitAvatarEvent = useCallback((mood: AvatarMood, message?: string) => {
    avatarHandlers.current.forEach(h => h(mood, message));
  }, []);

  const onFinancialReset = useCallback((handler: FinancialResetHandler) => {
    resetHandlers.current.add(handler);
    return () => { resetHandlers.current.delete(handler); };
  }, []);

  const emitFinancialReset = useCallback(() => {
    resetHandlers.current.forEach(h => h());
  }, []);

  const onPaymentSourcesReordered = useCallback((handler: PaymentSourcesHandler) => {
    paymentHandlers.current.add(handler);
    return () => { paymentHandlers.current.delete(handler); };
  }, []);

  const emitPaymentSourcesReordered = useCallback((sources: CustomPaymentSource[]) => {
    paymentHandlers.current.forEach(h => h(sources));
  }, []);

  const contextValue = useMemo(() => ({
    displayName,
    setDisplayName,
    aiAssistantEnabled,
    setAiAssistantEnabled,
    businessModeEnabled,
    setBusinessModeEnabled,
    activeBusinessProfileId,
    setActiveBusinessProfileId,
    onboardingCompleted,
    setOnboardingCompleted,
    usageProfile,
    setUsageProfile,
    appStateReady,
    onAvatarEvent,
    emitAvatarEvent,
    onFinancialReset,
    emitFinancialReset,
    onPaymentSourcesReordered,
    emitPaymentSourcesReordered,
  }), [
    displayName, setDisplayName,
    aiAssistantEnabled, setAiAssistantEnabled,
    businessModeEnabled, setBusinessModeEnabled,
    activeBusinessProfileId, setActiveBusinessProfileId,
    onboardingCompleted, setOnboardingCompleted,
    usageProfile, setUsageProfile,
    appStateReady,
    onAvatarEvent, emitAvatarEvent,
    onFinancialReset, emitFinancialReset,
    onPaymentSourcesReordered, emitPaymentSourcesReordered,
  ]);

  return (
    <AppStateContext.Provider value={contextValue}>
      {children}
    </AppStateContext.Provider>
  );
};

export const useAppState = () => {
  const ctx = useContext(AppStateContext);
  if (!ctx) throw new Error('useAppState must be used within AppStateProvider');
  return ctx;
};
