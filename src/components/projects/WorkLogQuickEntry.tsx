import { WorkLogDialog } from './WorkLogDialog';
import { useProjectWorkLogs } from '@/hooks/useProjectWorkLogs';
import { useProjectMilestones } from '@/hooks/useProjectMilestones';
import { useProjectWriteGuard } from '@/hooks/useProjectWriteGuard';
import type { ProjectWithOwnership } from '@/types/project';

interface WorkLogQuickEntryProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projectId: string;
  onSaved?: () => void;
  /** Either pass a project for auto-derived gating, or an explicit isReadOnly. */
  project?: ProjectWithOwnership | null;
  isReadOnly?: boolean;
}

/** Standalone wrapper to open WorkLogDialog from outside a project view */
export const WorkLogQuickEntry = ({ open, onOpenChange, projectId, onSaved, project, isReadOnly }: WorkLogQuickEntryProps) => {
  const { create } = useProjectWorkLogs(projectId);
  const { milestones } = useProjectMilestones(projectId);
  const { guard } = useProjectWriteGuard(
    isReadOnly !== undefined ? { isReadOnly } : { project: project ?? null },
  );

  return (
    <WorkLogDialog
      open={open}
      onOpenChange={onOpenChange}
      milestones={milestones}
      onSubmit={async (input) => {
        if (!guard()) {
          onOpenChange(false);
          return false;
        }
        const ok = await create(input);
        if (ok) onSaved?.();
        return ok;
      }}
    />
  );
};
