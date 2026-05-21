/**
 * Pure helpers extracted from useRecurringMatcher for unit testing.
 *
 * `useRecurringMatcher` depends on supabase.functions.invoke, but the
 * matching brain — local fast match + previous-due calculation — is
 * pure and lives here so it can be regression-tested without mocks.
 */

import type { RecurringTransaction } from '@/hooks/useRecurringTransactions';

export const DAY_MS = 86400000;

export interface RecurringMatchTx {
  description: string;
  amount: number;
  type: string;
  date: string;
}

export interface RecurringMatchResult {
  transaction: RecurringMatchTx;
  recurring: RecurringTransaction;
  confidence: 'high' | 'medium';
  source: 'local';
}

/**
 * Subtract one frequency period from `nextDue`. Returns null for invalid dates.
 * Unknown frequencies default to monthly (matches hook behaviour).
 */
export function calculatePreviousDueDate(nextDue: string, frequency: string): Date | null {
  const d = new Date(nextDue);
  if (isNaN(d.getTime())) return null;
  switch (frequency) {
    case 'weekly': d.setDate(d.getDate() - 7); break;
    case 'biweekly': d.setDate(d.getDate() - 14); break;
    case 'monthly': d.setMonth(d.getMonth() - 1); break;
    case 'quarterly': d.setMonth(d.getMonth() - 3); break;
    case 'semi-annually': d.setMonth(d.getMonth() - 6); break;
    case 'yearly': d.setFullYear(d.getFullYear() - 1); break;
    default: d.setMonth(d.getMonth() - 1); break;
  }
  return d;
}

/**
 * Local fast matching: same type, identical amount (±0.1% float tolerance),
 * similar description, within ±5 days of next or previous due date.
 */
export function localMatch(
  tx: RecurringMatchTx,
  recurring: RecurringTransaction[]
): RecurringMatchResult | null {
  const txDesc = tx.description.toLowerCase().trim();
  const txAmount = Math.abs(tx.amount);
  const txDate = new Date(tx.date);

  for (const r of recurring) {
    if (!r.is_active) continue;
    if (r.type !== tx.type) continue;

    const rAmount = Math.abs(r.amount);
    const amountDiff = Math.abs(txAmount - rAmount) / Math.max(rAmount, 0.01);
    if (amountDiff > 0.001) continue;

    const rDesc = r.description.toLowerCase().trim();
    const rMerchant = (r.merchant_name || '').toLowerCase().trim();

    const descMatch = rDesc.includes(txDesc) || txDesc.includes(rDesc) ||
      (rMerchant && (txDesc.includes(rMerchant) || rMerchant.includes(txDesc)));

    const txWords = txDesc.split(/\s+/).filter(w => w.length > 2);
    const rWords = [...rDesc.split(/\s+/), ...rMerchant.split(/\s+/)].filter(w => w.length > 2);
    const overlap = txWords.filter(w => rWords.some(rw => rw.includes(w) || w.includes(rw))).length;
    const wordMatch = txWords.length > 0 && overlap / txWords.length >= 0.5;

    if (descMatch || wordMatch) {
      let dateClose = false;
      if (r.next_due_date) {
        const nextDue = new Date(r.next_due_date);
        const dayDiffNext = Math.abs(txDate.getTime() - nextDue.getTime()) / DAY_MS;
        if (dayDiffNext <= 5) dateClose = true;

        if (!dateClose) {
          const prevDue = calculatePreviousDueDate(r.next_due_date, r.frequency);
          if (prevDue) {
            const dayDiffPrev = Math.abs(txDate.getTime() - prevDue.getTime()) / DAY_MS;
            if (dayDiffPrev <= 5) dateClose = true;
          }
        }
      }

      const isExactAmount = amountDiff < 0.001;
      return {
        transaction: tx,
        recurring: r,
        confidence: isExactAmount && descMatch && dateClose ? 'high' : 'medium',
        source: 'local',
      };
    }
  }
  return null;
}
