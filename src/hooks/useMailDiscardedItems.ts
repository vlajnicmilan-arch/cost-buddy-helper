import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';

/**
 * MAIL UVOZ — arhiva odbačenih stavki (zadnjih 30 dana) + „Vrati".
 *
 * Odbacivanje NIJE brisanje: stavka ostaje u `document_ingest_items` sa
 * statusom `odbacio_korisnik`, pa je povratak u red pregleda običan `update`
 * (bez RPC-a; RLS već dopušta vlasniku pisanje po vlastitoj stavci).
 */

export interface MailDiscardedItem {
  id: string;
  classification: string | null;
  extraction: Record<string, unknown> | null;
  created_at: string;
  subject: string | null;
  from_header: string | null;
}

const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;

export function useMailDiscardedItems(enabled: boolean) {
  const { user } = useAuth();
  const [items, setItems] = useState<MailDiscardedItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState(false);

  const fetchItems = useCallback(async () => {
    if (!enabled || !user?.id) {
      setItems([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    const since = new Date(Date.now() - THIRTY_DAYS_MS).toISOString();
    const { data, error } = await supabase
      .from('document_ingest_items')
      .select(
        'id, classification, extraction, created_at, inbound_messages(subject, from_header)'
      )
      .eq('owner_user_id', user.id)
      // I sustavno odbačene stavke (duplikat privitka i sl.) pripadaju ovdje —
      // inače nestanu bez traga i popis laže da se ništa nije dogodilo.
      .in('status', ['odbacio_korisnik', 'odbaceno'])
      .gte('created_at', since)
      .order('created_at', { ascending: false })
      .limit(100);

    if (error) {
      console.warn('[useMailDiscardedItems] fetch error:', error.message);
      setItems([]);
    } else {
      setItems(
        (data ?? []).map((row: any) => ({
          id: row.id,
          classification: row.classification,
          extraction: (row.extraction ?? null) as Record<string, unknown> | null,
          created_at: row.created_at,
          subject: row.inbound_messages?.subject ?? null,
          from_header: row.inbound_messages?.from_header ?? null,
        }))
      );
    }
    setLoading(false);
  }, [enabled, user?.id]);

  useEffect(() => {
    fetchItems();
  }, [fetchItems]);

  /** Vraća odbačenu stavku natrag u red „Na pregled". */
  const restoreItem = useCallback(
    async (itemId: string): Promise<boolean> => {
      setWorking(true);
      try {
        const { error } = await supabase
          .from('document_ingest_items')
          .update({ status: 'na_pregledu' })
          .eq('id', itemId);
        if (error) {
          console.warn('[useMailDiscardedItems] restore error:', error.message);
          return false;
        }
        await fetchItems();
        return true;
      } finally {
        setWorking(false);
      }
    },
    [fetchItems]
  );

  return { items, loading, working, restoreItem, refetch: fetchItems };
}
