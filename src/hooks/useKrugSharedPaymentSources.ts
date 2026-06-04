/**
 * T4 — Krug shared payment source link.
 *
 * Ide isključivo kroz `krug_shared_payment_source` tablicu + RLS koji koristi
 * `krug_can_manage_shared_source` helper. Klijent ne dodaje vlastite provjere
 * iznad RLS-a.
 */
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { showError, showSuccess } from '@/hooks/useStatusFeedback';

export interface KrugSharedPaymentSourceRow {
  id: string;
  krug_id: string;
  /** `custom:UUID` ili built-in slug (Balance Sync pattern). */
  payment_source_id: string;
  linked_by: string;
  linked_at: string;
  created_at: string;
}

export function useKrugSharedPaymentSources(krugId: string | null | undefined) {
  const qc = useQueryClient();
  const { user } = useAuth();

  const query = useQuery({
    queryKey: ['krug', 'shared-sources', krugId],
    enabled: !!krugId,
    staleTime: 5 * 60 * 1000,
    queryFn: async (): Promise<KrugSharedPaymentSourceRow[]> => {
      if (!krugId) return [];
      const { data, error } = await supabase
        .from('krug_shared_payment_source')
        .select('*')
        .eq('krug_id', krugId)
        .order('linked_at', { ascending: true });
      if (error) throw error;
      return (data ?? []) as KrugSharedPaymentSourceRow[];
    },
  });

  const link = useMutation({
    mutationFn: async (paymentSourceId: string) => {
      if (!krugId || !user) throw new Error('missing_context');
      const { data, error } = await supabase
        .from('krug_shared_payment_source')
        .insert({
          krug_id: krugId,
          payment_source_id: paymentSourceId,
          linked_by: user.id,
        })
        .select('*')
        .maybeSingle();
      if (error) throw error;
      return data as KrugSharedPaymentSourceRow | null;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['krug', 'shared-sources', krugId] });
      showSuccess();
    },
    onError: (err: any) => {
      showError(err?.message);
    },
  });

  const unlink = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('krug_shared_payment_source')
        .delete()
        .eq('id', id);
      if (error) throw error;
      return id;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['krug', 'shared-sources', krugId] });
      showSuccess();
    },
    onError: (err: any) => {
      showError(err?.message);
    },
  });

  return {
    ...query,
    linkPaymentSource: link.mutateAsync,
    unlinkPaymentSource: unlink.mutateAsync,
    isLinking: link.isPending,
    isUnlinking: unlink.isPending,
  };
}
