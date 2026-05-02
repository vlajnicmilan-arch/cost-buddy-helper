import type { ProjectType } from '@/lib/projectTypes';

export type ProjectRole = 'manager' | 'member' | 'viewer' | 'worker';
export type ProjectStatus = 'draft' | 'active' | 'paused' | 'completed' | 'cancelled';
export type MilestoneStatus = 'pending' | 'in_progress' | 'completed' | 'overdue';

/** Per-project tab label overrides. Reserved for future "Customize project" UI. */
export type ProjectLabelOverrides = Partial<Record<
  'milestones' | 'workers' | 'collaborators' | 'documents' | 'members',
  string
>>;

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
  business_profile_id?: string | null;
  archived_at?: string | null;
  /** Locked at creation. Drives default tab labels and template suggestions. Stored as string for forward-compat. */
  project_type?: ProjectType | string;
  /** Optional per-project tab label overrides (future-ready, currently unused). */
  label_overrides?: ProjectLabelOverrides | null;
  created_at?: string;
  updated_at?: string;
}

export interface ProjectWithOwnership extends Project {
  isOwner: boolean;
  role: ProjectRole;
  member_context?: 'personal' | 'business';
  member_business_profile_id?: string | null;
}

export interface ProjectMember {
  id: string;
  project_id: string;
  user_id: string;
  role: ProjectRole;
  joined_at?: string;
  created_at?: string;
  display_name?: string;
  member_context?: 'personal' | 'business';
  member_business_profile_id?: string | null;
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
  color?: string | null;
  depends_on_milestone_id?: string | null;
  reminder_days_before?: number;
  is_contingency?: boolean;
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
  manager: 'Voditelj',
  member: 'Član',
  viewer: 'Promatrač',
  worker: 'Radnik'
};
