import { WorkLogDialog } from './WorkLogDialog';
import { useProjectWorkLogs } from '@/hooks/useProjectWorkLogs';
import { useProjectMilestones } from '@/hooks/useProjectMilestones';

interface WorkLogQuickEntryProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projectId: string;
  onSaved?: () => void;
}

/** Standalone wrapper to open WorkLogDialog from outside a project view */
export const WorkLogQuickEntry = ({ open, onOpenChange, projectId, onSaved }: WorkLogQuickEntryProps) => {
  const { create } = useProjectWorkLogs(projectId);
  const { milestones } = useProjectMilestones(projectId);

  return (
    <WorkLogDialog
      open={open}
      onOpenChange={onOpenChange}
      milestones={milestones}
      onSubmit={async (input) => {
        const ok = await create(input);
        if (ok) onSaved?.();
        return ok;
      }}
    />
  );
};
