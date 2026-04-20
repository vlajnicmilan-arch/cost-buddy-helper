import { createContext, useContext, useState, useCallback, useRef, useEffect, useMemo, ReactNode } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { CustomPaymentSource } from '@/types/customPaymentSource';

// ─── Avatar Mood ────────────────────────────────────────────────────────────
export type AvatarMood = 'happy' | 'thinking' | 'worried' | 'proud' | 'neutral';

type AvatarEventHandler = (mood: AvatarMood, message?: string) => void;
type FinancialResetHandler = () => void;
type PaymentSourcesHandler = (sources: CustomPaymentSource[]) => void;

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
  // Always start each session in Personal mode (default view) for safety.
  // The last active business profile id is preserved separately so the
  // BusinessProfileSwitcher can show it and one click returns to business mode.
  // Master switch from Settings — persisted. If user upgrades from old build,
  // migrate from the previous `business_mode_enabled` key (which used to act as master).
  const [businessFeatureEnabled, setBusinessFeatureEnabledState] = useState<boolean>(() => {
    const explicit = localStorage.getItem('business_feature_enabled');
    if (explicit !== null) return explicit === 'true';
    // Migration: previously `business_mode_enabled === 'true'` meant feature was on
    return localStorage.getItem('business_mode_enabled') === 'true';
  });
  // Always start each session in Personal view (default) for safety.
  // The last active business profile id is preserved separately so the
  // BusinessProfileSwitcher can show it and one click returns to business view.
  const [businessModeEnabled, setBusinessModeEnabledState] = useState<boolean>(() => {
    localStorage.setItem('business_mode_enabled', 'false');
    return false;
  });
  const [activeBusinessProfileId, setActiveBusinessProfileIdState] = useState<string | null>(
    () => localStorage.getItem('active_business_profile_id')
  );
  const [onboardingCompleted, setOnboardingCompletedState] = useState<boolean>(
    () => localStorage.getItem('onboarding_completed') === 'true'
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

      // If localStorage already says onboarding is done, trust it and finish
      if (localStorage.getItem('onboarding_completed') === 'true') {
        setOnboardingCompletedState(true);
        setAppStateReady(true);
        return;
      }

      // Otherwise, check backend profile to determine onboarding status
      try {
        const { data: profile } = await supabase
          .from('profiles')
          .select('display_name')
          .eq('user_id', session.user.id)
          .maybeSingle();

        // Also check if user has any payment sources (indicates completed onboarding)
        const { count } = await supabase
          .from('custom_payment_sources')
          .select('id', { count: 'exact', head: true })
          .eq('user_id', session.user.id);

        const hasProfile = !!profile?.display_name?.trim();
        const hasSources = (count ?? 0) > 0;

        if (hasProfile && hasSources) {
          // Existing user — mark onboarding as completed
          localStorage.setItem('onboarding_completed', 'true');
          localStorage.setItem('user_display_name', profile!.display_name!);
          setOnboardingCompletedState(true);
          setDisplayNameState(profile!.display_name!);
        } else if (hasProfile && !hasSources) {
          // Has profile but no sources — still mark as completed (they may have skipped)
          localStorage.setItem('onboarding_completed', 'true');
          localStorage.setItem('user_display_name', profile!.display_name!);
          setOnboardingCompletedState(true);
          setDisplayNameState(profile!.display_name!);
        }
        // else: truly new user, onboardingCompleted stays false
      } catch (e) {
        console.error('Failed to resolve onboarding state:', e);
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

  const setBusinessModeEnabled = useCallback((enabled: boolean) => {
    setBusinessModeEnabledState(enabled);
    localStorage.setItem('business_mode_enabled', enabled.toString());
    // Note: we intentionally KEEP active_business_profile_id when disabling business mode,
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
    businessModeEnabled,
    setBusinessModeEnabled,
    activeBusinessProfileId,
    setActiveBusinessProfileId,
    onboardingCompleted,
    setOnboardingCompleted,
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
    businessModeEnabled, setBusinessModeEnabled,
    activeBusinessProfileId, setActiveBusinessProfileId,
    onboardingCompleted, setOnboardingCompleted,
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
