import { useMemo } from 'react';
import { getCategoryInfo } from '@/types/expense';
import { CustomCategory } from '@/types/customCategory';

export interface ResolvedCategory {
  id: string;
  name: string;
  icon: string;
  color: string;
  isCustom: boolean;
}

/**
 * Resolves a category ID to its info, checking custom categories first.
 * Works for both system categories and user-created custom categories.
 */
export const resolveCategory = (
  categoryId: string,
  customCategories: CustomCategory[]
): ResolvedCategory => {
  const custom = customCategories.find(c => c.id === categoryId || c.name === categoryId);
  if (custom) {
    return { id: custom.id, name: custom.name, icon: custom.icon, color: custom.color, isCustom: true };
  }
  return { ...getCategoryInfo(categoryId as any), isCustom: false };
};

/**
 * Returns the correct background color style for a category icon.
 */
export const getCategoryBgStyle = (category: ResolvedCategory): string => {
  if (category.isCustom) {
    return `${category.color}20`;
  }
  return `hsl(var(--${category.color}) / 0.15)`;
};
