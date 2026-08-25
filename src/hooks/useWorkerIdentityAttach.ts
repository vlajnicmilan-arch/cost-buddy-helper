/**
 * Lightweight helper for attaching a person identity (`workers`) to a project
 * engagement (`project_workers`). Used when a worker is added to a project so
 * the same physical person is not silently duplicated among "Ljudi".
 *
 * Never merges automatically — the caller asks the user first.
 */
import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { logDiagnostic } from '@/lib/diagnosticLogger';
import { findExistingIdentityByName } from '@/lib/workerIdentity';

export interface IdentityLite {
  id: string;
  first_name: string;
  last_name: string;
  business_profile_id: string | null;
  archived_at: string | null;
}

export const useWorkerIdentityAttach = () => {
  const { user } = useAuth();
  const [people, setPeople] = useState<IdentityLite[]>([]);

  const load = useCallback(async () => {
    if (!user) {
      setPeople([]);
      return;
    }
    const { data, error } = await supabase
      .from('workers')
      .select('id, first_name, last_name, business_profile_id, archived_at')
      .eq('user_id', user.id);
    if (error) {
      logDiagnostic({
        event: 'worker_identity_list_failed',
        severity: 'warning',
        details: { message: error.message, code: error.code ?? null },
      });
      return;
    }
    setPeople((data ?? []) as unknown as IdentityLite[]);
  }, [user]);

  useEffect(() => {
    load();
  }, [load]);

  const findMatch = useCallback(
    (first: string, last: string, businessProfileId: string | null) =>
      findExistingIdentityByName(people, first, last, businessProfileId),
    [people],
  );

  const attach = useCallback(
    async (engagementId: string, workerId: string): Promise<boolean> => {
      const { error } = await supabase
        .from('project_workers')
        .update({ worker_id: workerId })
        .eq('id', engagementId);
      if (error) {
        logDiagnostic({
          event: 'worker_identity_attach_failed',
          severity: 'error',
          details: { engagement_id: engagementId, worker_id: workerId, message: error.message, code: error.code ?? null },
        });
        return false;
      }
      return true;
    },
    [],
  );

  const createAndAttach = useCallback(
    async (
      engagementId: string,
      first: string,
      last: string,
      businessProfileId: string | null,
    ): Promise<boolean> => {
      if (!user) return false;
      const { data, error } = await supabase
        .from('workers')
        .insert({
          user_id: user.id,
          business_profile_id: businessProfileId,
          first_name: first,
          last_name: last,
        })
        .select('id')
        .single();
      if (error) {
        logDiagnostic({
          event: 'worker_identity_create_failed',
          severity: 'error',
          details: { engagement_id: engagementId, message: error.message, code: error.code ?? null },
        });
        return false;
      }
      const ok = await attach(engagementId, (data as any).id);
      await load();
      return ok;
    },
    [user, attach, load],
  );

  return { people, findMatch, attach, createAndAttach, refetch: load };
};
