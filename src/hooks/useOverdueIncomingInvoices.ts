/**
 * useOverdueIncomingInvoices
 * Neplaćeni ULAZNI računi kojima je dospijeće prošlo — STANJE knjiga, ne događaj.
 * Namjerno NIJE ograničeno na aktivni poslovni profil: agregat u "Za pažnju"
 * pokriva sve knjige korisnika (osobne i poslovne).
 */
import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';

export interface OverdueIncomingInvoice {
  id: string;
  due_date: string | null;
  paid_at: string | null;
  total_amount: number;
}

export const useOverdueIncomingInvoices = (enabled: boolean) => {
  const { user, authReady } = useAuth();
  const [invoices, setInvoices] = useState<OverdueIncomingInvoice[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchOverdue = useCallback(async () => {
    if (!authReady) return;
    if (!user || !enabled) {
      setInvoices([]);
      setLoading(false);
      return;
    }
    const today = new Date().toISOString().slice(0, 10);
    const { data, error } = await (supabase as any)
      .from('incoming_invoices')
      .select('id, due_date, paid_at, total_amount')
      .eq('user_id', user.id)
      .eq('direction', 'in')
      .is('paid_at', null)
      .lt('due_date', today);
    if (error) {
      console.error('[useOverdueIncomingInvoices] fetch failed', error);
      setLoading(false);
      return;
    }
    setInvoices((data ?? []) as OverdueIncomingInvoice[]);
    setLoading(false);
  }, [user?.id, authReady, enabled]);

  useEffect(() => { fetchOverdue(); }, [fetchOverdue]);

  return { invoices, loading, refetch: fetchOverdue };
};
