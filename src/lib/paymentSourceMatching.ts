import { CustomPaymentSource } from '@/types/customPaymentSource';

const normalize = (s: string) =>
  s
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '');

const SYNONYMS: Record<string, string[]> = {
  cash: ['gotovina', 'cash', 'kes', 'kas', 'bargeld'],
  card: ['kartica', 'card', 'debitna', 'kreditna', 'visa', 'mastercard', 'maestro', 'karte', 'kreditkarte'],
  bank: ['banka', 'bank', 'ziroracun', 'ziro', 'transakcijski', 'tekuci', 'bankkonto'],
};

/**
 * Returns the first custom payment source whose (normalized) name matches
 * a synonym for the given standard payment method. Used so that when the
 * receipt scanner (or any AI flow) detects e.g. payment_method = "cash" and
 * the user already has a custom source named "Gotovina", we prefer the
 * custom source instead of the generic standard.
 */
export function matchCustomByMethod(
  method: 'cash' | 'card' | 'bank',
  sources: CustomPaymentSource[],
): CustomPaymentSource | null {
  const targets = SYNONYMS[method] || [];
  if (targets.length === 0) return null;
  return sources.find((s) => targets.includes(normalize(s.name))) || null;
}
