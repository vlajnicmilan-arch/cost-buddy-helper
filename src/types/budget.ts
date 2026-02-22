export type BudgetPeriod = 'one_time' | 'weekly' | 'biweekly' | 'monthly' | 'quarterly' | 'semi_annual' | 'yearly' | 'custom';
export type BudgetStatus = 'active' | 'paused' | 'completed';

export interface Budget {
  id: string;
  user_id: string;
  name: string;
  description?: string | null;
  icon?: string | null;
  color?: string | null;
  period_type: BudgetPeriod;
  total_amount: number;
  start_date?: string | null;
  end_date?: string | null;
  is_active: boolean;
  project_id?: string | null;
  created_at?: string;
  updated_at?: string;
}

export interface BudgetCategory {
  id: string;
  budget_id: string;
  category: string;
  limit_amount: number;
  icon?: string | null;
  color?: string | null;
  created_at?: string;
  updated_at?: string;
  // Computed
  spent?: number;
  percentage?: number;
}

export interface BudgetWithStats extends Budget {
  spent: number;
  remaining: number;
  percentage: number;
  categories: BudgetCategoryWithStats[];
  isOverBudget: boolean;
  isWarning: boolean; // 80%+
  daysRemaining?: number;
  dailyAverage?: number;
  trend?: 'up' | 'down' | 'stable';
}

export interface BudgetCategoryWithStats extends BudgetCategory {
  spent: number;
  remaining: number;
  percentage: number;
  isOverBudget: boolean;
  isWarning: boolean;
  // For manually assigned expenses - shows which original categories are included
  originalCategories?: string[];
}

export const BUDGET_PERIOD_LABELS: Record<BudgetPeriod, string> = {
  one_time: 'Jednokratni',
  weekly: 'Tjedni',
  biweekly: 'Dvotjedni',
  monthly: 'Mjesečni',
  quarterly: 'Tromjesečni',
  semi_annual: 'Šestomjesečni',
  yearly: 'Godišnji',
  custom: 'Prilagođeni'
};

export const DEFAULT_BUDGET_COLORS = [
  '#3b82f6', // blue
  '#22c55e', // green
  '#8b5cf6', // violet
  '#f59e0b', // amber
  '#ec4899', // pink
  '#06b6d4', // cyan
  '#ef4444', // red
  '#10b981', // emerald
];

export const DEFAULT_BUDGET_ICONS = [
  '💰', '📊', '🎯', '💵', '📈', '🏦', '💳', '🛒', '🏠', '🚗', '✈️', '🎓'
];
