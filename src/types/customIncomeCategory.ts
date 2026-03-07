export interface CustomIncomeCategory {
  id: string;
  user_id: string;
  name: string;
  icon: string;
  color: string;
  created_at: string;
  updated_at: string;
}

export const DEFAULT_INCOME_CATEGORY_ICONS = [
  '💰', '💵', '💳', '🏦', '💼', '📈', '🎁', '🏠',
  '🚗', '💻', '📱', '🛒', '📦', '✨', '🎯', '⭐',
  '🤝', '📊', '🏆', '💎', '🎖️', '📋', '🧾', '💸',
  '🪙', '🏢', '🎪', '📡', '🔗', '🌐', '🛠️', '📣'
];

export const DEFAULT_INCOME_CATEGORY_COLORS = [
  '#22c55e', '#10b981', '#14b8a6', '#06b6d4', 
  '#0ea5e9', '#3b82f6', '#6366f1', '#8b5cf6',
  '#a855f7', '#d946ef', '#ec4899', '#f43f5e',
  '#ef4444', '#f97316', '#f59e0b', '#eab308'
];
