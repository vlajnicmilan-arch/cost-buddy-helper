/**
 * Deleting a collaborator engagement through `delete_collaborator`.
 *
 * The RPC refuses only when LIVE payments exist, and then it says how many and
 * how much — so the UI never has to write "nešto nije uspjelo". Voided
 * payments are removed together with the collaborator and leave the balance
 * untouched (their expense was already reversed by the void).
 */
import { useCallback, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { logDiagnostic } from '@/lib/diagnosticLogger';
import {
  parseCollaboratorDeleteError,
  type CollaboratorDeleteReason,
} from '@/lib/collaboratorDeleteImpact';

export interface CollaboratorDeleteResult {
  ok: boolean;
  voidedPaymentsRemoved?: number;
  reason?: CollaboratorDeleteReason;
}

export const useCollaboratorDelete = () => {
  const [pending, setPending] = useState(false);

  const deleteCollaborator = useCallback(
    async (collaboratorId: string): Promise<CollaboratorDeleteResult> => {
      setPending(true);
      try {
        const { data, error } = await supabase.rpc('delete_collaborator' as never, {
          p_collaborator_id: collaboratorId,
        } as never);
        if (error) {
          const reason = parseCollaboratorDeleteError(error);
          logDiagnostic({
            event: 'collaborator_delete_failed',
            severity: 'error',
            details: {
              collaborator_id: collaboratorId,
              reason: reason.kind,
              payment_count: reason.paymentCount ?? null,
              paid_total: reason.paidTotal ?? null,
              db_code: reason.code,
              db_message: reason.message,
            },
          });
          return { ok: false, reason };
        }
        const removed = Number((data as Record<string, unknown> | null)?.voided_payments_removed ?? 0) || 0;
        logDiagnostic({
          event: 'collaborator_delete_ok',
          severity: 'info',
          details: { collaborator_id: collaboratorId, voided_payments_removed: removed },
        });
        return { ok: true, voidedPaymentsRemoved: removed };
      } finally {
        setPending(false);
      }
    },
    [],
  );

  return { deleteCollaborator, pending };
};
