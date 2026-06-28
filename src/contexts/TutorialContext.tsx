import React, { createContext, useContext, useState, useEffect, ReactNode, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { useAuth } from '@/hooks/useAuth';

export interface TutorialStep {
  id: string;
  targetSelector: string;
  titleKey: string;
  descriptionKey: string;
  position?: 'top' | 'bottom' | 'left' | 'right';
  action?: 'click' | 'hover' | 'none';
}

interface TutorialContextType {
  isActive: boolean;
  currentStep: number;
  steps: TutorialStep[];
  startTutorial: () => void;
  endTutorial: () => void;
  nextStep: () => void;
  prevStep: () => void;
  skipTutorial: () => void;
  hasCompletedTutorial: boolean;
  resetTutorial: () => void;
  getStepTitle: (step: TutorialStep) => string;
  getStepDescription: (step: TutorialStep) => string;
}

const TutorialContext = createContext<TutorialContextType | undefined>(undefined);

const TUTORIAL_STORAGE_KEY = 'app_tutorial_completed';
const TUTORIAL_SEEN_KEY = 'app_tutorial_seen';

const DEFAULT_STEPS: TutorialStep[] = [
  {
    id: 'welcome',
    targetSelector: '[data-tutorial="header"]',
    titleKey: 'tutorial.steps.welcome.title',
    descriptionKey: 'tutorial.steps.welcome.description',
    position: 'bottom',
  },
  {
    id: 'summary-cards',
    targetSelector: '[data-tutorial="summary-cards"]',
    titleKey: 'tutorial.steps.summaryCards.title',
    descriptionKey: 'tutorial.steps.summaryCards.description',
    position: 'bottom',
  },
  {
    id: 'add-transaction',
    targetSelector: '[data-tutorial="add-buttons"]',
    titleKey: 'tutorial.steps.addTransaction.title',
    descriptionKey: 'tutorial.steps.addTransaction.description',
    position: 'top',
  },
  {
    id: 'payment-sources',
    targetSelector: '[data-tutorial="payment-sources"]',
    titleKey: 'tutorial.steps.paymentSources.title',
    descriptionKey: 'tutorial.steps.paymentSources.description',
    position: 'top',
  },
  {
    id: 'transactions',
    targetSelector: '[data-tutorial="transactions"]',
    titleKey: 'tutorial.steps.transactions.title',
    descriptionKey: 'tutorial.steps.transactions.description',
    position: 'top',
  },
  {
    id: 'ai-assistant',
    targetSelector: '[data-tutorial="ai-assistant"]',
    titleKey: 'tutorial.steps.aiAssistant.title',
    descriptionKey: 'tutorial.steps.aiAssistant.description',
    position: 'top',
  },
];

export const TutorialProvider = ({ children }: { children: ReactNode }) => {
  const { t } = useTranslation();
  const [isActive, setIsActive] = useState(false);
  const [currentStep, setCurrentStep] = useState(0);
  const [steps] = useState<TutorialStep[]>(DEFAULT_STEPS);
  const [hasCompletedTutorial, setHasCompletedTutorial] = useState(() => 
    localStorage.getItem(TUTORIAL_STORAGE_KEY) === 'true'
  );

  const getStepTitle = useCallback((step: TutorialStep) => {
    return t(step.titleKey);
  }, [t]);

  const getStepDescription = useCallback((step: TutorialStep) => {
    return t(step.descriptionKey);
  }, [t]);

  const { user } = useAuth();

  // Auto-start tutorial only AFTER the user has exited the guided onboarding
  // phase (>= GUIDED_EXPENSE_THRESHOLD events). Source of truth is the
  // localStorage cache key `guided_home_exited_at:<uid>` written by
  // `useGuidedMode` when the server-side RPC `mark_guided_home_exited` runs.
  // No retroactive auto-start for existing users without the cache key —
  // they can launch the tutorial manually from Settings via `startTutorial`.
  useEffect(() => {
    if (!user?.id) return;
    const tutorialSeen = localStorage.getItem(TUTORIAL_SEEN_KEY);
    if (tutorialSeen) return;
    const onboardingCompleted = localStorage.getItem('onboarding_completed') === 'true';
    if (!onboardingCompleted) return;
    const guidedExitedAt = localStorage.getItem(`guided_home_exited_at:${user.id}`);
    if (!guidedExitedAt) return;

    const timer = setTimeout(() => {
      setIsActive(true);
      localStorage.setItem(TUTORIAL_SEEN_KEY, 'true');
    }, 4000);

    return () => clearTimeout(timer);
  }, [user?.id]);

  const startTutorial = useCallback(() => {
    setCurrentStep(0);
    setIsActive(true);
  }, []);

  const endTutorial = useCallback(() => {
    setIsActive(false);
    setCurrentStep(0);
    setHasCompletedTutorial(true);
    localStorage.setItem(TUTORIAL_STORAGE_KEY, 'true');
  }, []);

  const nextStep = useCallback(() => {
    if (currentStep < steps.length - 1) {
      setCurrentStep(prev => prev + 1);
    } else {
      endTutorial();
    }
  }, [currentStep, steps.length, endTutorial]);

  const prevStep = useCallback(() => {
    if (currentStep > 0) {
      setCurrentStep(prev => prev - 1);
    }
  }, [currentStep]);

  const skipTutorial = useCallback(() => {
    setIsActive(false);
    setCurrentStep(0);
    localStorage.setItem(TUTORIAL_STORAGE_KEY, 'true');
    setHasCompletedTutorial(true);
  }, []);

  const resetTutorial = useCallback(() => {
    localStorage.removeItem(TUTORIAL_STORAGE_KEY);
    localStorage.removeItem(TUTORIAL_SEEN_KEY);
    setHasCompletedTutorial(false);
    setCurrentStep(0);
  }, []);

  return (
    <TutorialContext.Provider value={{
      isActive,
      currentStep,
      steps,
      startTutorial,
      endTutorial,
      nextStep,
      prevStep,
      skipTutorial,
      hasCompletedTutorial,
      resetTutorial,
      getStepTitle,
      getStepDescription,
    }}>
      {children}
    </TutorialContext.Provider>
  );
};

export const useTutorial = () => {
  const context = useContext(TutorialContext);
  if (context === undefined) {
    throw new Error('useTutorial must be used within a TutorialProvider');
  }
  return context;
};
