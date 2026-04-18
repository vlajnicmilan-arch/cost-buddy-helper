import { supabase } from '@/integrations/supabase/client';
import { ProjectTemplate, ProjectTemplateMilestone } from '@/hooks/useProjectTemplates';
import { addDays, format } from 'date-fns';

/**
 * Creates project milestones from a template after a project is created.
 * Computes due_date by adding `days_offset` to the project start_date (or today).
 */
export async function applyTemplateToProject(
  projectId: string,
  template: ProjectTemplate,
  projectStartDate: string | null
): Promise<void> {
  if (!template.default_milestones || template.default_milestones.length === 0) return;

  const baseDate = projectStartDate ? new Date(projectStartDate) : new Date();
  const sorted = [...template.default_milestones].sort(
    (a, b) => (a.order ?? 0) - (b.order ?? 0)
  );

  const rows = sorted.map((m: ProjectTemplateMilestone, idx) => ({
    project_id: projectId,
    name: m.name,
    budget: 0,
    status: 'pending',
    sort_order: idx,
    due_date: m.days_offset != null ? format(addDays(baseDate, m.days_offset), 'yyyy-MM-dd') : null,
    color: template.color || '#3b82f6',
  }));

  const { error } = await supabase.from('project_milestones').insert(rows);
  if (error) {
    console.error('Failed to apply template milestones:', error);
  }
}
