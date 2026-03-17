export interface ProjectCollaborator {
  id: string;
  project_id: string;
  first_name: string;
  last_name: string;
  company_name?: string | null;
  service_description: string;
  total_price: number;
  milestone_id?: string | null;
  status: string;
  contact_info?: string | null;
  note?: string | null;
  created_at?: string;
  updated_at?: string;
}

export type ProjectCollaboratorInput = Omit<ProjectCollaborator, 'id' | 'created_at' | 'updated_at' | 'project_id'>;
