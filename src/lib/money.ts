/**
 * Locale-tolerant money parser used by all money-input fields.
 *
 * Accepts:
 *   - Croatian / EU format:  "1.234,56"  →  1234.56
 *   - US format:             "1,234.56"  →  1234.56
 *   - Plain decimal:         "12,50" or "12.50" → 12.5
 *   - Integer:               "10" → 10
 *   - Negative:              "-5,50" → -5.5
 *   - Optional currency symbols/whitespace: "€ 12,50" → 12.5
 *
 * Rejects:
 *   - Empty / whitespace only
 *   - Multiple decimal groups: "12,34,56", "12.34.56"
 *   - Non-numeric garbage: "abc", "1.2.3.4"
 *   - NaN / Infinity
 *
 * The parser NEVER changes the semantic value — it only widens which string
 * representations are accepted. Downstream balance/writer logic is untouched.
 */

export interface MoneyParseResult {
  valid: boolean;
  value: number;
}

const CURRENCY_STRIP = /[€$£¥₺₽₹\s]|kn|hrk|eur|usd|gbp/gi;

const isSafeNumber = (n: number): boolean => Number.isFinite(n);

/**
 * Core parser. See file-level docs for accepted formats.
 * Callers that want to allow zero should use `parseMoneyAllowZero` instead.
 */
export const parseLocaleAmount = (raw: unknown): MoneyParseResult => {
  if (raw === null || raw === undefined) return { valid: false, value: 0 };
  const asString = typeof raw === 'number' ? String(raw) : String(raw);
  const trimmed = asString.replace(CURRENCY_STRIP, '').trim();
  if (trimmed === '') return { valid: false, value: 0 };

  // Only digits, comma, dot, minus allowed
  if (!/^-?[\d.,]+$/.test(trimmed)) return { valid: false, value: 0 };

  // Reject leading minus without digits or multiple minuses
  if ((trimmed.match(/-/g) || []).length > 1) return { valid: false, value: 0 };
  if (trimmed.startsWith('-') && trimmed.length === 1) return { valid: false, value: 0 };

  const negative = trimmed.startsWith('-');
  let body = negative ? trimmed.slice(1) : trimmed;

  const commaCount = (body.match(/,/g) || []).length;
  const dotCount = (body.match(/\./g) || []).length;

  let normalized: string;

  if (commaCount === 0 && dotCount === 0) {
    normalized = body;
  } else if (commaCount > 0 && dotCount > 0) {
    // Mixed → decimal separator is the LAST occurring one; the other is thousands.
    const lastComma = body.lastIndexOf(',');
    const lastDot = body.lastIndexOf('.');
    if (lastComma > lastDot) {
      // European: dots = thousands, comma = decimal
      if ((body.match(/,/g) || []).length !== 1) return { valid: false, value: 0 };
      normalized = body.replace(/\./g, '').replace(',', '.');
    } else {
      // US: commas = thousands, dot = decimal
      if ((body.match(/\./g) || []).length !== 1) return { valid: false, value: 0 };
      normalized = body.replace(/,/g, '');
    }
  } else if (commaCount > 0) {
    // Only commas
    if (commaCount === 1) {
      const [intPart, decPart] = body.split(',');
      if (intPart.length > 0 && (decPart.length <= 2 || decPart.length > 3)) {
        // Decimal: "12,50" or unusual precision like "12,3456"
        normalized = `${intPart}.${decPart}`;
      } else if (decPart.length === 3 && intPart.length > 0 && intPart.length <= 3) {
        // Ambiguous "1,234" → treat as thousands (US convention)
        normalized = intPart + decPart;
      } else {
        return { valid: false, value: 0 };
      }
    } else {
      // Multiple commas: must be thousands groups
      const parts = body.split(',');
      const head = parts[0];
      const rest = parts.slice(1);
      if (head.length < 1 || head.length > 3) return { valid: false, value: 0 };
      if (!rest.every((p) => p.length === 3)) return { valid: false, value: 0 };
      normalized = parts.join('');
    }
  } else {
    // Only dots
    if (dotCount === 1) {
      // Always treat single dot as decimal separator (preserves parseFloat semantics).
      // EU thousands "1.234" is ambiguous with decimal — only multi-dot form implies thousands.
      normalized = body;
    } else {
      // Multiple dots: EU thousands "1.234.567"
      const parts = body.split('.');
      const head = parts[0];
      const rest = parts.slice(1);
      if (head.length < 1 || head.length > 3) return { valid: false, value: 0 };
      if (!rest.every((p) => p.length === 3)) return { valid: false, value: 0 };
      normalized = parts.join('');
    }
  }

  const value = parseFloat(normalized);
  if (!isSafeNumber(value)) return { valid: false, value: 0 };
  const signed = negative ? -value : value;
  return { valid: true, value: signed };
};

/**
 * Strict positive money (rejects 0 and negatives). Suitable for most amount fields.
 */
export const parseMoneyStrict = (raw: unknown): MoneyParseResult => {
  const r = parseLocaleAmount(raw);
  if (!r.valid || r.value <= 0) return { valid: false, value: 0 };
  return r;
};

/**
 * Non-negative money (allows 0). Suitable for partial-payout / correction inputs.
 */
export const parseMoneyAllowZero = (raw: unknown): MoneyParseResult => {
  const r = parseLocaleAmount(raw);
  if (!r.valid || r.value < 0) return { valid: false, value: 0 };
  return r;
};

/**
 * Signed money (allows negatives, e.g. balance corrections that reduce a wallet).
 */
export const parseMoneySigned = (raw: unknown): MoneyParseResult => parseLocaleAmount(raw);

/**
 * Sanitize a raw user keystroke to only characters that could be part of a
 * money string. Used by MoneyInput to filter onChange in a UX-friendly way.
 * Keeps the value as a plain string; final parsing happens on submit/blur.
 */
export const sanitizeMoneyKeystroke = (raw: string): string => {
  if (!raw) return '';
  // Keep digits, comma, dot, single leading minus.
  let out = raw.replace(/[^\d.,-]/g, '');
  // Only one leading minus
  const negative = out.startsWith('-');
  out = out.replace(/-/g, '');
  return (negative ? '-' : '') + out;
};
