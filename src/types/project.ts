import type { ProjectType } from '@/lib/projectTypes';

/**
 * Project roles as stored in the database (`project_members.role`,
 * `project_invitations.role`). Owner is **not** included — owner is derived
 * runtime from `projects.user_id === auth.uid()`.
 *
 * For runtime contexts that need to express "owner OR member/viewer/worker",
 * use `ProjectRoleKey` below.
 */
export type ProjectRole = 'member' | 'viewer' | 'worker' | 'investor';

/**
 * Runtime-extended role key. Used by hooks/components that present the
 * current user's effective role (owner is virtual — never persisted).
 */
export type ProjectRoleKey = 'owner' | ProjectRole;

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
  /** Contracted value with the client (accrual basis). If null/0, total_budget is used as fallback. */
  contract_value?: number | null;
  start_date?: string | null;
  end_date?: string | null;
  business_profile_id?: string | null;
  archived_at?: string | null;
  /** Locked at creation. Drives default tab labels and template suggestions. Stored as string for forward-compat. */
  project_type?: ProjectType | string;
  /** Optional per-project tab label overrides (future-ready, currently unused). Stored as JSONB. */
  label_overrides?: ProjectLabelOverrides | unknown | null;
  created_at?: string;
  updated_at?: string;
}

export interface ProjectWithOwnership extends Project {
  isOwner: boolean;
  /** Runtime role — 'owner' for project owner, else DB role. */
  role: ProjectRoleKey;
  member_context?: 'personal' | 'business';
  member_business_profile_id?: string | null;
}

export interface ProjectMember {
  id: string;
  project_id: string;
  user_id: string;
  /**
   * Runtime role — owner row is synthesised by `useProjectMembers` with
   * role='owner'. Persisted rows only carry 'member' | 'viewer' | 'worker'.
   */
  role: ProjectRoleKey;
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
  actual_start_date?: string | null;
  actual_end_date?: string | null;
  sort_order: number;
  color?: string | null;
  depends_on_milestone_id?: string | null;
  reminder_days_before?: number;
  is_contingency?: boolean;
  /** True = ovo je VTR (Više traženih radova) — posebna vrsta faze koja automatski generira aneks ugovora. */
  is_vtr?: boolean;
  /**
   * Faza 7 — ako je faza automatski nastala iz odobrene odluke, ovdje je id te odluke.
   * ON DELETE SET NULL na razini baze.
   */
  source_decision_id?: string | null;
  /**
   * Faza 7 — snapshot "Prema investitoru" iznosa (konačna cijena odluke) u trenutku
   * odobrenja. ČISTO INFORMATIVNO — ne ulazi ni u jedan zbroj (budžet, marža, cashflow).
   */
  investor_price?: number | null;
  /**
   * Faza 7 — snapshot metapodataka izvorne odluke (join). Koristi se za badge
   * "Iz poništene odluke" (annulled_at) i navigaciju na detalj odluke.
   */
  source_decision?: {
    id: string;
    title: string | null;
    annulled_at: string | null;
  } | null;
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

/** Labels for selectable (DB) roles only — owner is rendered separately via Crown badge. */
export const PROJECT_ROLE_LABELS: Record<ProjectRole, string> = {
  member: 'Član',
  viewer: 'Promatrač',
  worker: 'Radnik',
  investor: 'Investitor'
};
