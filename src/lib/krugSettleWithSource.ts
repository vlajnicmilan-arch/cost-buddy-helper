/**
 * Pure helpers for the debtor side of "Krug settlement with source".
 * The RPC krug_mark_settled_with_source is the only writer; these helpers
 * decide what the dialog may send and how server errors are shown.
 */

export type SourceRole = 'owner' | 'full' | 'limited' | 'viewer' | null | undefined;

export interface SettleSourceOption {
  id: string;
  name: string;
  currency?: string | null;
  myRole?: SourceRole;
}

/** Mirrors can_write_payment_source: owner, full and limited/member may write; viewer may not. */
export const canWriteSource = (role: SourceRole): boolean =>
  role === 'owner' || role === 'full' || role === 'limited';

export const writableSettleSources = <T extends SettleSourceOption>(sources: T[]): T[] =>
  sources.filter((s) => canWriteSource(s.myRole));

/** Same normalisation as the RPC: empty/NULL currency counts as EUR. */
export const normalizeCurrency = (c: string | null | undefined): string => {
  const v = (c ?? '').trim().toUpperCase();
  return v.length > 0 ? v : 'EUR';
};

export const needsPayerAmount = (sourceCurrency: string | null | undefined, settlementCurrency: string): boolean =>
  normalizeCurrency(sourceCurrency) !== normalizeCurrency(settlementCurrency);

/**
 * Hint conversion using an EUR-based snapshot (rates[X] = units of X per 1 EUR),
 * the same formula as krug_settlement_preview. Returns null when a rate is missing.
 * Never written automatically — display only.
 */
export const convertBySnapshot = (
  amount: number,
  from: string,
  to: string,
  rates: Record<string, unknown> | null | undefined,
): number | null => {
  if (!rates) return null;
  const rFrom = Number(rates[normalizeCurrency(from)]);
  const rTo = Number(rates[normalizeCurrency(to)]);
  if (!Number.isFinite(rFrom) || !Number.isFinite(rTo) || rFrom <= 0 || rTo <= 0) return null;
  return Math.round((amount / rFrom) * rTo * 100) / 100;
};

export const parsePayerAmount = (raw: string): number | null => {
  const n = Number(raw.replace(',', '.').trim());
  return Number.isFinite(n) && n > 0 ? n : null;
};

export interface SettleSubmitState {
  sourceId: string | null;
  sourceCurrency: string | null | undefined;
  settlementCurrency: string;
  payerAmountRaw: string;
}

/** The dialog may submit only with a source, and with a paid amount when currencies differ. */
export const canSubmitSettle = (s: SettleSubmitState): boolean => {
  if (!s.sourceId) return false;
  if (needsPayerAmount(s.sourceCurrency, s.settlementCurrency)) {
    return parsePayerAmount(s.payerAmountRaw) !== null;
  }
  return true;
};

/** Every server code the settle/void RPCs raise that has a dedicated message. */
export const KRUG_SETTLE_ERROR_CODES = [
  'only_debtor_can_settle',
  'only_party_can_void',
  'not_full_member',
  'from_equals_to',
  'party_not_full_member',
  'invalid_amount',
  'invalid_currency',
  'already_voided',
  'reason_required',
  'not_found',
  'source_required',
  'source_not_found',
  'source_not_writable',
  'payer_amount_required',
  'payer_amount_mismatch',
  'client_request_id_required',
  'unauthenticated',
] as const;

export type KrugSettleErrorCode = (typeof KRUG_SETTLE_ERROR_CODES)[number];

/** Longest match first so e.g. "source_not_found" never resolves to "not_found". */
const CODES_BY_LENGTH = [...KRUG_SETTLE_ERROR_CODES].sort((a, b) => b.length - a.length);

export const resolveKrugSettleErrorCode = (message: string | null | undefined): KrugSettleErrorCode | null => {
  const msg = message ?? '';
  return CODES_BY_LENGTH.find((c) => msg.includes(c)) ?? null;
};

export const krugSettleErrorKey = (code: KrugSettleErrorCode): string => `krug.settle.error.${code}`;

export interface LedgerStatusRow {
  payer_expense_id?: string | null;
  recipient_confirmed_at?: string | null;
  voided_at?: string | null;
}

/** Only new-flow rows (with a payer transaction) can await receipt; legacy rows render as before. */
export const isAwaitingReceipt = (r: LedgerStatusRow): boolean =>
  !!r.payer_expense_id && !r.recipient_confirmed_at && !r.voided_at;
