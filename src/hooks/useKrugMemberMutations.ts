/**
 * Krug member management hookovi.
 *
 * - addMember: poziva edge function `krug-add-member` (email lookup + insert)
 * - changeRole: direct UPDATE na krug_membership (RLS: krug_membership_update_owner)
 * - removeMember: direct DELETE (RLS: krug_membership_delete_owner_not_self;
 *   owner self-remove blokiran na bazi)
 *
 * Caps (KRUG_PRESETS.maxPunopravni) su UX guard u UI-u; ovaj sloj ih ne
 * enforca jer DB layer još nema constraint (Honest Skeleton).
 */
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export type KrugAddRole = 'punopravni' | 'obicni';

export type KrugAddOutcome =
  | { ok: true; user_id: string; role: KrugAddRole }
  | { ok: false; error: KrugAddError };

export type KrugAddError =
  | 'invalid_input'
  | 'unauthorized'
  | 'not_owner'
  | 'user_not_found'
  | 'cannot_add_self'
  | 'already_member'
  | 'cap_exceeded'
  | 'lookup_failed'
  | 'insert_failed'
  | 'unexpected';

/** Marker poruka koju DB trigger digne kad je preset cap probijen. */
export const KRUG_CAP_MARKER = 'krug_punopravni_cap';

export function isKrugCapError(err: unknown): boolean {
  if (!err) return false;
  const msg = (err as { message?: string })?.message ?? String(err);
  return msg.includes(KRUG_CAP_MARKER);
}

interface AddArgs {
  krugId: string;
  email: string;
  role: KrugAddRole;
}

export function useKrugAddMember() {
  const qc = useQueryClient();
  return useMutation<KrugAddOutcome, Error, AddArgs>({
    mutationFn: async ({ krugId, email, role }) => {
      const { data, error } = await supabase.functions.invoke('krug-add-member', {
        body: { krug_id: krugId, email, role },
      });
      if (error) {
        return { ok: false, error: 'unexpected' };
      }
      if (data?.ok) {
        return { ok: true, user_id: data.user_id, role: data.role };
      }
      return { ok: false, error: (data?.error as KrugAddError) ?? 'unexpected' };
    },
    onSuccess: (_res, vars) => {
      qc.invalidateQueries({ queryKey: ['krug', 'members', vars.krugId] });
    },
  });
}

interface ChangeRoleArgs {
  krugId: string;
  membershipId: string;
  role: KrugAddRole;
}

export function useKrugChangeMemberRole() {
  const qc = useQueryClient();
  return useMutation<void, Error, ChangeRoleArgs>({
    mutationFn: async ({ membershipId, role }) => {
      const { error } = await supabase
        .from('krug_membership')
        .update({ role })
        .eq('id', membershipId);
      if (error) throw error;
    },
    onSuccess: (_v, vars) => {
      qc.invalidateQueries({ queryKey: ['krug', 'members', vars.krugId] });
    },
  });
}

interface RemoveArgs {
  krugId: string;
  membershipId: string;
}

export function useKrugRemoveMember() {
  const qc = useQueryClient();
  return useMutation<void, Error, RemoveArgs>({
    mutationFn: async ({ membershipId }) => {
      const { error } = await supabase
        .from('krug_membership')
        .delete()
        .eq('id', membershipId);
      if (error) throw error;
    },
    onSuccess: (_v, vars) => {
      qc.invalidateQueries({ queryKey: ['krug', 'members', vars.krugId] });
    },
  });
}
