/**
 * Pure helpers for the payout history on a person's card.
 *
 * The list answers one question per month — "how much did I give this person
 * that month" — so live payouts are grouped by month with a month total.
 * Voided payouts are never deleted and never counted; they simply stay behind
 * their own quiet toggle.
 */
import { isLivePayout, type PayoutRow } from '@/lib/workerIdentity';

export const DEFAULT_VISIBLE_PAYOUTS = 5;

const round2 = (n: number): number => Math.round((n + Number.EPSILON) * 100) / 100;

export interface PayoutMonthGroup {
  /** Sort/i18n key: 'YYYY-MM'. */
  key: string;
  /** First day of the month — formatted by the view in the active language. */
  monthDate: Date;
  payouts: PayoutRow[];
  total: number;
}

export const livePayouts = (rows: readonly PayoutRow[]): PayoutRow[] => rows.filter(isLivePayout);

export const voidedPayouts = (rows: readonly PayoutRow[]): PayoutRow[] =>
  rows.filter((p) => !isLivePayout(p));

/** Newest first, capped when the list is collapsed. */
export function visiblePayouts(
  rows: readonly PayoutRow[],
  showAll: boolean,
  limit: number = DEFAULT_VISIBLE_PAYOUTS,
): PayoutRow[] {
  const live = livePayouts(rows);
  return showAll ? live : live.slice(0, limit);
}

/** How many live payouts stay hidden while the list is collapsed. */
export function hiddenPayoutCount(
  rows: readonly PayoutRow[],
  limit: number = DEFAULT_VISIBLE_PAYOUTS,
): number {
  return Math.max(0, livePayouts(rows).length - limit);
}

/** Group live payouts by calendar month, newest month first. */
export function groupPayoutsByMonth(rows: readonly PayoutRow[]): PayoutMonthGroup[] {
  const map = new Map<string, PayoutMonthGroup>();
  for (const p of livePayouts(rows)) {
    const d = new Date(p.paid_at);
    if (Number.isNaN(d.getTime())) continue;
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    let g = map.get(key);
    if (!g) {
      g = { key, monthDate: new Date(d.getFullYear(), d.getMonth(), 1), payouts: [], total: 0 };
      map.set(key, g);
    }
    g.payouts.push(p);
    g.total = round2(g.total + (Number(p.paid_amount) || 0));
  }
  const out = [...map.values()].sort((a, b) => (a.key < b.key ? 1 : -1));
  for (const g of out) g.payouts.sort((a, b) => (a.paid_at < b.paid_at ? 1 : -1));
  return out;
}
