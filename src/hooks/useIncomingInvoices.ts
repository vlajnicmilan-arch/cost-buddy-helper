/**
 * useIncomingInvoices — ulazni računi (eRačun v1).
 *
 * Radi ISKLJUČIVO nad `incoming_invoices`. Motor salda, anchor i uvoz izvoda
 * se ne dodiruju: trošak se stvara tek na „Plaćeno" i to kroz postojeći
 * `addExpense` put (jedini pisač u `expenses`).
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useAppState } from '@/contexts/AppStateContext';
import { sortIncomingInvoices } from '@/lib/eracun/sortInvoices';
import { describeDbError } from '@/lib/eracun/dbError';
import { showError } from '@/hooks/useStatusFeedback';
import i18n from '@/i18n';
import type { EracunInsertRow } from '@/lib/eracun/intakeBatch';

export interface IncomingInvoice {
  id: string;
  /** `in` = obveza (dugujem), `out` = potraživanje (duguju mi). */
  direction: 'in' | 'out';
  supplier_name: string | null;
  supplier_oib: string;
  counterparty_name: string | null;
  counterparty_oib: string | null;
  invoice_number: string;
  issue_date: string | null;
  due_date: string | null;
  total_amount: number;
  vat_amount: number | null;
  currency: string;
  iban: string | null;
  payment_reference: string | null;
  settled_amount: number | null;
  doc_type: string;
  items: unknown;
  fingerprint: string;
  paid_expense_id: string | null;
  paid_at: string | null;
  import_batch_id: string | null;
  source_filename: string | null;
  created_at: string;
}

export const useIncomingInvoices = () => {
  const { user, authReady } = useAuth();
  const { activeBusinessProfileId } = useAppState();
  const [invoices, setInvoices] = useState<IncomingInvoice[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchInvoices = useCallback(async () => {
    if (!authReady) return;
    if (!user) { setInvoices([]); setLoading(false); return; }
    setLoading(true);
    let query = supabase
      .from('incoming_invoices' as any)
      .select('*')
      .eq('user_id', user.id);
    query = activeBusinessProfileId
      ? query.eq('business_profile_id', activeBusinessProfileId)
      : query.is('business_profile_id', null);

    const { data, error } = await query;
    if (error) {
      console.error('[IncomingInvoices] fetch failed', error);
      showError(`${i18n.t('eracun.import.loadFailed', 'Učitavanje ulaznih računa nije uspjelo: {{reason}}', { reason: describeDbError(error) })}`);
      setLoading(false);
      return;
    }
    setInvoices(sortIncomingInvoices((data ?? []) as unknown as IncomingInvoice[]));
    setLoading(false);
  }, [user, authReady, activeBusinessProfileId]);

  useEffect(() => { fetchInvoices(); }, [fetchInvoices]);

  const existingFingerprints = useMemo(
    () => new Set(invoices.map((i) => i.fingerprint)),
    [invoices],
  );

  /** Spremi seriju iz pregleda. Vraća broj spremljenih redaka. */
  const saveBatch = useCallback(async (rows: EracunInsertRow[]): Promise<number> => {
    if (rows.length === 0) return 0;
    const { error } = await supabase.from('incoming_invoices' as any).insert(rows as any);
    if (error) throw error;
    await fetchInvoices();
    return rows.length;
  }, [fetchInvoices]);

  /** Poništi uvoz serije — briše samo zapise te serije koji nisu plaćeni ni naplaćeni. */
  const undoBatch = useCallback(async (batchId: string): Promise<number> => {
    const { data, error } = await supabase
      .from('incoming_invoices' as any)
      .delete()
      .eq('import_batch_id', batchId)
      .is('paid_at', null)
      .select('id');
    if (error) throw error;
    await fetchInvoices();
    return (data ?? []).length;
  }, [fetchInvoices]);

  /** Poveži ULAZNI račun s već stvorenim troškom. Samo `direction = 'in'`. */
  const markPaid = useCallback(async (invoiceId: string, expenseId: string, paidAtIso: string) => {
    const { error } = await supabase
      .from('incoming_invoices' as any)
      .update({ paid_expense_id: expenseId, paid_at: paidAtIso })
      .eq('id', invoiceId);
    if (error) throw error;
    await fetchInvoices();
  }, [fetchInvoices]);

  /**
   * Naplata IZLAZNOG računa — bilježi SAMO datum naplate.
   *
   * Namjerna asimetrija prema `markPaid`: ovdje se ne stvara zapis u `expenses`
   * niti bilo gdje drugdje i saldo se ne dira. Prihod ulazi u aplikaciju kroz
   * uvoz bankovnog izvoda; dvostruko bilježenje bi isti novac uvelo dvaput.
   * Ne pretvarati ovo u simetriju s ulaznim računima.
   */
  const markCollected = useCallback(async (invoiceId: string, collectedAtIso: string) => {
    const { error } = await supabase
      .from('incoming_invoices' as any)
      .update({ paid_at: collectedAtIso })
      .eq('id', invoiceId)
      .eq('direction', 'out');
    if (error) throw error;
    await fetchInvoices();
  }, [fetchInvoices]);

  const deleteInvoice = useCallback(async (invoiceId: string) => {
    const { error } = await supabase.from('incoming_invoices' as any).delete().eq('id', invoiceId);
    if (error) throw error;
    await fetchInvoices();
  }, [fetchInvoices]);

  return {
    invoices,
    unpaid: useMemo(() => invoices.filter((i) => !i.paid_at), [invoices]),
    paid: useMemo(() => invoices.filter((i) => !!i.paid_at), [invoices]),
    loading,
    existingFingerprints,
    refetch: fetchInvoices,
    saveBatch,
    undoBatch,
    markPaid,
    markCollected,
    deleteInvoice,
  };
};
