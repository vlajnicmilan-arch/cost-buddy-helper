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
// Legacy globalni key — zadržan SAMO kao backward-compat anti-repeat čitanje
// (korisnici koji su ga prije imali ne smiju ponovno dobiti auto-tutorial).
// Novi upisi idu na per-user key kako isti browser s različitim računima ne bi
// dijelio "seen" status (Fix 4).
const TUTORIAL_SEEN_KEY_LEGACY = 'app_tutorial_seen';
const seenKeyFor = (uid: string) => `app_tutorial_seen:${uid}`;

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

  // Auto-start tutorial isključivo nakon potvrđene live guided ceremony-ja.
  // Trigger je `home-ready-for-tutorial` CustomEvent koji `PersonalModeView`
  // dispatcha SAMO ako je ovaj mount stvarno bio u guided fazi
  // (`guidedSessionActiveRef`). Time postojeći korisnik kojem se transakcije
  // async učitaju s 0 na ≥3 ne dobiva tutorial (Fix 1+4).
  //
  // Mount fallback iz prethodne iteracije je uklonjen. Per-user "seen" key
  // (`app_tutorial_seen:<uid>`) sprječava da isti browser s različitim
  // računima dijeli "seen" status. Legacy globalni key se i dalje čita kao
  // backward-compat tako da korisnici koji su tutorial već vidjeli ne dobiju
  // ponovno auto-start.
  useEffect(() => {
    if (!user?.id) return;
    let timer: ReturnType<typeof setTimeout> | null = null;

    const passesGate = () => {
      const seenPerUser = localStorage.getItem(seenKeyFor(user.id));
      if (seenPerUser) return false;
      const seenLegacy = localStorage.getItem(TUTORIAL_SEEN_KEY_LEGACY);
      if (seenLegacy) return false;
      const onboardingCompleted = localStorage.getItem('onboarding_completed') === 'true';
      if (!onboardingCompleted) return false;
      const guidedExitedAt = localStorage.getItem(`guided_home_exited_at:${user.id}`);
      if (!guidedExitedAt) return false;
      return true;
    };

    const scheduleStart = (delayMs: number) => {
      if (!passesGate()) return;
      if (timer) return;
      timer = setTimeout(() => {
        setIsActive(true);
        localStorage.setItem(seenKeyFor(user.id), 'true');
      }, delayMs);
    };

    const onHomeReady = () => scheduleStart(600);
    window.addEventListener('home-ready-for-tutorial', onHomeReady);

    return () => {
      window.removeEventListener('home-ready-for-tutorial', onHomeReady);
      if (timer) clearTimeout(timer);
    };
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
    localStorage.removeItem(TUTORIAL_SEEN_KEY_LEGACY);
    if (user?.id) localStorage.removeItem(seenKeyFor(user.id));
    setHasCompletedTutorial(false);
    setCurrentStep(0);
  }, [user?.id]);

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
