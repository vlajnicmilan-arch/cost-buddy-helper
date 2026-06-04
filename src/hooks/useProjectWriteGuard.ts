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
}

export interface ProjectWriteGuard {
  isReadOnly: boolean;
  accessLevel: ProjectAccessLevel | null;
  /**
   * Returns true when write is allowed. Otherwise shows the standardized
   * read-only toast and returns false. Use inside onClick / onSubmit:
   *
   *   const handleSave = () => { if (!guard()) return; ...do write }
   */
  guard: () => boolean;
  /**
   * Wraps any async/sync action so it bails out + toasts when read-only.
   */
  guardedAction: <Args extends any[], R>(fn: (...a: Args) => R) => (...a: Args) => R | undefined;
  /**
   * Spread on Buttons that should stay visible-but-disabled in read-only mode:
   *   <Button {...blockProps} onClick={guardedAction(handleClick)}>
   */
  blockProps: { disabled: boolean; 'aria-disabled': boolean; title?: string };
}

/**
 * Centralised UX gate for Projects domain write paths (Module Access Model v2).
 * RLS remains the second line of defense — this hook only ensures the user
 * sees a consistent, localized message instead of a raw 42501 error.
 *
 * Two ways to call:
 *   useProjectWriteGuard({ isReadOnly })          // when caller already knows
 *   useProjectWriteGuard({ project })             // hook derives via useProjectAccessLevel
 */
export function useProjectWriteGuard(input: UseProjectWriteGuardInput = {}): ProjectWriteGuard {
  const { t } = useTranslation();
  const derivedLevel = useProjectAccessLevel(input.project ?? null);
  const accessLevel: ProjectAccessLevel | null = input.project ? derivedLevel : null;
  const isReadOnly = isProjectReadOnly({ isReadOnly: input.isReadOnly, accessLevel });

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

  return { isReadOnly, accessLevel, guard, guardedAction, blockProps };
}
