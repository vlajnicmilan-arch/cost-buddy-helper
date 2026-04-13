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
  // Legal breakdown columns (NN 55/2024)
  regular_hours: number;
  overtime_hours: number;
  night_hours: number;
  sunday_hours: number;
  holiday_hours: number;
  standby_hours: number;
  field_hours: number;
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

// Smart auto-fill: distribute total hours into legal categories
const REGULAR_HOURS_MAX = 8;
const DEFAULT_BREAK_MINUTES = 30;

export interface HoursBreakdown {
  regular_hours: number;
  overtime_hours: number;
  night_hours: number;
  sunday_hours: number;
  holiday_hours: number;
  standby_hours: number;
  field_hours: number;
  break_minutes: number;
  net_hours: number;
}

export function distributeHours(
  totalHours: number,
  entryType: EntryType = 'regular',
  workDate?: Date
): HoursBreakdown {
  const breakMinutes = totalHours >= 6 ? DEFAULT_BREAK_MINUTES : 0;
  const netHours = Math.round(totalHours * 100) / 100;
  
  let regular = 0;
  let overtime = 0;
  let night = 0;
  let sunday = 0;
  let holiday = 0;
  let standby = 0;
  let field = 0;

  // Determine day of week (0=Sunday)
  const dayOfWeek = workDate ? workDate.getDay() : 1; // default to Monday
  const isSunday = dayOfWeek === 0;
  
  // TODO: Croatian holidays can be added later via a holidays list
  const isHoliday = false;

  if (entryType === 'night') {
    night = netHours;
  } else if (entryType === 'standby') {
    standby = netHours;
  } else if (entryType === 'field') {
    field = netHours;
  } else if (isSunday) {
    sunday = Math.min(netHours, REGULAR_HOURS_MAX);
    overtime = Math.max(0, netHours - REGULAR_HOURS_MAX);
  } else if (isHoliday) {
    holiday = Math.min(netHours, REGULAR_HOURS_MAX);
    overtime = Math.max(0, netHours - REGULAR_HOURS_MAX);
  } else {
    // Regular workday
    regular = Math.min(netHours, REGULAR_HOURS_MAX);
    overtime = Math.max(0, netHours - REGULAR_HOURS_MAX);
  }

  return {
    regular_hours: Math.round(regular * 100) / 100,
    overtime_hours: Math.round(overtime * 100) / 100,
    night_hours: Math.round(night * 100) / 100,
    sunday_hours: Math.round(sunday * 100) / 100,
    holiday_hours: Math.round(holiday * 100) / 100,
    standby_hours: Math.round(standby * 100) / 100,
    field_hours: Math.round(field * 100) / 100,
    break_minutes: breakMinutes,
    net_hours: netHours
  };
}
