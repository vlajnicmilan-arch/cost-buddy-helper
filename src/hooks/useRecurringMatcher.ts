import { useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { RecurringTransaction } from './useRecurringTransactions';
import { localMatch } from '@/lib/recurringMatching';
import { validateAiRecurringMatch } from '@/lib/validateAiRecurringMatch';

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
              if (!tx || !rec || matchedRecurringIds.has(rec.id)) continue;

              const validation = validateAiRecurringMatch(tx, {
                description: rec.description,
                merchant_name: rec.merchant_name,
                amount: rec.amount,
                type: rec.type,
              });
              if (!validation.accept) continue;

              results.push({
                transaction: tx,
                recurring: rec,
                confidence: validation.confidence,
                source: 'ai',
              });
              matchedRecurringIds.add(rec.id);
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
