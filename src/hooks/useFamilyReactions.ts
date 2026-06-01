import { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';

export interface FamilyReactionRow {
  id: string;
  group_id: string;
  expense_id: string;
  author_user_id: string;
  emoji: string;
  created_at: string;
}

interface Args {
  groupId: string | null | undefined;
  expenseId: string | null | undefined;
}

/**
 * Reactions per (group, expense). Toggle: insert if missing, delete if present.
 * RLS osigurava da samo članovi grupe vide / pišu.
 */
export function useFamilyReactions({ groupId, expenseId }: Args) {
  const { user } = useAuth();
  const [rows, setRows] = useState<FamilyReactionRow[]>([]);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    if (!groupId || !expenseId) {
      setRows([]);
      return;
    }
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('family_transaction_reactions')
        .select('*')
        .eq('group_id', groupId)
        .eq('expense_id', expenseId)
        .order('created_at', { ascending: true });
      if (error) throw error;
      setRows((data || []) as FamilyReactionRow[]);
    } catch (e) {
      console.error('[useFamilyReactions] load', e);
    } finally {
      setLoading(false);
    }
  }, [groupId, expenseId]);

  useEffect(() => {
    load();
  }, [load]);

  const toggle = useCallback(
    async (emoji: string) => {
      if (!user || !groupId || !expenseId) return;
      const mine = rows.find(
        (r) => r.author_user_id === user.id && r.emoji === emoji,
      );
      if (mine) {
        await supabase.from('family_transaction_reactions').delete().eq('id', mine.id);
      } else {
        await supabase.from('family_transaction_reactions').insert({
          group_id: groupId,
          expense_id: expenseId,
          author_user_id: user.id,
          emoji,
        });
      }
      await load();
    },
    [user, groupId, expenseId, rows, load],
  );

  const grouped = useMemo(() => {
    const map = new Map<string, { emoji: string; count: number; mine: boolean }>();
    for (const r of rows) {
      const cur = map.get(r.emoji) || { emoji: r.emoji, count: 0, mine: false };
      cur.count += 1;
      if (user && r.author_user_id === user.id) cur.mine = true;
      map.set(r.emoji, cur);
    }
    return Array.from(map.values());
  }, [rows, user]);

  return { rows, grouped, loading, toggle, reload: load };
}
