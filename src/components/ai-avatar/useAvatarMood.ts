import { useState, useCallback, useEffect } from 'react';

export type AvatarMood = 'happy' | 'thinking' | 'worried' | 'proud' | 'neutral';

export const useAvatarMood = () => {
  const [mood, setMood] = useState<AvatarMood>('neutral');
  const [tooltipMessage, setTooltipMessage] = useState<string | null>(null);
  const [showTooltip, setShowTooltip] = useState(false);

  const showMood = useCallback((newMood: AvatarMood, message?: string, duration = 3000) => {
    setMood(newMood);
    if (message) {
      setTooltipMessage(message);
      setShowTooltip(true);
      setTimeout(() => {
        setShowTooltip(false);
        setTimeout(() => setMood('neutral'), 500);
      }, duration);
    } else {
      setTimeout(() => setMood('neutral'), duration);
    }
  }, []);

  // Listen for app events
  useEffect(() => {
    const handleIncomeAdded = () => {
      showMood('happy', 'Super! Novi prihod zabilježen! 💰');
    };

    const handleExpenseAdded = (e: CustomEvent) => {
      const { budgetExceeded } = e.detail || {};
      if (budgetExceeded) {
        showMood('worried', 'Pazi, približavaš se limitu budžeta.');
      } else {
        showMood('neutral');
      }
    };

    const handleBudgetExceeded = () => {
      showMood('worried', 'Budžet je prekoračen. Razmisli o prioritetima.');
    };

    const handleSavingsGoalReached = () => {
      showMood('proud', 'Čestitam! Cilj štednje je postignut! 🎉');
    };

    const handleAnalyzing = () => {
      showMood('thinking', 'Analiziram tvoje podatke...');
    };

    window.addEventListener('incomeAdded', handleIncomeAdded);
    window.addEventListener('expenseAdded', handleExpenseAdded as EventListener);
    window.addEventListener('budgetExceeded', handleBudgetExceeded);
    window.addEventListener('savingsGoalReached', handleSavingsGoalReached);
    window.addEventListener('aiAnalyzing', handleAnalyzing);

    return () => {
      window.removeEventListener('incomeAdded', handleIncomeAdded);
      window.removeEventListener('expenseAdded', handleExpenseAdded as EventListener);
      window.removeEventListener('budgetExceeded', handleBudgetExceeded);
      window.removeEventListener('savingsGoalReached', handleSavingsGoalReached);
      window.removeEventListener('aiAnalyzing', handleAnalyzing);
    };
  }, [showMood]);

  return { mood, showTooltip, tooltipMessage, showMood };
};
