export interface ProjectWorker {
  id: string;
  project_id: string;
  first_name: string;
  last_name: string;
  position: string;
  work_hours: number;
  hourly_rate: number;
  work_start_time?: string;
  work_end_time?: string;
  user_id?: string | null;
  created_at?: string;
  updated_at?: string;
}

export type ProjectWorkerInput = Omit<ProjectWorker, 'id' | 'created_at' | 'updated_at'>;

export interface ProjectWorkEntry {
  id: string;
  worker_id: string;
  project_id: string;
  work_date: string;
  scheduled_hours: number;
  actual_hours: number;
  milestone_ids?: string[] | null;
  note?: string | null;
  created_at?: string;
  updated_at?: string;
}

export type ProjectWorkEntryInput = Omit<ProjectWorkEntry, 'id' | 'created_at' | 'updated_at'>;
