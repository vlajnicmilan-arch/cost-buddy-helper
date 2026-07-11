/**
 * T4 — Krug shared payment source link.
 *
 * Ide isključivo kroz `krug_shared_payment_source` tablicu + RLS koji koristi
 * `krug_can_manage_shared_source` helper. Klijent ne dodaje vlastite provjere
 * iznad RLS-a.
 *
 * Display + Live Visibility Patch (Shared Source workstream):
 * - Non-owner članovi Kruga nemaju SELECT na `custom_payment_sources` (RLS je
 *   isključivo `user_id = auth.uid()` ili member payment source-a). Zato ne
 *   mogu resolvati `custom:UUID` u ime izvora. Rješavamo kroz display-safe
 *   SECURITY DEFINER RPC `get_krug_shared_source_display` koji vraća SAMO
 *   `name` i `currency` za izvore povezane s Krugom u kojem je pozivatelj
 *   član — bez proširenja custom_payment_sources RLS-a.
 * - `krug_shared_payment_source` je sada u `supabase_realtime` publikaciji.
 *   Pretplaćujemo se filtrirano po `krug_id` — svi članovi vide attach/detach
 *   bez izlaska/ulaska u app.
 */
import { useEffect, useMemo } from 'react';
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

export interface KrugSharedSourceDisplay {
  payment_source_id: string;
  name: string | null;
  currency: string | null;
}

export function useKrugSharedPaymentSources(krugId: string | null | undefined) {
  const qc = useQueryClient();
  const { user } = useAuth();

  const query = useQuery({
    queryKey: ['krug', 'shared-sources', krugId],
    enabled: !!krugId,
    staleTime: 5 * 60 * 1000,
    refetchOnWindowFocus: true,
    refetchOnReconnect: true,
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

  // Display-safe resolver — svi članovi Kruga (uključivo non-ownere i
  // non-membere payment source-a) dobiju samo ime + valutu, bez saldiranja.
  const displayQuery = useQuery({
    queryKey: ['krug', 'shared-sources-display', krugId],
    enabled: !!krugId && !!user,
    staleTime: 5 * 60 * 1000,
    refetchOnWindowFocus: true,
    refetchOnReconnect: true,
    queryFn: async (): Promise<KrugSharedSourceDisplay[]> => {
      if (!krugId) return [];
      const { data, error } = await (supabase as any).rpc(
        'get_krug_shared_source_display',
        { _krug_id: krugId },
      );
      if (error) throw error;
      return (data ?? []) as KrugSharedSourceDisplay[];
    },
  });

  const displayById = useMemo(() => {
    const map = new Map<string, { name: string | null; currency: string | null }>();
    for (const row of displayQuery.data ?? []) {
      map.set(row.payment_source_id, { name: row.name, currency: row.currency });
    }
    return map;
  }, [displayQuery.data]);

  // Realtime — attach/detach mora propagirati na sve članove Kruga bez
  // izlaska iz app. Tablica je u `supabase_realtime` publikaciji + REPLICA
  // IDENTITY FULL, filtriramo po `krug_id`. Display cache također
  // invalidiramo jer se lista imena mijenja zajedno s link tablicom.
  useEffect(() => {
    if (!krugId) return;
    const channel = supabase
      .channel(`krug-shared-sources-${krugId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'krug_shared_payment_source',
          filter: `krug_id=eq.${krugId}`,
        },
        () => {
          qc.invalidateQueries({ queryKey: ['krug', 'shared-sources', krugId] });
          qc.invalidateQueries({ queryKey: ['krug', 'shared-sources-display', krugId] });
        },
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [krugId, qc]);

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
      qc.invalidateQueries({ queryKey: ['krug', 'shared-sources-display', krugId] });
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
      qc.invalidateQueries({ queryKey: ['krug', 'shared-sources-display', krugId] });
      showSuccess();
    },
    onError: (err: any) => {
      showError(err?.message);
    },
  });

  return {
    ...query,
    displayById,
    linkPaymentSource: link.mutateAsync,
    unlinkPaymentSource: unlink.mutateAsync,
    isLinking: link.isPending,
    isUnlinking: unlink.isPending,
  };
}
