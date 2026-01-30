import React, { createContext, useContext, useState, useEffect, ReactNode, useCallback } from 'react';

export interface TutorialStep {
  id: string;
  targetSelector: string;
  title: string;
  description: string;
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
}

const TutorialContext = createContext<TutorialContextType | undefined>(undefined);

const TUTORIAL_STORAGE_KEY = 'app_tutorial_completed';
const TUTORIAL_SEEN_KEY = 'app_tutorial_seen';

const DEFAULT_STEPS: TutorialStep[] = [
  {
    id: 'welcome',
    targetSelector: '[data-tutorial="header"]',
    title: 'Dobrodošli u V&M Balance! 👋',
    description: 'Ovaj kratki vodič će vam pokazati ključne funkcionalnosti aplikacije. Krenimo!',
    position: 'bottom',
  },
  {
    id: 'summary-cards',
    targetSelector: '[data-tutorial="summary-cards"]',
    title: 'Financijski pregled 📊',
    description: 'Ovdje vidite ukupne prihode, rashode i vaš trenutni balans. Kliknite na kartice za detalje.',
    position: 'bottom',
  },
  {
    id: 'add-transaction',
    targetSelector: '[data-tutorial="add-buttons"]',
    title: 'Dodajte transakcije ➕',
    description: 'Koristite ove gumbe za brzo dodavanje prihoda, rashoda ili prijenosa između računa.',
    position: 'top',
  },
  {
    id: 'payment-sources',
    targetSelector: '[data-tutorial="payment-sources"]',
    title: 'Izvori plaćanja 💳',
    description: 'Upravljajte svojim bankovnim računima, karticama i gotovinom. Pratite stanje na svakom izvoru.',
    position: 'top',
  },
  {
    id: 'transactions',
    targetSelector: '[data-tutorial="transactions"]',
    title: 'Popis transakcija 📋',
    description: 'Sve vaše transakcije na jednom mjestu. Koristite filtere za lakše pretraživanje i označite više transakcija za grupno uređivanje.',
    position: 'top',
  },
  {
    id: 'ai-assistant',
    targetSelector: '[data-tutorial="ai-assistant"]',
    title: 'AI financijski asistent 🤖',
    description: 'Vaš osobni financijski savjetnik! Postavite pitanja o potrošnji, dobijte savjete za uštedu i analizirajte svoje financije.',
    position: 'top',
  },
];

export const TutorialProvider = ({ children }: { children: ReactNode }) => {
  const [isActive, setIsActive] = useState(false);
  const [currentStep, setCurrentStep] = useState(0);
  const [steps] = useState<TutorialStep[]>(DEFAULT_STEPS);
  const [hasCompletedTutorial, setHasCompletedTutorial] = useState(() => 
    localStorage.getItem(TUTORIAL_STORAGE_KEY) === 'true'
  );

  // Auto-start tutorial for new users (after onboarding)
  useEffect(() => {
    const tutorialSeen = localStorage.getItem(TUTORIAL_SEEN_KEY);
    const onboardingCompleted = localStorage.getItem('onboarding_completed') === 'true';
    const showWelcome = localStorage.getItem('show_welcome_animation') === 'true';
    
    // Start tutorial after welcome animation for new users
    if (onboardingCompleted && showWelcome && !tutorialSeen) {
      // Delay to let welcome animation play first
      const timer = setTimeout(() => {
        setIsActive(true);
        localStorage.setItem(TUTORIAL_SEEN_KEY, 'true');
      }, 4000);
      
      return () => clearTimeout(timer);
    }
  }, []);

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
