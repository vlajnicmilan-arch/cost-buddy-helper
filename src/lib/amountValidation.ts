/**
 * Shared amount-input validation used by AddExpenseDialog and other forms.
 * Accepts comma or dot as decimal separator. Rejects 0, negatives, NaN, Infinity.
 */
export interface AmountValidationResult {
  valid: boolean;
  value: number;
}

export const normalizeAmountInput = (raw: string): string => {
  return (raw ?? '').replace(',', '.');
};

export const validateAmountInput = (raw: string): AmountValidationResult => {
  const normalized = normalizeAmountInput(raw);
  const value = parseFloat(normalized);
  const valid = Number.isFinite(value) && value > 0;
  return { valid, value };
};

/**
 * Like validateAmountInput but allows 0 (used for payouts where a partial
 * amount could technically be 0 — the RPC accepts >= 0 and derives status).
 * Accepts both `,` and `.` as decimal separator; rejects empty / NaN / negative.
 */
export const parseAmountFlexible = (raw: string): AmountValidationResult => {
  const trimmed = (raw ?? '').trim();
  if (trimmed === '') return { valid: false, value: 0 };
  const normalized = normalizeAmountInput(trimmed);
  const value = parseFloat(normalized);
  const valid = Number.isFinite(value) && value >= 0;
  return { valid, value };
};
