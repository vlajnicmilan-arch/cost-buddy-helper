export const ENTRY_TYPES = [
  'regular', 'overtime', 'night', 'sunday', 'holiday', 'standby', 'field'
] as const;

export const ABSENCE_TYPES = [
  'annual_leave', 'sick_employer', 'sick_hzzo', 'paid_leave',
  'unpaid_leave', 'parental', 'pregnancy_complication', 'work_stoppage'
] as const;

export type EntryType = typeof ENTRY_TYPES[number];
export type AbsenceType = typeof ABSENCE_TYPES[number];
export type TimeClockStatus = 'active' | 'completed' | 'corrected';

export interface TimeClockEntry {
  id: string;
  worker_id: string;
  project_id: string;
  user_id: string;
  recorded_by: string;
  work_date: string;
  clock_in: string | null;
  clock_out: string | null;
  break_start: string | null;
  break_end: string | null;
  break_minutes: number;
  net_hours: number;
  entry_type: EntryType;
  absence_type: AbsenceType | null;
  note: string | null;
  location_coords: string | null;
  status: TimeClockStatus;
  created_at: string;
  updated_at: string;
}

export type TimeClockEntryInput = Omit<TimeClockEntry, 'id' | 'created_at' | 'updated_at'>;

// Worker status derived from today's entries
export type WorkerClockStatus = 'not_arrived' | 'working' | 'on_break' | 'finished' | 'absent';

export interface WorkerDayStatus {
  workerId: string;
  workerName: string;
  status: WorkerClockStatus;
  entry: TimeClockEntry | null;
  clockInTime: string | null;
  totalHours: number;
}
