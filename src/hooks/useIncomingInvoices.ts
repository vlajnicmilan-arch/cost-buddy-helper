/**
 * useIncomingInvoices — ulazni računi (eRačun v1).
 *
 * Radi ISKLJUČIVO nad `incoming_invoices`. Motor salda, anchor i uvoz izvoda
 * se ne dodiruju: trošak se stvara tek na „Plaćeno" i to kroz postojeći
 * `addExpense` put (jedini pisač u `expenses`).
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useAppState } from '@/contexts/AppStateContext';
import { sortIncomingInvoices } from '@/lib/eracun/sortInvoices';
import { describeDbError } from '@/lib/eracun/dbError';
import { showError } from '@/hooks/useStatusFeedback';
import { logDiagnostic } from '@/lib/diagnosticLogger';
import type { AccountingCategory, AccountingCategorySource } from '@/lib/eracun/accountingClassification';
import i18n from '@/i18n';
import type { EracunInsertRow } from '@/lib/eracun/intakeBatch';
import { useAppResume } from '@/hooks/useAppResume';

export interface IncomingInvoice {
  id: string;
  /** `in` = obveza (dugujem), `out` = potraživanje (duguju mi). */
  direction: 'in' | 'out';
  supplier_name: string | null;
  supplier_oib: string;
  counterparty_name: string | null;
  counterparty_oib: string | null;
  /** Aplikacijski računi i isječci dolaze bez broja — prikaz koristi `invoiceNumberLabel`. */
  invoice_number: string | null;
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
  /** Korisnikova oznaka mjesta (npr. „Split"/„Solin") — uči se iz potvrde. */
  place_label: string | null;
  /** F1 — knjigovodstvena kategorija na razini računa (project/tool/fixed_asset). */
  accounting_category: string | null;
  accounting_category_source: string | null;
  accounting_category_set_at: string | null;
  /** F1 — stvarna veza na projekt kad je kategorija „pripadnost projektu". */
  project_id: string | null;
  created_at: string;

}

export const useIncomingInvoices = () => {
  const { user, authReady } = useAuth();
  const { activeBusinessProfileId } = useAppState();
  const [invoices, setInvoices] = useState<IncomingInvoice[]>([]);
  const [loading, setLoading] = useState(true);
  const hydratedRef = useRef(false);

  /** Dohvat računa. Vraća `true` kad je popis osvježen — pozivatelj može razlikovati „spremljeno, ali osvježenje palo". */
  const fetchInvoices = useCallback(async (): Promise<boolean> => {
    if (!authReady) return false;
    if (!user) { setInvoices([]); setLoading(false); return true; }
    // Prvi dohvat smije pokazati loading; pozadinska osvježenja su tiha.
    if (!hydratedRef.current) setLoading(true);
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
      return false;
    }
    setInvoices(sortIncomingInvoices((data ?? []) as unknown as IncomingInvoice[]));
    hydratedRef.current = true;
    setLoading(false);
    return true;
  }, [user, authReady, activeBusinessProfileId]);

  useEffect(() => { fetchInvoices(); }, [fetchInvoices]);

  // Dospijeća se moraju probuditi s korisnikom — tiho, bez poruka o grešci.
  useAppResume(fetchInvoices, { enabled: authReady && !!user });

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

  /**
   * Korekcija oznake mjesta s police. Ide kroz RPC jer isti poziv upisuje
   * oznaku NA RAČUN i ažurira pamćenje izdavatelja/mjesta.
   */
  const setPlaceLabel = useCallback(async (invoiceId: string, label: string) => {
    const { error } = await supabase.rpc('incoming_invoice_set_place' as any, {
      p_invoice_id: invoiceId,
      p_label: label,
    } as any);
    if (error) throw error;
    await fetchInvoices();
  }, [fetchInvoices]);

  /**
   * F1 — knjigovodstvena kategorija (+ veza na projekt za „pripadnost projektu").
   * Pri padu upisa ostavlja trag u `app_diagnostics_logs` (radnja, invoice_id,
   * doslovan code/message, build žig) i baca izvornu grešku — pozivatelj je
   * prevodi kroz `describeInvoiceDbError`, nikad generičkom porukom.
   * Ako upis prođe, a osvježenje popisa padne, baca `refresh_failed` — poruka
   * mora izričito reći oboje.
   */
  const setAccountingCategory = useCallback(async (
    invoiceId: string,
    category: AccountingCategory,
    projectId: string | null,
    source: AccountingCategorySource,
  ) => {
    const { error } = await supabase
      .from('incoming_invoices' as any)
      .update({
        accounting_category: category,
        accounting_category_source: source,
        accounting_category_set_at: new Date().toISOString(),
        project_id: category === 'project' ? projectId : null,
      } as any)
      .eq('id', invoiceId);
    if (error) {
      logDiagnostic({
        event: 'invoice_accounting_category_failed',
        severity: 'error',
        details: {
          action: 'incoming_invoices.setAccountingCategory',
          invoice_id: invoiceId,
          db_code: (error as { code?: string })?.code ?? null,
          db_message: (error as { message?: string })?.message ?? String(error),
        },
      });
      throw error;
    }
    const refreshed = await fetchInvoices();
    if (!refreshed) throw new Error('refresh_failed');
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
    setPlaceLabel,
    setAccountingCategory,
  };
};
