/**
 * Shared amount-input validation used by AddExpenseDialog and other forms.
 *
 * Historically these helpers only handled comma↔dot swaps. They now delegate
 * to the shared locale-aware parser in `src/lib/money.ts`, which additionally
 * accepts EU/US thousands separators ("1.234,56", "1,234.56") and rejects
 * multiple decimal groups like "12,34,56".
 *
 * Public API is preserved for backwards compatibility.
 */
import {
  parseLocaleAmount,
  parseMoneyStrict,
  parseMoneyAllowZero,
} from '@/lib/money';

export interface AmountValidationResult {
  valid: boolean;
  value: number;
}

/**
 * Normalise a user-entered money string into a canonical dot-decimal form.
 * Returns the original string when the input is empty or cannot be parsed —
 * callers that need strict validation should use `validateAmountInput`.
 */
export const normalizeAmountInput = (raw: string): string => {
  const s = raw ?? '';
  if (s === '') return '';
  const r = parseLocaleAmount(s);
  if (!r.valid) return s.replace(',', '.');
  // Preserve trailing zeroes the user typed (e.g. "12,50" → "12.50")
  const commaIdx = s.lastIndexOf(',');
  const dotIdx = s.lastIndexOf('.');
  const sepIdx = Math.max(commaIdx, dotIdx);
  if (sepIdx >= 0) {
    const decLen = s.length - sepIdx - 1;
    if (decLen > 0 && decLen <= 2) return r.value.toFixed(decLen);
  }
  return String(r.value);
};

/**
 * Strict positive amount (used by AddExpenseDialog etc.). Rejects 0, negatives,
 * empty, and non-numeric input.
 */
export const validateAmountInput = (raw: string): AmountValidationResult =>
  parseMoneyStrict(raw);

/**
 * Non-negative amount (used by payouts where 0 is a legal partial value).
 */
export const parseAmountFlexible = (raw: string): AmountValidationResult =>
  parseMoneyAllowZero(raw);
