/**
 * Krug deletion flow hookovi.
 *
 * - useKrugDeletionRequest(krugId): SELECT pending request + glasovi
 * - useKrugRequestDeletion / useKrugVoteDeletion / useKrugCancelDeletion: RPC wrapperi
 *
 * Pravila (zaključana u DB RPC-ima + `krugDeletionDecisions.ts`):
 * - Solo Krug (vlasnik = jedini punopravni) → odmah soft-delete
 * - Više punopravnih → jednoglasna suglasnost; jedan "ne" zatvara zahtjev
 * - Soft-delete: krug.deleted_at + lifecycle_state='deleted'; 30d grace
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { supabase } from '@/integrations/supabase/client';
import { showError, showSuccess } from '@/hooks/useStatusFeedback';
import { isOkOutcome, type DeletionOutcome } from '@/lib/krugDeletionDecisions';
import { KRUG_SYNC_QUERY_OPTIONS } from '@/hooks/useKrugQueryOptions';

const STALE = 30 * 1000;

export interface KrugDeletionRequestRow {
  krug_id: string;
  initiated_by: string;
  initiated_at: string;
  reason: string | null;
  status: 'pending' | 'approved' | 'cancelled' | 'rejected';
  resolved_at: string | null;
  resolved_by: string | null;
}

export interface KrugDeletionVoteRow {
  krug_id: string;
  user_id: string;
  approve: boolean;
  voted_at: string;
}

export interface KrugDeletionState {
  request: KrugDeletionRequestRow | null;
  votes: KrugDeletionVoteRow[];
}

export function useKrugDeletionRequest(krugId: string | null | undefined) {
  return useQuery({
    queryKey: ['krug', 'deletion', krugId],
    enabled: !!krugId,
    staleTime: STALE,
    ...KRUG_SYNC_QUERY_OPTIONS,
    queryFn: async (): Promise<KrugDeletionState> => {
      if (!krugId) return { request: null, votes: [] };
      const [reqRes, voteRes] = await Promise.all([
        supabase
          .from('krug_deletion_request' as any)
          .select('*')
          .eq('krug_id', krugId)
          .eq('status', 'pending')
          .maybeSingle(),
        supabase
          .from('krug_deletion_vote' as any)
          .select('*')
          .eq('krug_id', krugId),
      ]);
      if (reqRes.error && reqRes.error.code !== 'PGRST116') throw reqRes.error;
      if (voteRes.error) throw voteRes.error;
      return {
        request: ((reqRes.data as unknown) as KrugDeletionRequestRow | null) ?? null,
        votes: ((voteRes.data as unknown) as KrugDeletionVoteRow[] | null) ?? [],
      };
    },
  });
}

interface ActOutcome {
  outcome: DeletionOutcome | string;
  krug_id?: string;
}

function useKrugInvalidator() {
  const qc = useQueryClient();
  return (krugId: string) => {
    qc.invalidateQueries({ queryKey: ['krug', 'deletion', krugId] });
    qc.invalidateQueries({ queryKey: ['krug', 'detail', krugId] });
    qc.invalidateQueries({ queryKey: ['krug', 'my'] });
  };
}

function useReport() {
  const { t } = useTranslation();
  return (res: ActOutcome) => {
    if (isOkOutcome(res.outcome)) {
      showSuccess(t(`krug.delete.outcomes.${res.outcome}`, { defaultValue: '' }) || undefined);
    } else {
      const msg = t(`krug.delete.errors.${res.outcome}`, {
        defaultValue: t('krug.delete.errors.unknown', 'Nepoznata greška'),
      });
      showError(msg);
    }
  };
}

export function useKrugRequestDeletion() {
  const invalidate = useKrugInvalidator();
  const report = useReport();
  return useMutation({
    mutationFn: async (vars: { krugId: string; reason?: string | null }) => {
      const { data, error } = await supabase.rpc('krug_request_deletion' as any, {
        p_krug_id: vars.krugId,
        p_reason: vars.reason ?? null,
      });
      if (error) throw error;
      return (data ?? { outcome: 'unknown' }) as ActOutcome;
    },
    onSuccess: (res, vars) => {
      invalidate(vars.krugId);
      report(res);
    },
    onError: (err: any, vars) => {
      // Resync deletion panel: server state may have advanced (vote counted,
      // request cancelled or approved by another member) before this call errored.
      invalidate(vars.krugId);
      showError(err?.message);
    },
  });
}

export function useKrugVoteDeletion() {
  const invalidate = useKrugInvalidator();
  const report = useReport();
  return useMutation({
    mutationFn: async (vars: { krugId: string; approve: boolean }) => {
      const { data, error } = await supabase.rpc('krug_vote_deletion' as any, {
        p_krug_id: vars.krugId,
        p_approve: vars.approve,
      });
      if (error) throw error;
      return (data ?? { outcome: 'unknown' }) as ActOutcome;
    },
    onSuccess: (res, vars) => {
      invalidate(vars.krugId);
      report(res);
    },
    onError: (err: any, vars) => {
      invalidate(vars.krugId);
      showError(err?.message);
    },
  });
}

export function useKrugCancelDeletion() {
  const invalidate = useKrugInvalidator();
  const report = useReport();
  return useMutation({
    mutationFn: async (vars: { krugId: string }) => {
      const { data, error } = await supabase.rpc('krug_cancel_deletion' as any, {
        p_krug_id: vars.krugId,
      });
      if (error) throw error;
      return (data ?? { outcome: 'unknown' }) as ActOutcome;
    },
    onSuccess: (res, vars) => {
      invalidate(vars.krugId);
      report(res);
    },
    onError: (err: any, vars) => {
      invalidate(vars.krugId);
      showError(err?.message);
    },
  });
}
