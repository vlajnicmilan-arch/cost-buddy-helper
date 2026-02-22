export type FamilyRole = 'owner' | 'member' | 'viewer';

export interface FamilyGroup {
  id: string;
  user_id: string;
  name: string;
  icon: string;
  color: string;
  created_at: string;
  updated_at: string;
}

export interface FamilyMember {
  id: string;
  group_id: string;
  user_id: string;
  role: FamilyRole;
  joined_at: string;
  created_at: string;
  display_name?: string;
}

export interface FamilyInvitation {
  id: string;
  group_id: string;
  token: string;
  invited_by: string;
  invited_user_id: string | null;
  role: FamilyRole;
  email: string;
  status: string;
  expires_at: string;
  used_at: string | null;
  created_at: string;
}

export interface FamilySharedSource {
  id: string;
  group_id: string;
  payment_source_id: string;
  added_by: string;
  created_at: string;
  source_name?: string;
  source_icon?: string;
  source_color?: string;
  source_balance?: number;
}

export interface FamilySharedBudget {
  id: string;
  group_id: string;
  budget_id: string;
  added_by: string;
  created_at: string;
  budget_name?: string;
  budget_icon?: string;
  budget_color?: string;
  budget_total?: number;
}

export interface FamilySharedProject {
  id: string;
  group_id: string;
  project_id: string;
  added_by: string;
  created_at: string;
  project_name?: string;
  project_icon?: string;
  project_color?: string;
  project_status?: string;
  project_total_budget?: number;
}

export interface FamilySharedSavings {
  id: string;
  group_id: string;
  savings_goal_id: string;
  added_by: string;
  created_at: string;
  goal_name?: string;
  goal_icon?: string;
  goal_color?: string;
  goal_target?: number;
  goal_current?: number;
  goal_completed?: boolean;
}

export const FAMILY_ROLE_LABELS: Record<FamilyRole, string> = {
  owner: 'Vlasnik',
  member: 'Član',
  viewer: 'Preglednik'
};

export const DEFAULT_FAMILY_ICONS = [
  '👨‍👩‍👧‍👦', '👨‍👩‍👧', '👨‍👩‍👦', '💑', '🏠', '👥', '❤️', '🏡'
];

export const DEFAULT_FAMILY_COLORS = [
  '#3b82f6', '#22c55e', '#8b5cf6', '#f59e0b', '#ec4899', '#06b6d4', '#ef4444', '#10b981'
];
