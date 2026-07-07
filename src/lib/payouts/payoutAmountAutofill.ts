import { parseAmountFlexible } from '@/lib/amountValidation';

/**
 * Pure helpers for auto-filling the "Isplaćeno" field from the payout preview.
 *
 * Rule (V1-B ownership decision):
 *   - Kad stigne preview, iznos se AUTOMATSKI upiše u polje (stvarni value).
 *   - Korisnik ga i dalje može prepisati (dirty flag).
 *   - Nova preview vrijednost NE prepisuje dirty polje — umjesto toga UI
 *     nudi gumb "Primijeni izračun".
 */

export const formatAutoFillAmount = (gross: number): string => {
  if (!Number.isFinite(gross) || gross < 0) return '';
  return gross.toFixed(2);
};

export interface NextAmountResult {
  nextValue: string;
  clearDirty: boolean;
}

/**
 * Compute the next value of the paid-amount field when a fresh preview arrives.
 *   - Not dirty → auto-fill and reset dirty=false (idempotent).
 *   - Dirty     → keep user's value untouched.
 */
export const nextAmountFromPreview = (
  currentValue: string,
  dirty: boolean,
  grossFromPreview: number | null,
): NextAmountResult => {
  if (grossFromPreview == null) {
    return { nextValue: currentValue, clearDirty: false };
  }
  if (dirty) {
    return { nextValue: currentValue, clearDirty: false };
  }
  return { nextValue: formatAutoFillAmount(grossFromPreview), clearDirty: true };
};

/**
 * Should the "Primijeni izračun" hint be shown? Yes iff the user has diverged
 * from the current preview's gross value.
 */
export const shouldShowApplyCalcHint = (
  currentValue: string,
  grossFromPreview: number | null,
): boolean => {
  if (grossFromPreview == null) return false;
  const parsed = parseAmountFlexible(currentValue);
  if (!parsed.valid) return true;
  return Math.abs(parsed.value - grossFromPreview) > 0.005;
};
