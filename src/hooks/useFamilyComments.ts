import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';

export interface FamilyCommentRow {
  id: string;
  group_id: string;
  expense_id: string;
  author_user_id: string;
  body: string;
  created_at: string;
  updated_at: string;
}

interface Args {
  groupId: string | null | undefined;
  expenseId: string | null | undefined;
}

const MAX_LEN = 280;

export function useFamilyComments({ groupId, expenseId }: Args) {
  const { user } = useAuth();
  const [rows, setRows] = useState<FamilyCommentRow[]>([]);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    if (!groupId || !expenseId) {
      setRows([]);
      return;
    }
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('family_transaction_comments')
        .select('*')
        .eq('group_id', groupId)
        .eq('expense_id', expenseId)
        .is('deleted_at', null)
        .order('created_at', { ascending: true });
      if (error) throw error;
      setRows((data || []) as FamilyCommentRow[]);
    } catch (e) {
      console.error('[useFamilyComments] load', e);
    } finally {
      setLoading(false);
    }
  }, [groupId, expenseId]);

  useEffect(() => {
    load();
  }, [load]);

  const add = useCallback(
    async (body: string) => {
      if (!user || !groupId || !expenseId) return;
      const trimmed = body.trim().slice(0, MAX_LEN);
      if (!trimmed) return;
      await supabase.from('family_transaction_comments').insert({
        group_id: groupId,
        expense_id: expenseId,
        author_user_id: user.id,
        body: trimmed,
      });
      await load();
    },
    [user, groupId, expenseId, load],
  );

  const remove = useCallback(
    async (id: string) => {
      await supabase
        .from('family_transaction_comments')
        .update({ deleted_at: new Date().toISOString() })
        .eq('id', id);
      await load();
    },
    [load],
  );

  return { rows, loading, add, remove, reload: load, maxLength: MAX_LEN };
}
