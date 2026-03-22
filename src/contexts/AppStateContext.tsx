import { createContext, useContext, useState, useCallback, useRef, useEffect, ReactNode } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { CustomPaymentSource } from '@/types/customPaymentSource';

// ─── Avatar Mood ────────────────────────────────────────────────────────────
export type AvatarMood = 'happy' | 'thinking' | 'worried' | 'proud' | 'neutral';

type AvatarEventHandler = (mood: AvatarMood, message?: string) => void;
type FinancialResetHandler = () => void;
type PaymentSourcesHandler = (sources: CustomPaymentSource[]) => void;

interface AppStateContextValue {
  // Display name
  displayName: string;
  setDisplayName: (name: string) => void;

  // AI assistant toggle
  aiAssistantEnabled: boolean;
  setAiAssistantEnabled: (enabled: boolean) => void;

  // Simple mode toggle
  simpleModeEnabled: boolean;
  setSimpleModeEnabled: (enabled: boolean) => void;

  // Family mode toggle
  familyModeEnabled: boolean;
  setFamilyModeEnabled: (enabled: boolean) => void;

  // Business mode toggle
  businessModeEnabled: boolean;
  setBusinessModeEnabled: (enabled: boolean) => void;

  // Active business profile
  activeBusinessProfileId: string | null;
  setActiveBusinessProfileId: (id: string | null) => void;

  // Onboarding
  onboardingCompleted: boolean;
  setOnboardingCompleted: (completed: boolean) => void;

  // Avatar mood events (pub/sub via callbacks)
  onAvatarEvent: (handler: AvatarEventHandler) => () => void;
  emitAvatarEvent: (mood: AvatarMood, message?: string) => void;

  // Financial data reset
  onFinancialReset: (handler: FinancialResetHandler) => () => void;
  emitFinancialReset: () => void;

  // Payment sources reorder sync
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
  const [businessModeEnabled, setBusinessModeEnabledState] = useState<boolean>(
    () => localStorage.getItem('business_mode_enabled') === 'true'
  );
  const [activeBusinessProfileId, setActiveBusinessProfileIdState] = useState<string | null>(
    () => localStorage.getItem('active_business_profile_id') || null
  );
  const [onboardingCompleted, setOnboardingCompletedState] = useState<boolean>(
    () => localStorage.getItem('onboarding_completed') === 'true'
  );

  // Subscriber registries using refs to avoid stale closures
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
    if (!enabled) {
      setActiveBusinessProfileIdState(null);
      localStorage.removeItem('active_business_profile_id');
    }
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

  // Avatar pub/sub
  const onAvatarEvent = useCallback((handler: AvatarEventHandler) => {
    avatarHandlers.current.add(handler);
    return () => { avatarHandlers.current.delete(handler); };
  }, []);

  const emitAvatarEvent = useCallback((mood: AvatarMood, message?: string) => {
    avatarHandlers.current.forEach(h => h(mood, message));
  }, []);

  // Financial reset pub/sub
  const onFinancialReset = useCallback((handler: FinancialResetHandler) => {
    resetHandlers.current.add(handler);
    return () => { resetHandlers.current.delete(handler); };
  }, []);

  const emitFinancialReset = useCallback(() => {
    resetHandlers.current.forEach(h => h());
  }, []);

  // Payment sources reorder pub/sub
  const onPaymentSourcesReordered = useCallback((handler: PaymentSourcesHandler) => {
    paymentHandlers.current.add(handler);
    return () => { paymentHandlers.current.delete(handler); };
  }, []);

  const emitPaymentSourcesReordered = useCallback((sources: CustomPaymentSource[]) => {
    paymentHandlers.current.forEach(h => h(sources));
  }, []);

  return (
    <AppStateContext.Provider value={{
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
      onAvatarEvent,
      emitAvatarEvent,
      onFinancialReset,
      emitFinancialReset,
      onPaymentSourcesReordered,
      emitPaymentSourcesReordered,
    }}>
      {children}
    </AppStateContext.Provider>
  );
};

export const useAppState = () => {
  const ctx = useContext(AppStateContext);
  if (!ctx) throw new Error('useAppState must be used within AppStateProvider');
  return ctx;
};
