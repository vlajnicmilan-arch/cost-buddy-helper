// Best-effort dispatcher to the notify-project-activity edge function.
// Failures must NEVER break the UI flow that triggered them.

import { supabase } from '@/integrations/supabase/client';

export type ProjectActivityType =
  | 'work_log_added'
  | 'work_log_updated'
  | 'work_log_deleted'
  | 'milestone_added'
  | 'milestone_status_changed'
  | 'milestone_deleted';

export interface ProjectActivityMeta {
  date?: string;
  hours?: number | null;
  milestone_name?: string;
  status?: string;
}

export async function notifyProjectActivity(params: {
  project_id: string;
  activity_type: ProjectActivityType;
  ref_id?: string | null;
  meta?: ProjectActivityMeta;
}): Promise<void> {
  try {
    await supabase.functions.invoke('notify-project-activity', { body: params });
  } catch (err) {
    // Best-effort; never break caller flow.
    console.warn('[notifyProjectActivity] dispatch failed', err);
  }
}
