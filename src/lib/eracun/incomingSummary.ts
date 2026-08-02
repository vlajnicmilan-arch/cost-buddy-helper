/**
 * eRačun v1 — sažetak neplaćenih ulaznih računa za biznis dashboard.
 *
 * TVRDO PRAVILO: ulazni račun je OBVEZA, ne trošak. Ovi zbrojevi služe
 * isključivo prikazu u zasebnom bloku i ne ulaze ni u jedan dashboard
 * izračun (dobit, trošak, saldo, marža, izvještaji). Trošak nastaje tek
 * kroz „Plaćeno" → `addExpense`.
 */
import { daysUntilDue } from './sortInvoices';

export interface SummarizableIncomingInvoice {
  readonly due_date: string | null;
  readonly paid_at: string | null;
  readonly total_amount: number | string;
}

export interface IncomingInvoicesSummary {
  /** Broj neplaćenih računa. */
  count: number;
  /** Ukupan iznos neplaćenih. */
  total: number;
  /** Broj neplaćenih kojima je dospijeće prošlo. */
  overdueCount: number;
  /** Iznos onih koji kasne. */
  overdueTotal: number;
  /** Najbliže buduće dospijeće (ISO datum), `null` ako ga nema. */
  nextDueDate: string | null;
  /** Dana do najbližeg dospijeća (>= 0), `null` ako nema. */
  nextDueInDays: number | null;
}

const toAmount = (value: number | string): number => {
  const n = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(n) ? Math.abs(n) : 0;
};

export const summarizeIncomingInvoices = (
  invoices: readonly SummarizableIncomingInvoice[],
  today: Date = new Date(),
): IncomingInvoicesSummary => {
  const summary: IncomingInvoicesSummary = {
    count: 0,
    total: 0,
    overdueCount: 0,
    overdueTotal: 0,
    nextDueDate: null,
    nextDueInDays: null,
  };

  invoices.forEach((inv) => {
    if (inv.paid_at) return;
    const amount = toAmount(inv.total_amount);
    summary.count += 1;
    summary.total += amount;

    const days = daysUntilDue(inv.due_date, today);
    if (days === null) return;
    if (days < 0) {
      summary.overdueCount += 1;
      summary.overdueTotal += amount;
      return;
    }
    if (summary.nextDueInDays === null || days < summary.nextDueInDays) {
      summary.nextDueInDays = days;
      summary.nextDueDate = inv.due_date;
    }
  });

  return summary;
};
