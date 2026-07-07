import { useCallback, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { showError } from '@/hooks/useStatusFeedback';
import { useProjectAccessLevel } from '@/hooks/useProjectAccessLevel';
import type { ProjectAccessLevel } from '@/lib/projectAccess';
import { isProjectReadOnly } from '@/lib/projectWriteGuard';

interface ProjectInput {
  user_id: string | null | undefined;
  isParticipant?: boolean;
}

interface UseProjectWriteGuardInput {
  /** Pre-computed read-only flag (when caller already derived it). Wins over `project`. */
  isReadOnly?: boolean | null;
  /** Project descriptor; hook derives accessLevel + isReadOnly automatically. */
  project?: ProjectInput | null;
  /**
   * Opt-in narrow exception: callers performing own-work-log writes (worker/member)
   * may proceed even when accessLevel === 'participant'. Owner-readonly remains blocked.
   */
  allowOwnWorkLog?: boolean;
}

export interface ProjectWriteGuard {
  isReadOnly: boolean;
  accessLevel: ProjectAccessLevel | null;
  guard: () => boolean;
  guardedAction: <Args extends any[], R>(fn: (...a: Args) => R) => (...a: Args) => R | undefined;
  blockProps: { disabled: boolean; 'aria-disabled': boolean; title?: string };
  /**
   * Owner-only, subscription-gated write capability for worker payouts.
   * RPC `create_worker_payout` server-side requires project owner; UI mirrors
   * that with `accessLevel === 'owner_subscriber'`. When the guard cannot
   * derive an access level (no project passed), falls back to !isReadOnly.
   */
  canManageWorkerPayouts: boolean;
}

export function useProjectWriteGuard(input: UseProjectWriteGuardInput = {}): ProjectWriteGuard {
  const { t } = useTranslation();
  const derivedLevel = useProjectAccessLevel(input.project ?? null);
  const accessLevel: ProjectAccessLevel | null = input.project ? derivedLevel : null;
  const isReadOnly = isProjectReadOnly({
    isReadOnly: input.isReadOnly,
    accessLevel,
    allowOwnWorkLog: input.allowOwnWorkLog,
  });

  const guard = useCallback((): boolean => {
    if (!isReadOnly) return true;
    showError(t('projects.access.readOnlyBlockedToast'));
    return false;
  }, [isReadOnly, t]);

  const guardedAction = useCallback(
    <Args extends any[], R>(fn: (...a: Args) => R) => {
      return (...args: Args): R | undefined => {
        if (!guard()) return undefined;
        return fn(...args);
      };
    },
    [guard],
  );

  const blockProps = useMemo(
    () => ({
      disabled: isReadOnly,
      'aria-disabled': isReadOnly,
      title: isReadOnly ? t('projects.access.readOnlyBlockedToast') : undefined,
    }),
    [isReadOnly, t],
  );

  const canManageWorkerPayouts = accessLevel
    ? accessLevel === 'owner_subscriber'
    : !isReadOnly;

  return { isReadOnly, accessLevel, guard, guardedAction, blockProps, canManageWorkerPayouts };
}
