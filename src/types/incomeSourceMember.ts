export type IncomeSourceRole = 'owner' | 'member';

export interface IncomeSourceMember {
  id: string;
  income_source_id: string;
  user_id: string;
  role: IncomeSourceRole;
  joined_at: string;
  created_at: string;
  // Joined from profiles
  display_name?: string | null;
  email?: string | null;
}

export interface IncomeSourceInvitation {
  id: string;
  income_source_id: string;
  email: string;
  invited_by: string;
  token: string;
  status: 'pending' | 'accepted' | 'expired';
  expires_at: string;
  created_at: string;
}
