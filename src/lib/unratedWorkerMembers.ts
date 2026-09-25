/**
 * Pure rules for the "no hourly rate" warning on project members with role
 * 'worker'. A worker member without any project_workers row carrying their
 * user_id has work-log hours that sync_work_log_to_entry silently skips.
 */

export interface MemberLite {
  user_id: string;
  role: string;
}

export interface WorkLogLite {
  user_id: string;
  log_date: string;
  hours: number | null;
}

export interface UnratedPending {
  days: number;
  hours: number;
}

/** Returns userId → pending days/hours for worker members lacking a project_workers row. */
export function computeUnratedWorkerMembers(
  members: MemberLite[],
  linkedUserIds: Iterable<string>,
  logs: WorkLogLite[],
): Map<string, UnratedPending> {
  const linked = new Set(linkedUserIds);
  const result = new Map<string, UnratedPending>();
  for (const m of members) {
    if (m.role !== 'worker' || !m.user_id || linked.has(m.user_id)) continue;
    const dates = new Set<string>();
    let hours = 0;
    for (const l of logs) {
      // Mirrors sync_work_log_to_entry: only logs with hours become entries.
      if (l.user_id !== m.user_id || l.hours == null) continue;
      dates.add(l.log_date);
      hours += Number(l.hours);
    }
    result.set(m.user_id, { days: dates.size, hours: Number(hours.toFixed(2)) });
  }
  return result;
}

export interface IdentityRow {
  id: string;
  first_name: string;
  last_name: string;
}

export interface EngagementRow {
  worker_id: string | null;
  project_id: string;
  hourly_rate: number;
  created_at: string;
}

export interface WorkerPrefill {
  identityId: string | null;
  first_name: string;
  last_name: string;
  hourly_rate: number | null;
}

/** Suggests identity (from "Ljudi") and latest rate from another project. */
export function buildWorkerPrefill(
  identity: IdentityRow | null,
  engagements: EngagementRow[],
  currentProjectId: string,
): WorkerPrefill | null {
  if (!identity) return null;
  const latest = engagements
    .filter((e) => e.worker_id === identity.id && e.project_id !== currentProjectId)
    .sort((a, b) => b.created_at.localeCompare(a.created_at))[0];
  return {
    identityId: identity.id,
    first_name: identity.first_name,
    last_name: identity.last_name,
    hourly_rate: latest ? Number(latest.hourly_rate) : null,
  };
}
