export type WorkLogDayType = 'work' | 'weekend' | 'vacation' | 'sick' | 'holiday';

export interface ProjectWorkLog {
  id: string;
  project_id: string;
  milestone_id?: string | null;
  user_id: string;
  log_date: string; // ISO date (YYYY-MM-DD)
  weather?: string | null;
  summary: string;
  notes?: string | null;
  hours?: number | null;
  day_type: WorkLogDayType;
  clock_in_time?: string | null;
  clock_out_time?: string | null;
  created_at: string;
  updated_at: string;
  // Enriched
  user_name?: string;
  milestone_name?: string;
}

export type ProjectWorkLogInput = Omit<
  ProjectWorkLog,
  'id' | 'project_id' | 'created_at' | 'updated_at' | 'user_id' | 'user_name' | 'milestone_name'
>;

/** Hours summary per worker for a given log day */
export interface WorkLogHoursSummary {
  worker_id: string;
  worker_name: string;
  actual_hours: number;
}
