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
  simpleModeEnabled: boolean;
  setSimpleModeEnabled: (enabled: boolean) => void;
  familyModeEnabled: boolean;
  setFamilyModeEnabled: (enabled: boolean) => void;
  // Master switch (controlled from Settings) — does the user want business features at all?
  businessFeatureEnabled: boolean;
  setBusinessFeatureEnabled: (enabled: boolean) => void;
  // Session view flag — is the business view currently open right now?
  businessModeEnabled: boolean;
  setBusinessModeEnabled: (enabled: boolean) => void;
  activeBusinessProfileId: string | null;
  setActiveBusinessProfileId: (id: string | null) => void;
  onboardingCompleted: boolean;
  setOnboardingCompleted: (completed: boolean) => void;
  // Usage profile: 'finance_only' | 'finance_projects' | null (legacy)
  usageProfile: UsageProfile;
  setUsageProfile: (p: UsageProfile) => void;
  // Dashboard V2 layout (refocused: hero=projects-or-balance, no cashflow/savings/quicklinks
  // on home). Default ON; opt-out via Settings → "Klasični prikaz".
  dashboardV2Enabled: boolean;
  setDashboardV2Enabled: (enabled: boolean) => void;
  appStateReady: boolean;
  onAvatarEvent: (handler: AvatarEventHandler) => () => void;
  emitAvatarEvent: (mood: AvatarMood, message?: string) => void;
  onFinancialReset: (handler: FinancialResetHandler) => () => void;
  emitFinancialReset: () => void;
  onPaymentSourcesReordered: (handler: PaymentSourcesHandler) => () => void;
  emitPaymentSourcesReordered: (sources: CustomPaymentSource[]) => void;
}

const AppStateContext = createContext<AppStateContextValue | null>(null);

export const AppStateProvider = ({ children }: { children: ReactNode }) => {
  const [displayName, setDisplayNameState] = useState<string>(
    () => localStorage.getItem('user_display_name') || ''
  );
  const [aiAssistantEnabled, setAiAssistantEnabledState] = useState<boolean>(
    () => localStorage.getItem('ai_assistant_enabled') !== 'false'
  );
  const [simpleModeEnabled, setSimpleModeEnabledState] = useState<boolean>(
    () => localStorage.getItem('simple_mode_enabled') === 'true'
  );
  const [familyModeEnabled, setFamilyModeEnabledState] = useState<boolean>(
    () => localStorage.getItem('family_mode_enabled') !== 'false'
  );
  // Master switch from Settings — persisted. If user upgrades from old build,
  // migrate from the previous `business_mode_enabled` key (which used to act as master).
  const [businessFeatureEnabled, setBusinessFeatureEnabledState] = useState<boolean>(() => {
    const explicit = localStorage.getItem('business_feature_enabled');
    if (explicit !== null) return explicit === 'true';
    // Migration: previously `business_mode_enabled === 'true'` meant feature was on
    return localStorage.getItem('business_mode_enabled') === 'true';
  });
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
  // Dashboard V2 default ON; only OFF if user explicitly opts out.
  const [dashboardV2Enabled, setDashboardV2EnabledState] = useState<boolean>(
    () => localStorage.getItem('dashboard_v2_enabled') !== 'false'
  );
  const [appStateReady, setAppStateReady] = useState(false);

  // Auto-select for invitation-acceptance flow runs only WITHIN the session
  // (acceptance code calls the setters directly). On cold start we never
  // resurrect business mode — user explicitly opts in via the switcher.
  useEffect(() => {
    const resolveOnboarding = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      
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

    // Also listen for auth changes (e.g., sign in after page load)
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'SIGNED_IN') {
        // Re-resolve when user signs in
        setAppStateReady(false);
        resolveOnboarding();
      } else if (event === 'SIGNED_OUT') {
        setOnboardingCompletedState(false);
        setDisplayNameState('');
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

  const setSimpleModeEnabled = useCallback((enabled: boolean) => {
    setSimpleModeEnabledState(enabled);
    localStorage.setItem('simple_mode_enabled', enabled.toString());
  }, []);

  const setFamilyModeEnabled = useCallback((enabled: boolean) => {
    setFamilyModeEnabledState(enabled);
    localStorage.setItem('family_mode_enabled', enabled.toString());
  }, []);

  const setBusinessFeatureEnabled = useCallback((enabled: boolean) => {
    setBusinessFeatureEnabledState(enabled);
    localStorage.setItem('business_feature_enabled', enabled.toString());
    // When user disables the master switch, also exit any active business view —
    // but KEEP the active_business_profile_id so it returns when re-enabled.
    if (!enabled) {
      setBusinessModeEnabledState(false);
      localStorage.setItem('business_mode_enabled', 'false');
    } else {
      // Restore business view when feature is re-enabled
      setBusinessModeEnabledState(true);
      localStorage.setItem('business_mode_enabled', 'true');
    }
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

  const setDashboardV2Enabled = useCallback((enabled: boolean) => {
    setDashboardV2EnabledState(enabled);
    localStorage.setItem('dashboard_v2_enabled', enabled.toString());
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
    simpleModeEnabled,
    setSimpleModeEnabled,
    familyModeEnabled,
    setFamilyModeEnabled,
    businessFeatureEnabled,
    setBusinessFeatureEnabled,
    businessModeEnabled,
    setBusinessModeEnabled,
    activeBusinessProfileId,
    setActiveBusinessProfileId,
    onboardingCompleted,
    setOnboardingCompleted,
    usageProfile,
    setUsageProfile,
    dashboardV2Enabled,
    setDashboardV2Enabled,
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
    simpleModeEnabled, setSimpleModeEnabled,
    familyModeEnabled, setFamilyModeEnabled,
    businessFeatureEnabled, setBusinessFeatureEnabled,
    businessModeEnabled, setBusinessModeEnabled,
    activeBusinessProfileId, setActiveBusinessProfileId,
    onboardingCompleted, setOnboardingCompleted,
    usageProfile, setUsageProfile,
    dashboardV2Enabled, setDashboardV2Enabled,
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
