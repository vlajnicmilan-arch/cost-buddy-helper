export interface IncomeSource {
  id: string;
  user_id: string;
  name: string;
  description?: string | null;
  icon: string;
  color: string;
  created_at?: string;
  updated_at?: string;
}

export const DEFAULT_INCOME_SOURCE_COLORS = [
  '#22c55e', // green
  '#3b82f6', // blue
  '#8b5cf6', // violet
  '#f59e0b', // amber
  '#ec4899', // pink
  '#06b6d4', // cyan
  '#ef4444', // red
  '#84cc16', // lime
];

export const DEFAULT_INCOME_SOURCE_ICONS = [
  '💼', '💰', '🏢', '👤', '📊', '🎯', '💵', '🏦', '💳', '📱', '🖥️', '🎨'
];
