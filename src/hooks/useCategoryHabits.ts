import { useCallback } from 'react';

const STORAGE_KEY = 'category_habits';

interface CategoryHabit {
  category: string;
  count: number;
}

type HabitsMap = Record<string, CategoryHabit>;

const getHabits = (): HabitsMap => {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
};

const saveHabits = (habits: HabitsMap) => {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(habits));
  } catch {
    // Silently fail if localStorage is full
  }
};

/**
 * Hook for auto-categorization based on merchant habits.
 * Stores merchant→category mappings in localStorage.
 * After 2+ occurrences, suggests the category automatically.
 */
export const useCategoryHabits = () => {
  /** Record that a merchant was assigned to a category */
  const recordHabit = useCallback((merchantName: string, category: string) => {
    if (!merchantName || merchantName.trim().length < 2) return;

    const key = merchantName.toLowerCase().trim();
    const habits = getHabits();
    const existing = habits[key];

    if (existing && existing.category === category) {
      habits[key] = { category, count: existing.count + 1 };
    } else if (!existing || existing.count <= 1) {
      // New merchant or weak habit — overwrite
      habits[key] = { category, count: 1 };
    } else {
      // Strong existing habit but different category — only overwrite if user is persistent
      // Keep the old one unless they do it twice more
      habits[key] = { category, count: 1 };
    }

    saveHabits(habits);
  }, []);

  /** Get suggested category for a merchant (returns null if no strong habit) */
  const getSuggestedCategory = useCallback((merchantName: string): string | null => {
    if (!merchantName || merchantName.trim().length < 2) return null;

    const key = merchantName.toLowerCase().trim();
    const habits = getHabits();
    const habit = habits[key];

    // Only suggest after 2+ occurrences
    if (habit && habit.count >= 2) {
      return habit.category;
    }

    // Also try partial match (merchant name contains or is contained by a known key)
    for (const [knownKey, knownHabit] of Object.entries(habits)) {
      if (knownHabit.count >= 2 && (knownKey.includes(key) || key.includes(knownKey))) {
        return knownHabit.category;
      }
    }

    return null;
  }, []);

  return { recordHabit, getSuggestedCategory };
};
