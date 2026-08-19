/**
 * Povezivanje POSTOJEĆIH troškova s ulaznim računima (`direction = 'in'`).
 *
 * TVRDO PRAVILO: povezivanje NIKAD ne dira `expenses`. Trošak već postoji
 * (ručni unos ili uvoz izvoda); ovdje se piše samo veza u
 * `eracun_payment_links` i pokrivenost na `incoming_invoices`. Svaki UPDATE
 * nad `expenses` budi motor salda/sidra — ne pretvarati ovo u pisač.
 *
 * Sav upis ide kroz RPC-ove `eracun_link_existing_expense` /
 * `eracun_unlink_expense` koji nose sve provjere (kontekst, valuta, prozor,
 * neiskorišteni dio troška).
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useAppState } from '@/contexts/AppStateContext';
import { buildExpenseScopeFilter, type ScopeContext } from '@/lib/expenseScope';
import { applyCountedFilter, isCountedExpenseRow } from '@/lib/countedExpense';
import {
  matchPayments,
  paymentFetchWindow,
  remainingOf,
  type MatchInvoice,
  type MatchTransaction,
  type PaymentSuggestion,
} from '@/lib/eracun/matchPayments';
import type { IncomingInvoice } from '@/hooks/useIncomingInvoices';

export interface LinkedExpenseRow {
  readonly invoiceId: string;
  readonly expenseId: string;
  readonly amount: number;
  readonly description: string | null;
  readonly date: string | null;
}

const toMatchInvoice = (row: IncomingInvoice): MatchInvoice => ({
  id: row.id,
  direction: (row.direction ?? 'in') as 'in' | 'out',
  invoiceNumber: row.invoice_number,
  counterpartyName: row.counterparty_name ?? row.supplier_name,
  counterpartyOib: row.counterparty_oib ?? row.supplier_oib,
  paymentReference: row.payment_reference,
  totalAmount: Number(row.total_amount),
  settledAmount: row.settled_amount == null ? 0 : Number(row.settled_amount),
  issueDate: row.issue_date,
  paidAt: row.paid_at,
});

export const useEracunExpenseMatch = (invoices: readonly IncomingInvoice[]) => {
  const { user, authReady } = useAuth();
  const { activeBusinessProfileId } = useAppState();
  const [expenses, setExpenses] = useState<MatchTransaction[]>([]);
  const [links, setLinks] = useState<LinkedExpenseRow[]>([]);
  const [loading, setLoading] = useState(false);

  const matchInvoices = useMemo(() => invoices.map(toMatchInvoice), [invoices]);
  const fetchWindow = useMemo(() => paymentFetchWindow(matchInvoices, 'in'), [matchInvoices]);

  /**
   * P0 — bez `buildExpenseScopeFilter` u kandidate cure tuđi projektni redci
   * kroz `is_project_member` granu RLS-a. Filtar je obavezan, ne opcija.
   */
  const scopeFilter = useCallback(async (): Promise<string | null> => {
    if (!user) return null;
    const [ownedRes, memberRes] = await Promise.all([
      supabase.from('custom_payment_sources').select('id').eq('user_id', user.id),
      supabase.from('payment_source_members').select('payment_source_id').eq('user_id', user.id),
    ]);
    const sharedIds = new Set<string>();
    (ownedRes.data || []).forEach((s: any) => sharedIds.add(s.id));
    (memberRes.data || []).forEach((m: any) => sharedIds.add(m.payment_source_id));
    const ctx: ScopeContext = { userId: user.id, sharedPaymentSourceIds: sharedIds };
    return buildExpenseScopeFilter(ctx);
  }, [user]);

  const load = useCallback(async () => {
    if (!authReady || !user) return;
    setLoading(true);

    const { data: linkRows } = await supabase
      .from('eracun_payment_links' as any)
      .select('invoice_id, expense_id, amount')
      .eq('user_id', user.id);
    const linkedIds = new Set(((linkRows ?? []) as any[]).map((r) => r.expense_id));

    // Prozor je sidren na račune (`paymentFetchWindow`), nikad na današnji dan.
    if (!fetchWindow) {
      setExpenses([]);
      setLinks([]);
      setLoading(false);
      return;
    }

    const filter = await scopeFilter();
    let q: any = (supabase.from('expenses') as any)
      .select('id, amount, date, description, merchant_name, expense_nature, deleted_at, status, type')
      .eq('type', 'expense');
    if (filter) q = q.or(filter);
    if (fetchWindow.since) q = q.gte('date', fetchWindow.since);
    if (fetchWindow.until) q = q.lte('date', fetchWindow.until);
    q = applyCountedFilter(q);
    q = activeBusinessProfileId
      ? q.eq('business_profile_id', activeBusinessProfileId)
      : q.is('business_profile_id', null);

    const { data: rows } = await q;

    setExpenses(
      ((rows ?? []) as any[])
        .filter((r) => isCountedExpenseRow(r))
        .filter((r) => !r.deleted_at && r.expense_nature !== 'correction' && r.expense_nature !== 'transfer')
        .filter((r) => !linkedIds.has(r.id))
        .map((r) => ({
          id: r.id,
          amount: Math.abs(Number(r.amount)),
          date: r.date,
          description: r.description,
          merchantName: r.merchant_name,
        })),
    );

    // Povezani troškovi (za odvezivanje) — dohvat opisa po id-evima.
    const linkedList = (linkRows ?? []) as any[];
    if (linkedList.length > 0) {
      const { data: linkedExpenses } = await applyCountedFilter(
        (supabase.from('expenses') as any)
          .select('id, description, date, status')
          .in('id', linkedList.map((l) => l.expense_id)),
      );
      const byId = new Map(((linkedExpenses ?? []) as any[]).map((e) => [e.id, e]));
      setLinks(
        linkedList.map((l) => ({
          invoiceId: l.invoice_id,
          expenseId: l.expense_id,
          amount: Number(l.amount),
          description: byId.get(l.expense_id)?.description ?? null,
          date: byId.get(l.expense_id)?.date ?? null,
        })),
      );
    } else {
      setLinks([]);
    }

    setLoading(false);
  }, [authReady, user, activeBusinessProfileId, fetchWindow, scopeFilter]);

  useEffect(() => { load(); }, [load]);

  const suggestions: PaymentSuggestion[] = useMemo(
    () =>
      matchPayments({
        invoices: matchInvoices,
        transactions: expenses,
        direction: 'in',
        allowAmountOnly: true,
      }),
    [matchInvoices, expenses],
  );

  /** Prijedlozi za jedan račun — okrenuti iz „po trošku" u „po računu". */
  const suggestionsForInvoice = useCallback(
    (invoiceId: string) =>
      suggestions
        .filter((s) => s.candidates.some((c) => c.invoiceIds.includes(invoiceId)))
        .map((s) => {
          const candidate = s.candidates.find((c) => c.invoiceIds.includes(invoiceId))!;
          return {
            transaction: expenses.find((e) => e.id === s.transactionId)!,
            candidate,
            amount: Number(candidate.allocation[invoiceId] ?? 0),
          };
        })
        .filter((x) => !!x.transaction && x.amount > 0)
        .sort((a, b) => {
          const rank: Record<string, number> = { certain: 0, strong: 1, likely: 2, possible: 3 };
          return rank[a.candidate.confidence] - rank[b.candidate.confidence];
        }),
    [suggestions, expenses],
  );

  /**
   * IZOŠTRENA PONUDA — isti kandidati, ali suženi datumskim prozorom oko
   * `issue_date` računa i rangirani po podudaranju naziva. Jednoznačan par
   * dobiva istaknut prijedlog; odluka je i dalje ISKLJUČIVO korisnikov dodir.
   */
  const offerForInvoice = useCallback(
    (invoiceId: string): LinkOffer => {
      const inv = invoices.find((i) => i.id === invoiceId);
      if (!inv) return { rows: [], highlight: null };
      const toOfferInvoice = (row: IncomingInvoice): LinkOfferInvoice => ({
        id: row.id,
        supplierName: row.counterparty_name ?? row.supplier_name ?? null,
        remaining:
          Math.round((Number(row.total_amount) - Number(row.settled_amount ?? 0)) * 100) / 100,
        issueDate: row.issue_date ?? null,
      });
      return buildLinkOffer({
        invoice: toOfferInvoice(inv),
        candidates: suggestionsForInvoice(invoiceId).map((s) => ({
          transaction: s.transaction,
          amount: s.amount,
          confidence: s.candidate.confidence,
        })),
        otherInvoices: invoices
          .filter((i) => i.id !== invoiceId && !i.paid_at)
          .map(toOfferInvoice),
      });
    },
    [invoices, suggestionsForInvoice],
  );

  const linksForInvoice = useCallback(
    (invoiceId: string) => links.filter((l) => l.invoiceId === invoiceId),
    [links],
  );

  const linkExpense = useCallback(async (invoiceId: string, expenseId: string, amount: number) => {
    const { error } = await supabase.rpc('eracun_link_existing_expense' as any, {
      p_invoice_id: invoiceId,
      p_expense_id: expenseId,
      p_amount: amount,
    } as any);
    if (error) throw error;
    await load();
  }, [load]);

  const unlinkExpense = useCallback(async (invoiceId: string, expenseId: string) => {
    const { error } = await supabase.rpc('eracun_unlink_expense' as any, {
      p_invoice_id: invoiceId,
      p_expense_id: expenseId,
    } as any);
    if (error) throw error;
    await load();
  }, [load]);

  /** Ručna pretraga po opisu / iznosu / datumu — ravnopravan put uz prijedloge. */
  const searchExpenses = useCallback(
    (query: string): MatchTransaction[] => {
      const q = query.trim().toLowerCase();
      if (!q) return [];
      const asNumber = Number(q.replace(',', '.'));
      return expenses
        .filter((e) => {
          if (!Number.isNaN(asNumber) && asNumber > 0 && Math.abs(e.amount - asNumber) <= 0.005) return true;
          const haystack = `${e.description ?? ''} ${e.merchantName ?? ''} ${e.date ?? ''}`.toLowerCase();
          return haystack.includes(q);
        })
        .slice(0, 50);
    },
    [expenses],
  );

  return {
    loading,
    expenses,
    suggestions,
    suggestionsForInvoice,
    linksForInvoice,
    linkExpense,
    unlinkExpense,
    searchExpenses,
    refresh: load,
    remainingOf,
  };
};
