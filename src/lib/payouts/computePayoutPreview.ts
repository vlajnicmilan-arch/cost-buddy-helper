/**
 * Pure helpers za worker payout preview i status.
 *
 * SQL-parity contract (create_worker_payout RPC, migracija PR-A):
 *   - sumira actual_hours iz entrija u [periodStart, periodEnd] koji NEMAJU
 *     payout_id (nisu zaključani).
 *   - gross = ROUND(hours * hourlyRate, 2) (dvije decimale).
 *   - status derivira se iz (hours, gross, paidAmount):
 *       hours == 0 && paid > 0            → 'advance'
 *       paid >= gross                     → 'paid'
 *       inače                             → 'partial'
 *   - Ako je paid == 0 i hours == 0       → 'partial' (edge, ali paid_amount NOT NULL / >= 0).
 */

export interface WorkEntryForPayout {
  work_date: string;         // ISO date 'YYYY-MM-DD'
  actual_hours: number;
  payout_id: string | null;  // NOT NULL = zaključan → isključen iz preview-a
}

export interface PayoutPreview {
  hoursCovered: number;
  hourlyRate: number;
  grossAmount: number;
  eligibleEntryCount: number;
}

export type PayoutStatus = 'paid' | 'partial' | 'advance' | 'voided';

/** Round half-away-from-zero to 2 decimals (matches Postgres ROUND(numeric, 2)). */
export function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

/** Inclusive [start, end] date compare on ISO 'YYYY-MM-DD' strings (lexicographic works). */
function inRange(date: string, start: string, end: string): boolean {
  return date >= start && date <= end;
}

export function computePayoutPreview(
  entries: WorkEntryForPayout[],
  periodStart: string,
  periodEnd: string,
  hourlyRate: number,
): PayoutPreview {
  if (periodEnd < periodStart) {
    throw new Error('computePayoutPreview: periodEnd < periodStart');
  }
  const eligible = entries.filter(
    (e) => e.payout_id == null && inRange(e.work_date, periodStart, periodEnd),
  );
  const hoursCovered = round2(
    eligible.reduce((sum, e) => sum + (Number.isFinite(e.actual_hours) ? e.actual_hours : 0), 0),
  );
  const grossAmount = round2(hoursCovered * hourlyRate);
  return {
    hoursCovered,
    hourlyRate,
    grossAmount,
    eligibleEntryCount: eligible.length,
  };
}

export function derivePayoutStatus(
  hoursCovered: number,
  grossAmount: number,
  paidAmount: number,
  voided = false,
): PayoutStatus {
  if (voided) return 'voided';
  if (paidAmount < 0) throw new Error('derivePayoutStatus: paidAmount negative');
  if (hoursCovered === 0 && paidAmount > 0) return 'advance';
  if (paidAmount >= grossAmount) return 'paid';
  return 'partial';
}

export interface WorkerPayoutRecord {
  gross_amount: number;
  paid_amount: number;
  status: PayoutStatus;
}

/**
 * Preostalo za isplatu = suma bruto (paid + partial) − suma isplaćeno (paid + partial).
 * Voided payouti isključeni. Advance payouti brojani su samo u paid_amount stranu
 * (nemaju gross → nemaju "planirano").
 */
export function computeRemainingForWorker(payouts: WorkerPayoutRecord[]): {
  totalGross: number;
  totalPaid: number;
  remaining: number;
} {
  let totalGross = 0;
  let totalPaid = 0;
  for (const p of payouts) {
    if (p.status === 'voided') continue;
    if (p.status !== 'advance') {
      totalGross += p.gross_amount;
    }
    totalPaid += p.paid_amount;
  }
  return {
    totalGross: round2(totalGross),
    totalPaid: round2(totalPaid),
    remaining: round2(totalGross - totalPaid),
  };
}

/**
 * Warning heuristika za "rate promijenjen unutar perioda":
 * uspoređuje `currentHourlyRate` s `hourlyRate_snapshot` prethodnog payouta
 * čiji se period preklapa. Ako se razlikuju → UI mora upozoriti korisnika
 * jer preview koristi trenutnu satnicu (rate_snapshot na work_entries je
 * svjesno izostavljen iz v1 — vidi plan 1.5).
 */
export interface PriorPayoutForRateCheck {
  period_start: string;
  period_end: string;
  hourly_rate_snapshot: number;
  status: PayoutStatus;
}

export function detectRateChangeWarning(
  currentHourlyRate: number,
  periodStart: string,
  periodEnd: string,
  priorPayouts: PriorPayoutForRateCheck[],
): { changed: boolean; previousRate: number | null } {
  // Prior payout koji se preklapa s traženim periodom I nije voided
  const overlapping = priorPayouts
    .filter((p) => p.status !== 'voided')
    .filter((p) => !(p.period_end < periodStart || p.period_start > periodEnd))
    .sort((a, b) => (a.period_end > b.period_end ? -1 : 1));
  if (overlapping.length === 0) {
    return { changed: false, previousRate: null };
  }
  const prev = overlapping[0].hourly_rate_snapshot;
  return { changed: prev !== currentHourlyRate, previousRate: prev };
}

/** Permission matrix — koje payout akcije caller smije izvesti. */
export interface PayoutPermissionContext {
  isProjectOwner: boolean;
  isReadOnly: boolean; // owner-readonly billing downgrade
}

export interface PayoutPermissions {
  canCreatePayout: boolean;
  canVoidPayout: boolean;
  canUnlockEntry: boolean;
  canUpdateLockedEntry: boolean;
  canViewOwnPayouts: boolean; // radnik uvijek smije vidjeti svoje
}

export function derivePayoutPermissions(ctx: PayoutPermissionContext): PayoutPermissions {
  const ownerAllowed = ctx.isProjectOwner && !ctx.isReadOnly;
  return {
    canCreatePayout: ownerAllowed,
    canVoidPayout: ownerAllowed,
    canUnlockEntry: ownerAllowed,
    canUpdateLockedEntry: ownerAllowed,
    canViewOwnPayouts: true,
  };
}
