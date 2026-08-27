/**
 * Pure planning logic for "+ Osoba" on the top-level "Ljudi" list.
 *
 * One person (`public.workers`) can be created together with several
 * ENGAGEMENTS (`public.project_workers`) — one per selected project. Rate and
 * position live on the engagement, because the same person is often paid
 * differently on different sites.
 *
 * Hard boundaries:
 *  - access rights (`project_members.role`) are NOT part of this model,
 *  - collaborators (`project_collaborators`) are NOT part of this model.
 */

import { parseMoneyAllowZero } from '@/lib/money';

/** Free-text position suggestions offered in the form (job on site, not a role). */
export const POSITION_SUGGESTION_KEYS = ['worker', 'lead', 'craftsman', 'helper'] as const;

export interface PersonProjectSelection {
  projectId: string;
  /** Raw user input; empty means "rate not agreed yet". */
  hourlyRate: string;
  position: string;
}

export interface AddPersonFormState {
  firstName: string;
  lastName: string;
  selections: readonly PersonProjectSelection[];
}

export interface PlannedEngagement {
  projectId: string;
  /** Always a number; 0 when the rate was left blank. */
  hourlyRate: number;
  /** false when the rate was left blank — 0 means "not entered", not "agreed zero". */
  rateProvided: boolean;
  position: string;
}

export interface AddPersonPlan {
  valid: boolean;
  firstName: string;
  lastName: string;
  /** true when a new row in `workers` has to be inserted. */
  createsPerson: boolean;
  /** Set when the user confirmed this is an already known person. */
  existingWorkerId: string | null;
  engagements: PlannedEngagement[];
}

const EMPTY_PLAN: AddPersonPlan = {
  valid: false,
  firstName: '',
  lastName: '',
  createsPerson: false,
  existingWorkerId: null,
  engagements: [],
};

/**
 * Turn the form state into an explicit write plan. Never touches the database
 * and never merges identities on its own — the caller asks the user first.
 */
export function buildAddPersonPlan(
  form: AddPersonFormState,
  options: { existingWorkerId?: string | null } = {},
): AddPersonPlan {
  const firstName = (form.firstName ?? '').trim();
  const lastName = (form.lastName ?? '').trim();
  const existingWorkerId = options.existingWorkerId ?? null;

  const seen = new Set<string>();
  const engagements: PlannedEngagement[] = [];
  for (const s of form.selections ?? []) {
    const projectId = (s.projectId ?? '').trim();
    if (!projectId || seen.has(projectId)) continue;
    seen.add(projectId);
    const parsed = parseMoneyAllowZero(s.hourlyRate);
    const rateProvided = parsed.valid;
    engagements.push({
      projectId,
      hourlyRate: rateProvided ? parsed.value : 0,
      rateProvided,
      position: (s.position ?? '').trim(),
    });
  }

  if (!firstName || !lastName || engagements.length === 0) {
    return { ...EMPTY_PLAN, firstName, lastName, existingWorkerId, engagements };
  }

  return {
    valid: true,
    firstName,
    lastName,
    createsPerson: !existingWorkerId,
    existingWorkerId,
    engagements,
  };
}

/** Row payload for `project_workers`. Work hours stay at the existing default. */
export function engagementInsertPayload(
  plan: AddPersonPlan,
  engagement: PlannedEngagement,
  workerId: string,
) {
  return {
    project_id: engagement.projectId,
    worker_id: workerId,
    first_name: plan.firstName,
    last_name: plan.lastName,
    position: engagement.position,
    hourly_rate: engagement.hourlyRate,
    work_hours: 8,
    work_start_time: '08:00',
    work_end_time: '16:00',
  };
}

/**
 * Values a newly ticked project inherits from the first filled row, so the
 * common case (same rate everywhere) needs no retyping. Each row stays
 * individually editable.
 */
export function inheritedDefaults(
  selections: readonly PersonProjectSelection[],
): { hourlyRate: string; position: string } {
  const source =
    selections.find((s) => (s.hourlyRate ?? '').trim() !== '' || (s.position ?? '').trim() !== '') ?? null;
  return {
    hourlyRate: source?.hourlyRate ?? '',
    position: source?.position ?? '',
  };
}
