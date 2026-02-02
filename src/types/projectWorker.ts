export interface ProjectWorker {
  id: string;
  project_id: string;
  first_name: string;
  last_name: string;
  position: string;
  work_hours: number;
  hourly_rate: number;
  created_at?: string;
  updated_at?: string;
}

export type ProjectWorkerInput = Omit<ProjectWorker, 'id' | 'created_at' | 'updated_at'>;
