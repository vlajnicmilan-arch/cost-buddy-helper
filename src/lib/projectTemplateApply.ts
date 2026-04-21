import { supabase } from '@/integrations/supabase/client';
import { ProjectTemplate, ProjectTemplateMilestone } from '@/hooks/useProjectTemplates';
import { addDays, format } from 'date-fns';

interface ApplyOptions {
  /** Add a "Contingency reserve" milestone (10% of project budget). Default: true if budget > 0. */
  addContingency?: boolean;
  /** Total project budget — required to size the contingency reserve. */
  totalBudget?: number;
  /** Reserve percentage (0-100). Default 10. */
  contingencyPercent?: number;
  /** Localized label for the reserve milestone. */
  contingencyLabel?: string;
}

/**
 * Creates project milestones from a template after a project is created.
 * Computes due_date by adding `days_offset` to the project start_date (or today).
 * Optionally adds a contingency reserve milestone at the top.
 */
export async function applyTemplateToProject(
  projectId: string,
  template: ProjectTemplate,
  projectStartDate: string | null,
  options: ApplyOptions = {}
): Promise<void> {
  const baseDate = projectStartDate ? new Date(projectStartDate) : new Date();
  const sorted = template.default_milestones
    ? [...template.default_milestones].sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
    : [];

  // Skip duplicate contingency if template already has one
  const templateHasReserve = sorted.some((m) =>
    /rezerv|contingency|reserve/i.test(m.name)
  );

  const totalBudget = options.totalBudget ?? 0;
  const percent = options.contingencyPercent ?? 10;
  const wantsContingency =
    options.addContingency !== false && totalBudget > 0 && !templateHasReserve;

  const rows: any[] = [];
  let sortIdx = 0;

  if (wantsContingency) {
    rows.push({
      project_id: projectId,
      name: options.contingencyLabel || 'Rezerva za nepredviđeno',
      budget: Math.round((totalBudget * percent) / 100 * 100) / 100,
      status: 'pending',
      sort_order: sortIdx++,
      due_date: null,
      color: '#94a3b8', // slate-400
      is_contingency: true,
    });
  }

  sorted.forEach((m: ProjectTemplateMilestone) => {
    rows.push({
      project_id: projectId,
      name: m.name,
      budget: 0,
      status: 'pending',
      sort_order: sortIdx++,
      due_date:
        m.days_offset != null ? format(addDays(baseDate, m.days_offset), 'yyyy-MM-dd') : null,
      color: template.color || '#3b82f6',
      is_contingency: false,
    });
  });

  if (rows.length === 0) return;

  const { error } = await supabase.from('project_milestones').insert(rows);
  if (error) {
    console.error('Failed to apply template milestones:', error);
  }
}
