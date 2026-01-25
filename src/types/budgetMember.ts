export type BudgetRole = 'owner' | 'member' | 'viewer';

export interface BudgetMember {
  id: string;
  budget_id: string;
  user_id: string;
  role: BudgetRole;
  joined_at: string;
  created_at: string;
  display_name?: string;
}

export interface BudgetInvitation {
  id: string;
  budget_id: string;
  email: string;
  token: string;
  status: string;
  role: BudgetRole;
  invited_by: string;
  expires_at: string;
  created_at: string;
}

export const BUDGET_ROLE_LABELS: Record<BudgetRole, string> = {
  owner: 'Vlasnik',
  member: 'Član',
  viewer: 'Gledatelj'
};
