/**
 * Spajanje uplata iz bankovnog izvoda s izlaznim računima.
 *
 * TVRDO PRAVILO: potvrda spajanja NE stvara ni prihod ni trošak i ne dira
 * saldo ni sidro. Uplata već postoji kao transakcija iz izvoda — ovdje se
 * upisuje samo veza (`eracun_payment_links`) i pokrivenost računa
 * (`settled_amount`, `paid_at`). Ne pretvarati ovo u pisač u `expenses`.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useAppState } from '@/contexts/AppStateContext';
import {
  matchPayments,
  extractIbans,
  remainingOf,
  MATCH_WINDOW_DAYS,
  type MatchCandidate,
  type MatchInvoice,
  type MatchTransaction,
  type PaymentSuggestion,
  type LearnedIban,
} from '@/lib/eracun/matchPayments';
import { applyCountedFilter, isCountedExpenseRow } from '@/lib/countedExpense';
import type { IncomingInvoice } from '@/hooks/useIncomingInvoices';

const EPS = 0.005;
const round2 = (n: number) => Math.round(n * 100) / 100;

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

export interface ConfirmSelection {
  readonly transaction: MatchTransaction;
  readonly candidate: MatchCandidate;
}

export const useEracunPaymentMatch = (invoices: readonly IncomingInvoice[]) => {
  const { user, authReady } = useAuth();
  const { activeBusinessProfileId } = useAppState();
  const [transactions, setTransactions] = useState<MatchTransaction[]>([]);
  const [learnedIbans, setLearnedIbans] = useState<LearnedIban[]>([]);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    if (!authReady || !user) return;
    setLoading(true);
    const since = new Date(Date.now() - (MATCH_WINDOW_DAYS + 30) * 86_400_000)
      .toISOString()
      .slice(0, 10);

    let txQuery = supabase
      .from('expenses')
      .select('id, amount, date, description, merchant_name, expense_nature, deleted_at, status')
      .eq('user_id', user.id)
      .eq('type', 'income')
      .gte('date', since);
    txQuery = applyCountedFilter(txQuery);
    txQuery = activeBusinessProfileId
      ? txQuery.eq('business_profile_id', activeBusinessProfileId)
      : txQuery.is('business_profile_id', null);

    const [{ data: txRows }, { data: linkRows }, { data: ibanRows }] = await Promise.all([
      txQuery,
      supabase.from('eracun_payment_links' as any).select('expense_id, invoice_id, amount').eq('user_id', user.id),
      supabase.from('eracun_counterparty_iban' as any).select('iban, counterparty_oib, counterparty_name').eq('user_id', user.id),
    ]);

    const linked = new Set(((linkRows ?? []) as any[]).map((r) => r.expense_id));
    setTransactions(
      ((txRows ?? []) as any[])
        .filter((r) => isCountedExpenseRow(r))
        .filter((r) => !r.deleted_at && r.expense_nature !== 'correction' && r.expense_nature !== 'transfer')
        .filter((r) => !linked.has(r.id))
        .map((r) => ({
          id: r.id,
          amount: Math.abs(Number(r.amount)),
          date: r.date,
          description: r.description,
          merchantName: r.merchant_name,
        })),
    );
    setLearnedIbans(
      ((ibanRows ?? []) as any[]).map((r) => ({
        iban: r.iban,
        counterpartyOib: r.counterparty_oib,
        counterpartyName: r.counterparty_name,
      })),
    );
    setLoading(false);
  }, [user, authReady, activeBusinessProfileId]);

  useEffect(() => { load(); }, [load]);

  const matchInvoices = useMemo(() => invoices.map(toMatchInvoice), [invoices]);

  const suggestions: PaymentSuggestion[] = useMemo(
    () => matchPayments({ invoices: matchInvoices, transactions, learnedIbans, direction: 'out' }),
    [matchInvoices, transactions, learnedIbans],
  );

  const invoiceById = useMemo(
    () => new Map(invoices.map((i) => [i.id, i])),
    [invoices],
  );

  /** Potvrdi odabrane prijedloge. Vraća broj spojenih uplata. */
  const confirm = useCallback(async (selections: readonly ConfirmSelection[]): Promise<number> => {
    if (!user || selections.length === 0) return 0;

    for (const { transaction, candidate } of selections) {
      const links = candidate.invoiceIds.map((invoiceId) => ({
        user_id: user.id,
        business_profile_id: activeBusinessProfileId,
        invoice_id: invoiceId,
        expense_id: transaction.id,
        amount: round2(candidate.allocation[invoiceId] ?? 0),
        matched_by: candidate.reason,
      })).filter((l) => l.amount > 0);
      if (links.length === 0) continue;

      const { error: linkError } = await supabase.from('eracun_payment_links' as any).insert(links as any);
      if (linkError) throw linkError;

      for (const link of links) {
        const invoice = invoiceById.get(link.invoice_id);
        if (!invoice) continue;
        const settled = round2(Number(invoice.settled_amount ?? 0) + link.amount);
        const covered = settled + EPS >= Number(invoice.total_amount);
        const { error } = await supabase
          .from('incoming_invoices' as any)
          .update({
            settled_amount: settled,
            // `paid_at` tek na potpunom pokriću — do tada račun ostaje
            // nenaplaćen s prikazom „plaćeno X od Y".
            ...(covered ? { paid_at: new Date(transaction.date).toISOString() } : {}),
          })
          .eq('id', link.invoice_id);
        if (error) throw error;

        // Učenje: IBAN platitelja iz opisa → druga strana s računa.
        const iban = extractIbans(transaction.description)[0];
        if (iban) {
          // Jedinstvenost je na (user, iban, profil) — ponovljena potvrda
          // samo osvježava zapis, duplikat nije greška.
          const { error: ibanError } = await supabase.from('eracun_counterparty_iban' as any).insert({
            user_id: user.id,
            business_profile_id: activeBusinessProfileId,
            iban,
            counterparty_oib: invoice.counterparty_oib ?? invoice.supplier_oib,
            counterparty_name: invoice.counterparty_name ?? invoice.supplier_name,
          } as any);
          if (ibanError && String((ibanError as any).code) === '23505') {
            await supabase
              .from('eracun_counterparty_iban' as any)
              .update({ last_seen_at: new Date().toISOString() })
              .eq('user_id', user.id)
              .eq('iban', iban);
          }
        }
      }
    }

    await load();
    return selections.length;
  }, [user, activeBusinessProfileId, invoiceById, load]);

  return { suggestions, transactions, loading, refresh: load, confirm, remainingOf };
};
