export type BudgetPeriodType = 'monthly' | 'yearly' | 'custom';
export type BudgetMemberRole = string; // Flexible to match Supabase text type

export interface BudgetPlan {
  id: string;
  user_id: string;
  name: string;
  description?: string | null;
  icon?: string | null;
  color?: string | null;
  period_type: BudgetPeriodType;
  start_date?: string | null;
  end_date?: string | null;
  is_active: boolean;
  created_at?: string;
  updated_at?: string;
}

export interface BudgetPlanWithOwnership extends BudgetPlan {
  isOwner: boolean;
  role: BudgetMemberRole;
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
}

export interface SavingsGoal {
  id: string;
  budget_id: string;
  name: string;
  description?: string | null;
  icon?: string | null;
  color?: string | null;
  target_amount: number;
  current_amount: number;
  target_date?: string | null;
  is_completed: boolean;
  completed_at?: string | null;
  created_at?: string;
  updated_at?: string;
}

export interface BudgetMember {
  id: string;
  budget_id: string;
  user_id: string;
  role: BudgetMemberRole;
  joined_at?: string;
  created_at?: string;
  display_name?: string;
}

export interface BudgetInvitation {
  id: string;
  budget_id: string;
  email: string;
  role: BudgetMemberRole;
  token: string;
  invited_by: string;
  status: string;
  expires_at: string;
  created_at?: string;
}

export const DEFAULT_BUDGET_COLORS = [
  '#3b82f6', // blue
  '#22c55e', // green
  '#8b5cf6', // violet
  '#f59e0b', // amber
  '#ec4899', // pink
  '#06b6d4', // cyan
  '#ef4444', // red
  '#84cc16', // lime
];

export const DEFAULT_BUDGET_ICONS = [
  '💰', '📊', '🎯', '💵', '💼', '🏦', '📈', '🎨', '💡', '⚙️', '🔧', '📦'
];

export const PERIOD_TYPE_LABELS: Record<BudgetPeriodType, string> = {
  monthly: 'Mjesečni',
  yearly: 'Godišnji',
  custom: 'Prilagođeni'
};

export const BUDGET_ROLE_LABELS: Record<BudgetMemberRole, string> = {
  owner: 'Vlasnik',
  member: 'Član',
  viewer: 'Promatrač'
};
