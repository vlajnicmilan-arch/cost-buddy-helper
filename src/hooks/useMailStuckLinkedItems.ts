import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';

/**
 * MAIL LIJEVAK — dokumenti koji tvrde da su „povezan", a iza njih NEMA uvoza.
 *
 * Uzrok takvog stanja bio je dvostruk: (1) klijent je stavku označavao
 * povezanom bez provjere da je uvoz stvarno zapisan, (2) poništenje uvoza
 * brisalo je redak u `imported_statements`, a stavka je ostajala „povezan".
 * Oboje je zatvoreno na poslužitelju; ovaj popis služi za oslobađanje
 * zatečenih slučajeva. Provjera je ISKLJUČIVO serverska
 * (`mail_items_stuck_linked` / `mail_item_release_linked`).
 */

export interface MailStuckLinkedItem {
  id: string;
  classification: string | null;
  subject: string | null;
  extraction: Record<string, unknown> | null;
  updated_at: string;
}

export function useMailStuckLinkedItems(enabled: boolean) {
  const { user } = useAuth();
  const [items, setItems] = useState<MailStuckLinkedItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState(false);

  const fetchItems = useCallback(async () => {
    if (!enabled || !user?.id) {
      setItems([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    const { data, error } = await supabase.rpc('mail_items_stuck_linked' as never);
    if (error) {
      console.warn('[useMailStuckLinkedItems] fetch error:', error.message);
      setItems([]);
    } else {
      setItems((data ?? []) as unknown as MailStuckLinkedItem[]);
    }
    setLoading(false);
  }, [enabled, user?.id]);

  useEffect(() => {
    fetchItems();
  }, [fetchItems]);

  /** Vraća dokument u red „Na pregled". Poslužitelj odbija ako uvoz postoji. */
  const releaseItem = useCallback(
    async (itemId: string): Promise<{ ok: boolean; reason?: string }> => {
      setWorking(true);
      try {
        const { data, error } = await supabase.rpc('mail_item_release_linked' as never, {
          p_item_id: itemId,
        } as never);
        if (error) {
          console.warn('[useMailStuckLinkedItems] release error:', error.message);
          return { ok: false, reason: 'greska' };
        }
        const result = (data ?? {}) as { ok?: boolean; reason?: string };
        if (result.ok === false) return { ok: false, reason: result.reason };
        await fetchItems();
        return { ok: true };
      } finally {
        setWorking(false);
      }
    },
    [fetchItems],
  );

  return { items, loading, working, releaseItem, refetch: fetchItems };
}
