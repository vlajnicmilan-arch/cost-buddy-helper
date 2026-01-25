export type ProjectRole = 'manager' | 'member' | 'viewer';
export type ProjectStatus = 'draft' | 'active' | 'paused' | 'completed' | 'cancelled';
export type MilestoneStatus = 'pending' | 'in_progress' | 'completed' | 'overdue';

export interface Project {
  id: string;
  user_id: string;
  name: string;
  description?: string | null;
  icon?: string | null;
  color?: string | null;
  status: ProjectStatus;
  total_budget: number;
  start_date?: string | null;
  end_date?: string | null;
  created_at?: string;
  updated_at?: string;
}

export interface ProjectWithOwnership extends Project {
  isOwner: boolean;
  role: ProjectRole;
}

export interface ProjectMember {
  id: string;
  project_id: string;
  user_id: string;
  role: ProjectRole;
  joined_at?: string;
  created_at?: string;
  display_name?: string;
}

export interface ProjectMilestone {
  id: string;
  project_id: string;
  name: string;
  description?: string | null;
  budget: number;
  status: MilestoneStatus;
  start_date?: string | null;
  due_date?: string | null;
  completed_at?: string | null;
  sort_order: number;
  created_at?: string;
  updated_at?: string;
  // Computed
  spent?: number;
}

export interface ProjectFunding {
  id: string;
  project_id: string;
  income_source_id: string;
  allocated_amount: number;
  percentage?: number | null;
  created_at?: string;
  updated_at?: string;
  // Joined data
  income_source_name?: string;
  income_source_icon?: string;
  income_source_color?: string;
}

export interface ProjectInvitation {
  id: string;
  project_id: string;
  email: string;
  role: ProjectRole;
  token: string;
  invited_by: string;
  status: string;
  expires_at: string;
  created_at?: string;
}

export const DEFAULT_PROJECT_COLORS = [
  '#3b82f6', // blue
  '#22c55e', // green
  '#8b5cf6', // violet
  '#f59e0b', // amber
  '#ec4899', // pink
  '#06b6d4', // cyan
  '#ef4444', // red
  '#84cc16', // lime
];

export const DEFAULT_PROJECT_ICONS = [
  '📁', '📊', '🎯', '🏗️', '💼', '🚀', '📈', '🎨', '💡', '⚙️', '🔧', '📦'
];

export const PROJECT_STATUS_LABELS: Record<ProjectStatus, string> = {
  draft: 'Nacrt',
  active: 'Aktivan',
  paused: 'Pauziran',
  completed: 'Završen',
  cancelled: 'Otkazan'
};

export const MILESTONE_STATUS_LABELS: Record<MilestoneStatus, string> = {
  pending: 'Na čekanju',
  in_progress: 'U tijeku',
  completed: 'Završeno',
  overdue: 'Zakašnjelo'
};

export const PROJECT_ROLE_LABELS: Record<ProjectRole, string> = {
  manager: 'Manager',
  member: 'Član',
  viewer: 'Promatrač'
};
