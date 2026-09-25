import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useProjectWorkers } from '@/hooks/useProjectWorkers';
import { useWorkerIdentityAttach } from '@/hooks/useWorkerIdentityAttach';
import { ProjectWorkerDialog } from './ProjectWorkerDialog';
import { buildWorkerPrefill, type UnratedPending, type WorkerPrefill } from '@/lib/unratedWorkerMembers';

interface Props {
  projectId: string;
  memberUserId: string;
  memberName: string;
  pending: UnratedPending;
  onDone: () => void;
}

/** Warning row + one-tap "Set hourly rate" for a worker member without a project_workers row. */
export const UnratedWorkerSetup = ({ projectId, memberUserId, memberName, pending, onDone }: Props) => {
  const { t } = useTranslation();
  const { user } = useAuth();
  const { addWorker, linkWorkerToMember } = useProjectWorkers(projectId);
  const { attach } = useWorkerIdentityAttach();
  const [open, setOpen] = useState(false);
  const [prefill, setPrefill] = useState<WorkerPrefill | null>(null);

  const openDialog = async () => {
    let next: WorkerPrefill | null = null;
    if (user) {
      const { data: identity } = await supabase
        .from('workers')
        .select('id, first_name, last_name')
        .eq('user_id', user.id)
        .eq('linked_user_id', memberUserId)
        .is('archived_at', null)
        .limit(1)
        .maybeSingle();
      if (identity) {
        const { data: engagements } = await supabase
          .from('project_workers')
          .select('worker_id, project_id, hourly_rate, created_at')
          .eq('worker_id', identity.id);
        next = buildWorkerPrefill(identity, (engagements ?? []) as never, projectId);
      }
    }
    if (!next) {
      const parts = memberName.trim().split(/\s+/);
      next = { identityId: null, first_name: parts[0] ?? '', last_name: parts.slice(1).join(' '), hourly_rate: null };
    }
    setPrefill(next);
    setOpen(true);
  };

  const handleSave: React.ComponentProps<typeof ProjectWorkerDialog>['onSave'] = async (data) => {
    const created = await addWorker(data);
    if (!created) return;
    if (prefill?.identityId) await attach(created.id, prefill.identityId);
    await linkWorkerToMember(created.id, memberUserId);
    onDone();
  };

  return (
    <div className="mt-2 p-2 rounded-md border border-warning/40 bg-warning/10 space-y-2" data-testid="unrated-worker-warning">
      <div className="flex items-start gap-2 text-xs text-foreground">
        <AlertTriangle className="w-4 h-4 text-warning shrink-0" />
        <div>
          <p className="font-medium">{t('projects.unratedWorkerWarning')}</p>
          {pending.days > 0 && (
            <p>{t('projects.unratedWorkerPending', { days: pending.days, hours: pending.hours })}</p>
          )}
        </div>
      </div>
      <Button type="button" size="sm" variant="outline" className="w-full min-h-[44px]" onClick={openDialog}>
        {t('projects.unratedWorkerSetRate')}
      </Button>
      <ProjectWorkerDialog
        open={open}
        onOpenChange={setOpen}
        projectId={projectId}
        prefill={prefill}
        onSave={handleSave}
      />
    </div>
  );
};
