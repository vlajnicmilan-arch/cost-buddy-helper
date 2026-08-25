import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';

/**
 * „ŠTO SAM ODBACIO" — pravila nastala korisnikovim odbacivanjem.
 *
 * Ista vrsta poruke od istog pošiljatelja odbačena DVAPUT više ne ulazi u red
 * na pregled. Ništa se ne briše — dokument ostaje u odbačenom, a pravilo se
 * ovdje vidi i briše jednim dodirom.
 */

export interface RejectionMemoryEntry {
  id: string;
  sender_email: string;
  signature: string;
  reject_count: number;
  last_subject: string | null;
  updated_at: string;
}

export function useRejectionMemory(enabled: boolean) {
  const { user } = useAuth();
  const [entries, setEntries] = useState<RejectionMemoryEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState(false);

  const fetchEntries = useCallback(async () => {
    if (!enabled || !user?.id) {
      setEntries([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    const { data, error } = await supabase
      .from('mail_rejection_memory')
      .select('id, sender_email, signature, reject_count, last_subject, updated_at')
      .eq('user_id', user.id)
      .order('reject_count', { ascending: false })
      .limit(200);

    if (error) {
      console.warn('[useRejectionMemory] fetch error:', error.message);
      setEntries([]);
    } else {
      setEntries(
        (data ?? []).map((row: Record<string, unknown>) => ({
          id: String(row.id),
          sender_email: String(row.sender_email ?? ''),
          signature: String(row.signature ?? ''),
          reject_count: Number(row.reject_count ?? 0),
          last_subject: (row.last_subject as string | null) ?? null,
          updated_at: String(row.updated_at ?? ''),
        })),
      );
    }
    setLoading(false);
  }, [enabled, user?.id]);

  useEffect(() => {
    fetchEntries();
  }, [fetchEntries]);

  const forgetEntry = useCallback(
    async (id: string) => {
      setWorking(true);
      try {
        const { error } = await supabase.from('mail_rejection_memory').delete().eq('id', id);
        if (error) {
          console.warn('[useRejectionMemory] delete error:', error.message);
          return false;
        }
        await fetchEntries();
        return true;
      } finally {
        setWorking(false);
      }
    },
    [fetchEntries],
  );

  return { entries, loading, working, forgetEntry, refetch: fetchEntries };
}
