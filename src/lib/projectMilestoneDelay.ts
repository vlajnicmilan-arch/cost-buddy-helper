import { differenceInCalendarDays, startOfDay } from 'date-fns';
import type { ProjectMilestone } from '@/types/project';

export type MilestoneDelayStatus =
  | 'on_time'
  | 'late'
  | 'early'
  | 'in_progress_late'
  | 'pending_late'
  | 'unknown';

export interface MilestoneDelayInfo {
  status: MilestoneDelayStatus;
  /** Apsolutni broj dana (>=0). 0 = točno u roku. */
  days: number;
}

/**
 * Determinira kašnjenje faze prema dostupnim datumima.
 *
 * Pravila:
 * - Završena faza: usporedi actual_end_date (fallback completed_at) vs due_date
 *     → late ako je nakon, early ako je prije, on_time ako isti dan.
 * - Faza u tijeku (in_progress) s prošlim rokom: in_progress_late.
 * - Pending faza s prošlim start_date: pending_late.
 * - Inače: unknown (nije moguće odrediti).
 *
 * "Today" se može prosljediti zbog testabilnosti.
 */
export function getMilestoneDelay(
  m: Pick<
    ProjectMilestone,
    'status' | 'due_date' | 'start_date' | 'completed_at'
  > & { actual_end_date?: string | null; actual_start_date?: string | null },
  today: Date = new Date()
): MilestoneDelayInfo {
  const today0 = startOfDay(today);

  if (m.status === 'completed') {
    const endRaw = m.actual_end_date || m.completed_at;
    if (!endRaw || !m.due_date) return { status: 'unknown', days: 0 };
    const end = startOfDay(new Date(endRaw));
    const due = startOfDay(new Date(m.due_date));
    const diff = differenceInCalendarDays(end, due);
    if (diff > 0) return { status: 'late', days: diff };
    if (diff < 0) return { status: 'early', days: Math.abs(diff) };
    return { status: 'on_time', days: 0 };
  }

  if (m.status === 'in_progress') {
    if (!m.due_date) return { status: 'unknown', days: 0 };
    const due = startOfDay(new Date(m.due_date));
    const diff = differenceInCalendarDays(today0, due);
    if (diff > 0) return { status: 'in_progress_late', days: diff };
    return { status: 'on_time', days: 0 };
  }

  // pending / overdue (legacy status)
  if (m.status === 'pending' || m.status === 'overdue') {
    if (m.due_date) {
      const due = startOfDay(new Date(m.due_date));
      const diff = differenceInCalendarDays(today0, due);
      if (diff > 0) return { status: 'pending_late', days: diff };
    } else if (m.start_date) {
      const s = startOfDay(new Date(m.start_date));
      const diff = differenceInCalendarDays(today0, s);
      if (diff > 0) return { status: 'pending_late', days: diff };
    }
    return { status: 'unknown', days: 0 };
  }

  return { status: 'unknown', days: 0 };
}
