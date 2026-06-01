/**
 * Pure post-validation za AI-predložene recurring matcheve.
 * Ekstrahirano iz useRecurringMatcher kako bi se moglo unit-testirati bez Supabase mockova.
 *
 * Pravila (sva moraju proći za accept=true):
 *  1. Iznos: |tx.amount - rec.amount| / max(rec.amount, 0.01) ≤ 0.001 (0.1% tolerance)
 *  2. Tip: tx.type === rec.type
 *  3. Word overlap: barem 1 zajednička riječ ≥3 znaka između tx.description i
 *     (rec.description + rec.merchant_name); match je dvosmjerni includes (substring).
 *
 * Confidence:
 *  - "high" ako je opis transakcije podstring opisa/merchanta recurringa (ili obrnuto)
 *  - "medium" inače
 */

export interface RecurringValidationTx {
  description: string;
  amount: number;
  type: string;
}

export interface RecurringValidationRec {
  description: string;
  merchant_name?: string | null;
  amount: number;
  type: string;
}

export interface RecurringValidationResult {
  accept: boolean;
  confidence: 'high' | 'medium';
  reason?: 'amount' | 'type' | 'word_overlap';
}

const AMOUNT_TOLERANCE = 0.001; // 0.1%
const MIN_WORD_LEN = 3;

const tokenize = (s: string): string[] =>
  s.toLowerCase().split(/\s+/).filter((w) => w.length >= MIN_WORD_LEN);

export const validateAiRecurringMatch = (
  tx: RecurringValidationTx,
  rec: RecurringValidationRec
): RecurringValidationResult => {
  // 1. Amount within tolerance
  const txAmt = Math.abs(tx.amount);
  const recAmt = Math.abs(rec.amount);
  const amtDiff = Math.abs(txAmt - recAmt) / Math.max(recAmt, 0.01);
  if (amtDiff > AMOUNT_TOLERANCE) {
    return { accept: false, confidence: 'medium', reason: 'amount' };
  }

  // 2. Type match
  if (tx.type !== rec.type) {
    return { accept: false, confidence: 'medium', reason: 'type' };
  }

  // 3. Word overlap (≥3 chars, bidirectional substring)
  const txWords = tokenize(tx.description);
  const recWords = [
    ...tokenize(rec.description),
    ...tokenize(rec.merchant_name || ''),
  ];
  const hasWordOverlap = txWords.some((tw) =>
    recWords.some((rw) => rw.includes(tw) || tw.includes(rw))
  );
  if (!hasWordOverlap) {
    return { accept: false, confidence: 'medium', reason: 'word_overlap' };
  }

  // Confidence: "high" only if description/merchant is bidirectional substring
  const txDesc = tx.description.toLowerCase().trim();
  const recDesc = rec.description.toLowerCase().trim();
  const recMerchant = (rec.merchant_name || '').toLowerCase().trim();
  const descSubstring =
    recDesc.includes(txDesc) ||
    txDesc.includes(recDesc) ||
    (!!recMerchant && (txDesc.includes(recMerchant) || recMerchant.includes(txDesc)));

  return {
    accept: true,
    confidence: descSubstring ? 'high' : 'medium',
  };
};
