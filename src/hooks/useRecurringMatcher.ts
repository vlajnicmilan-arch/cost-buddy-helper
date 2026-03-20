import { useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { RecurringTransaction } from './useRecurringTransactions';

export interface RecurringMatch {
  transaction: {
    description: string;
    amount: number;
    type: string;
    date: string;
  };
  recurring: RecurringTransaction;
  confidence: 'high' | 'medium';
  source: 'local' | 'ai';
}

/**
 * Local fast matching: same type, similar amount (±5%), similar description
 */
function localMatch(
  tx: { description: string; amount: number; type: string; date: string },
  recurring: RecurringTransaction[]
): RecurringMatch | null {
  const txDesc = tx.description.toLowerCase().trim();
  const txAmount = Math.abs(tx.amount);

  for (const r of recurring) {
    if (!r.is_active) continue;
    if (r.type !== tx.type) continue;

    const rAmount = Math.abs(r.amount);
    const amountDiff = Math.abs(txAmount - rAmount) / Math.max(rAmount, 0.01);
    if (amountDiff > 0.05) continue;

    const rDesc = r.description.toLowerCase().trim();
    const rMerchant = (r.merchant_name || '').toLowerCase().trim();

    // Check description similarity
    const descMatch = rDesc.includes(txDesc) || txDesc.includes(rDesc) ||
      (rMerchant && (txDesc.includes(rMerchant) || rMerchant.includes(txDesc)));

    // Check word overlap
    const txWords = txDesc.split(/\s+/).filter(w => w.length > 2);
    const rWords = [...rDesc.split(/\s+/), ...rMerchant.split(/\s+/)].filter(w => w.length > 2);
    const overlap = txWords.filter(w => rWords.some(rw => rw.includes(w) || w.includes(rw))).length;
    const wordMatch = txWords.length > 0 && overlap / txWords.length >= 0.5;

    if (descMatch || wordMatch) {
      const isExactAmount = amountDiff < 0.001;
      return {
        transaction: tx,
        recurring: r,
        confidence: isExactAmount && descMatch ? 'high' : 'medium',
        source: 'local',
      };
    }
  }
  return null;
}

export const useRecurringMatcher = () => {
  /**
   * Match transactions against active recurring transactions.
   * First tries local matching, then AI for unmatched ones.
   */
  const findMatches = useCallback(async (
    transactions: Array<{ description: string; amount: number; type: string; date: string }>,
    recurringTransactions: RecurringTransaction[]
  ): Promise<RecurringMatch[]> => {
    const activeRecurring = recurringTransactions.filter(r => r.is_active);
    if (transactions.length === 0 || activeRecurring.length === 0) return [];

    const results: RecurringMatch[] = [];
    const matchedRecurringIds = new Set<string>();
    const unmatchedTxs: typeof transactions = [];
    const unmatchedIndices: number[] = [];

    // Local matching first
    for (let i = 0; i < transactions.length; i++) {
      const tx = transactions[i];
      const remaining = activeRecurring.filter(r => !matchedRecurringIds.has(r.id));
      const match = localMatch(tx, remaining);
      if (match) {
        results.push(match);
        matchedRecurringIds.add(match.recurring.id);
      } else {
        unmatchedTxs.push(tx);
        unmatchedIndices.push(i);
      }
    }

    // AI matching for remaining (max 20)
    if (unmatchedTxs.length > 0) {
      const remainingRecurring = activeRecurring.filter(r => !matchedRecurringIds.has(r.id));
      if (remainingRecurring.length > 0) {
        try {
          const batch = unmatchedTxs.slice(0, 20);
          const { data, error } = await supabase.functions.invoke('match-recurring', {
            body: {
              transactions: batch,
              recurringTransactions: remainingRecurring.map(r => ({
                description: r.description,
                amount: r.amount,
                type: r.type,
                frequency: r.frequency,
                next_due_date: r.next_due_date,
                merchant_name: r.merchant_name,
              })),
            },
          });

          if (!error && data?.matches) {
            for (const m of data.matches) {
              const tx = batch[m.transaction_index - 1];
              const rec = remainingRecurring[m.recurring_index - 1];
              if (tx && rec && !matchedRecurringIds.has(rec.id)) {
                results.push({
                  transaction: tx,
                  recurring: rec,
                  confidence: m.confidence || 'medium',
                  source: 'ai',
                });
                matchedRecurringIds.add(rec.id);
              }
            }
          }
        } catch (e) {
          console.error('AI recurring match failed:', e);
        }
      }
    }

    return results;
  }, []);

  return { findMatches };
};
