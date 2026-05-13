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
