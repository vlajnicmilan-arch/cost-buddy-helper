/**
 * Destructive/corrective actions on a PERSON (Ljudi): rename, archive,
 * delete, and detaching one engagement from the person.
 *
 * Nothing here touches hours, rates, payouts or collaborators. The database
 * facts relied upon:
 *   - `project_workers.worker_id -> workers` is ON DELETE SET NULL, so removing
 *     the person keeps every engagement and every euro.
 *   - the account link lives on the person; it is cleared through the existing
 *     `link_person_to_user(person, NULL)` RPC before the person disappears.
 *
 * Every failure is recorded in `app_diagnostics_logs` with db_code/db_message.
 */
import { useCallback, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { logDiagnostic } from '@/lib/diagnosticLogger';

export interface PersonAdminResult {
  ok: boolean;
  dbCode?: string | null;
  dbMessage?: string | null;
}

const fail = (
  event: string,
  details: Record<string, unknown>,
  error: { code?: string | null; message?: string | null } | unknown,
): PersonAdminResult => {
  const e = error as { code?: string | null; message?: string | null };
  logDiagnostic({
    event,
    severity: 'error',
    details: { ...details, db_code: e?.code ?? null, db_message: String(e?.message ?? e) },
  });
  return { ok: false, dbCode: e?.code ?? null, dbMessage: String(e?.message ?? e) };
};

export const usePersonAdmin = () => {
  const [pending, setPending] = useState(false);

  /** Renames the person AND every engagement, so the two never disagree. */
  const renamePerson = useCallback(
    async (personId: string, firstName: string, lastName: string): Promise<PersonAdminResult> => {
      setPending(true);
      try {
        const { error } = await supabase
          .from('workers')
          .update({ first_name: firstName, last_name: lastName })
          .eq('id', personId);
        if (error) return fail('person_rename_failed', { person_id: personId, stage: 'person' }, error);

        const { error: engErr } = await supabase
          .from('project_workers')
          .update({ first_name: firstName, last_name: lastName })
          .eq('worker_id', personId);
        if (engErr)
          return fail('person_rename_failed', { person_id: personId, stage: 'engagements' }, engErr);

        logDiagnostic({
          event: 'person_rename_ok',
          severity: 'info',
          details: { person_id: personId },
        });
        return { ok: true };
      } finally {
        setPending(false);
      }
    },
    [],
  );

  /** Hides the person from the list without deleting anything. */
  const archivePerson = useCallback(
    async (personId: string, archived: boolean): Promise<PersonAdminResult> => {
      setPending(true);
      try {
        const { error } = await supabase
          .from('workers')
          .update({ archived_at: archived ? new Date().toISOString() : null })
          .eq('id', personId);
        if (error)
          return fail('person_archive_failed', { person_id: personId, archived }, error);
        logDiagnostic({
          event: archived ? 'person_archive_ok' : 'person_unarchive_ok',
          severity: 'info',
          details: { person_id: personId },
        });
        return { ok: true };
      } finally {
        setPending(false);
      }
    },
    [],
  );

  /**
   * Deletes the identity only. Engagements stay on their projects with
   * `worker_id = NULL`; the account link is cut first so no account keeps
   * pointing at a person that no longer exists.
   */
  const deletePerson = useCallback(async (personId: string): Promise<PersonAdminResult> => {
    setPending(true);
    try {
      const { error: unlinkErr } = await supabase.rpc('link_person_to_user' as never, {
        p_person_id: personId,
        p_user_id: null,
      } as never);
      if (unlinkErr)
        return fail('person_delete_failed', { person_id: personId, stage: 'unlink' }, unlinkErr);

      const { error } = await supabase.from('workers').delete().eq('id', personId);
      if (error) return fail('person_delete_failed', { person_id: personId, stage: 'delete' }, error);

      logDiagnostic({
        event: 'person_delete_ok',
        severity: 'info',
        details: { person_id: personId },
      });
      return { ok: true };
    } finally {
      setPending(false);
    }
  }, []);

  /**
   * The only way back from a wrong "yes, same person": the engagement stays on
   * its project with all hours and payouts, it simply stops belonging here.
   */
  const detachEngagement = useCallback(
    async (engagementId: string, personId: string): Promise<PersonAdminResult> => {
      setPending(true);
      try {
        const { error } = await supabase
          .from('project_workers')
          .update({ worker_id: null, user_id: null })
          .eq('id', engagementId);
        if (error)
          return fail(
            'engagement_detach_failed',
            { engagement_id: engagementId, person_id: personId },
            error,
          );
        logDiagnostic({
          event: 'engagement_detach_ok',
          severity: 'info',
          details: { engagement_id: engagementId, person_id: personId },
        });
        return { ok: true };
      } finally {
        setPending(false);
      }
    },
    [],
  );

  return { renamePerson, archivePerson, deletePerson, detachEngagement, pending };
};
