/**
 * T3 — Krug read hookovi.
 *
 * Hookovi su neutralni prema UI sloju i ne uvode nikakvu novu semantiku
 * iznad onoga što je zaključano u Krug Foundation v4.2 / RLS v1.1.
 *
 * Owner se NE prikazuje kao membership role — vodi se kroz `krug_ownership`.
 * Membership role enum ima samo `punopravni | obicni`.
 *
 * Realtime + Invalidation Patch:
 * - useMyKrugs prati `krug` publikaciju (INSERT/UPDATE/DELETE) — bez filtera,
 *   invalidira listu na svakom eventu. Volumen krug promjena je nizak.
 * - useKrug prati `krug` filtriran po `id=eq.<krugId>` i `krug_membership`
 *   filtriran po `krug_id=eq.<krugId>` — invalidira detail (myMembership),
 *   members listu i pending-expenses (isFullMember gate).
 * - useKrugMembers prati `krug_membership` po `krug_id` — invalidira members
 *   i detail; pending-expenses ide preko useKrug jer je vezan uz isFullMember.
 */
import { useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { KRUG_SYNC_QUERY_OPTIONS } from '@/hooks/useKrugQueryOptions';
import type { Database } from '@/integrations/supabase/types';

export type KrugRow = Database['public']['Tables']['krug']['Row'];
export type KrugOwnershipRow = Database['public']['Tables']['krug_ownership']['Row'];
export type KrugMembershipRow = Database['public']['Tables']['krug_membership']['Row'];
export type KrugMembershipRole = Database['public']['Enums']['krug_membership_role'];
export type KrugPreset = Database['public']['Enums']['krug_preset'];
export type KrugLifecycleState = Database['public']['Enums']['krug_lifecycle_state'];
// WS3 verified: only `active` (DB default) and `deleted` (deletion RPCs) are
// actually written; the other four enum variants are currently reserved.

const STALE = 5 * 60 * 1000;

/** Krugovi u kojima sam owner ili član (`punopravni`/`obicni`). RLS filtrira po `krug_is_member`. */
export function useMyKrugs() {
  const { user } = useAuth();
  const qc = useQueryClient();

  const query = useQuery({
    queryKey: ['krug', 'my', user?.id ?? null],
    enabled: !!user,
    staleTime: STALE,
    ...KRUG_SYNC_QUERY_OPTIONS,
    queryFn: async (): Promise<KrugRow[]> => {
      const { data, error } = await supabase
        .from('krug')
        .select('*')
        .is('deleted_at', null)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  // Realtime: bilo koja promjena na `krug` (soft-delete, rename, novi Krug)
  // invalidira my-list. Volume je nizak, filter po member-shipu bi tražio
  // dodatni JOIN kojeg realtime ne podržava — jeftinije je uvijek revalidirati.
  //
  // Dopuna (Val A follow-up): membership promjene NE mijenjaju red u `krug`,
  // pa ulazak (novi član) i izlazak (uklonjeni član) iz Kruga ne bi
  // propagirali u listu bez zasebne pretplate. Filtriramo po
  // `user_id=eq.<me>` da hvatamo isključivo membership događaje koji
  // utječu na *moju* listu.
  useEffect(() => {
    if (!user) return;
    const channel = supabase
      .channel(`krug-my-${user.id}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'krug' },
        () => {
          qc.invalidateQueries({ queryKey: ['krug', 'my'] });
        },
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'krug_membership', filter: `user_id=eq.${user.id}` },
        () => {
          qc.invalidateQueries({ queryKey: ['krug', 'my'] });
        },
      )
      .subscribe();

    // Napomena: broadcast slušač za `krug_deleted` NAMJERNO ne postoji ovdje.
    // Page-level slušač u `src/pages/Krug.tsx` (kanal `krug:user:<uid>`) je
    // jedini broadcast recipient — dva slušača na istom topicu su nepotrebna
    // duplikacija. Prijašnji slušač na starom topicu bio je mrtav zbog istog
    // topic mismatcha koji je popravljen u Krug.tsx.
    return () => {
      supabase.removeChannel(channel);
    };
  }, [user, qc]);

  return query;
}

export interface KrugWithRoles {
  krug: KrugRow;
  ownership: KrugOwnershipRow | null;
  myMembership: KrugMembershipRow | null;
}

/** Pojedinačni krug + ownership row + moj membership row (ako postoji). */
export function useKrug(krugId: string | null | undefined) {
  const { user } = useAuth();
  const qc = useQueryClient();

  const query = useQuery({
    queryKey: ['krug', 'detail', krugId, user?.id ?? null],
    enabled: !!user && !!krugId,
    staleTime: STALE,
    ...KRUG_SYNC_QUERY_OPTIONS,
    queryFn: async (): Promise<KrugWithRoles | null> => {
      if (!krugId) return null;
      const [krugRes, ownerRes, memRes] = await Promise.all([
        supabase.from('krug').select('*').eq('id', krugId).maybeSingle(),
        supabase.from('krug_ownership').select('*').eq('krug_id', krugId).maybeSingle(),
        supabase
          .from('krug_membership')
          .select('*')
          .eq('krug_id', krugId)
          .eq('user_id', user!.id)
          .maybeSingle(),
      ]);
      if (krugRes.error) throw krugRes.error;
      if (ownerRes.error) throw ownerRes.error;
      if (memRes.error) throw memRes.error;
      if (!krugRes.data) return null;
      return {
        krug: krugRes.data as KrugRow,
        ownership: (ownerRes.data as KrugOwnershipRow | null) ?? null,
        myMembership: (memRes.data as KrugMembershipRow | null) ?? null,
      };
    },
  });

  // Realtime — otvoreni Krug mora reagirati na:
  //   - promjenu lifecycle_state / deleted_at (owner + drugi članovi vide brisanje)
  //   - promjenu role u krug_membership (upgrade/downgrade odmah propagira
  //     na `myMembership`, a time i na `isFullMember` u KrugApprovalQueue/Panel)
  //   - insert/delete membership row-a (netko dodan/uklonjen bez re-entera)
  // Kad se membership promijeni, i pending-expenses read model se mora
  // osvježiti — RLS na expenses ovisi o full-member statusu.
  useEffect(() => {
    if (!user || !krugId) return;
    const channel = supabase
      .channel(`krug-detail-${krugId}-${user.id}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'krug', filter: `id=eq.${krugId}` },
        () => {
          qc.invalidateQueries({ queryKey: ['krug', 'detail', krugId] });
          qc.invalidateQueries({ queryKey: ['krug', 'my'] });
        },
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'krug_membership', filter: `krug_id=eq.${krugId}` },
        () => {
          qc.invalidateQueries({ queryKey: ['krug', 'detail', krugId] });
          qc.invalidateQueries({ queryKey: ['krug', 'members', krugId] });
          qc.invalidateQueries({ queryKey: ['krug', 'pending-expenses', krugId] });
        },
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [user, krugId, qc]);

  return query;
}

export interface KrugMemberView {
  user_id: string;
  /** `owner` se izvodi iz `krug_ownership`, nikada iz membership enuma. */
  kind: 'owner' | 'punopravni' | 'obicni';
  membership_id: string | null;
  added_by: string | null;
  added_at: string | null;
}

/**
 * Vraća listu članova (owner + membership zapisi).
 * Owner se prikazuje odvojeno; ako je owner i u `krug_membership` (npr. trigger creatora
 * upisuje `punopravni`), spaja se u jedan red s `kind='owner'` ali zadržava `membership_id`.
 */
export function useKrugMembers(krugId: string | null | undefined) {
  const qc = useQueryClient();

  const query = useQuery({
    queryKey: ['krug', 'members', krugId],
    enabled: !!krugId,
    staleTime: STALE,
    ...KRUG_SYNC_QUERY_OPTIONS,
    queryFn: async (): Promise<KrugMemberView[]> => {
      if (!krugId) return [];
      const [ownerRes, memRes] = await Promise.all([
        supabase.from('krug_ownership').select('*').eq('krug_id', krugId).maybeSingle(),
        supabase
          .from('krug_membership')
          .select('*')
          .eq('krug_id', krugId)
          .order('created_at', { ascending: true }),
      ]);
      if (ownerRes.error) throw ownerRes.error;
      if (memRes.error) throw memRes.error;

      const memberships = (memRes.data ?? []) as KrugMembershipRow[];
      const ownerUserId = (ownerRes.data as KrugOwnershipRow | null)?.user_id ?? null;

      const out: KrugMemberView[] = [];

      if (ownerUserId) {
        const ownerMembership = memberships.find(m => m.user_id === ownerUserId) ?? null;
        out.push({
          user_id: ownerUserId,
          kind: 'owner',
          membership_id: ownerMembership?.id ?? null,
          added_by: ownerMembership?.added_by ?? null,
          added_at: ownerMembership?.created_at ?? (ownerRes.data as KrugOwnershipRow | null)?.created_at ?? null,
        });
      }

      for (const m of memberships) {
        if (m.user_id === ownerUserId) continue;
        out.push({
          user_id: m.user_id,
          kind: m.role,
          membership_id: m.id,
          added_by: m.added_by,
          added_at: m.created_at,
        });
      }

      return out;
    },
  });

  // Realtime: promjena membership row-a mora refleksno osvježiti listu
  // članova bez re-entera. Detail se invalidira zbog `myMembership` u useKrug
  // koji drugi surface-i čitaju iz istog cache-a.
  useEffect(() => {
    if (!krugId) return;
    const channel = supabase
      .channel(`krug-members-${krugId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'krug_membership', filter: `krug_id=eq.${krugId}` },
        () => {
          qc.invalidateQueries({ queryKey: ['krug', 'members', krugId] });
          qc.invalidateQueries({ queryKey: ['krug', 'detail', krugId] });
        },
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [krugId, qc]);

  return query;
}
