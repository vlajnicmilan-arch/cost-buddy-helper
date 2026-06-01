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

              // Post-validacija: iznos mora biti identičan
              const txAmt = Math.abs(tx.amount);
              const recAmt = Math.abs(rec.amount);
              const amtDiff = Math.abs(txAmt - recAmt) / Math.max(recAmt, 0.01);
              if (amtDiff > 0.001) continue; // Odbaci ako iznos nije identičan

              // Post-validacija: tip mora biti isti
              if (tx.type !== rec.type) continue;

              // Post-validacija: barem 1 zajednička riječ (≥3 slova)
              const txWords = tx.description.toLowerCase().split(/\s+/).filter(w => w.length >= 3);
              const recWords = [...rec.description.toLowerCase().split(/\s+/), ...(rec.merchant_name || '').toLowerCase().split(/\s+/)].filter(w => w.length >= 3);
              const hasWordOverlap = txWords.some(tw => recWords.some(rw => rw.includes(tw) || tw.includes(rw)));
              if (!hasWordOverlap) continue;

              // Confidence override: "high" samo ako opis sadrži podstring
              const txDesc = tx.description.toLowerCase().trim();
              const recDesc = rec.description.toLowerCase().trim();
              const recMerchant = (rec.merchant_name || '').toLowerCase().trim();
              const descSubstring = recDesc.includes(txDesc) || txDesc.includes(recDesc) ||
                (recMerchant && (txDesc.includes(recMerchant) || recMerchant.includes(txDesc)));
              const confidence: 'high' | 'medium' = descSubstring ? 'high' : 'medium';

              results.push({
                transaction: tx,
                recurring: rec,
                confidence,
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
