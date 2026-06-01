/**
 * Pure helpers for Family proportional split (Faza 2).
 * All inputs/outputs are deterministic; no Supabase or React imports.
 * Tested via vitest in familySplit.test.ts.
 */

export type SplitMode = 'equal' | 'proportional_income' | 'manual';
export type IncomeSource = 'auto_3m' | 'declared' | 'hybrid';

export interface FamilyMemberSplitInput {
  userId: string;
  /** Auto-derived income from last 3 months (group currency). 0 if no data. */
  autoIncome?: number;
  /** User-declared monthly income (in declaredIncomeCurrency). */
  declaredIncome?: number;
  declaredIncomeCurrency?: string;
  /** Extra non-job income: stipend, allowance (declared currency). */
  monthlyContribution?: number;
  /** Has the member explicitly accepted proportional split. */
  consent: boolean;
  /** Member role; viewers are always excluded from split. */
  role?: 'owner' | 'member' | 'viewer';
}

export interface ComputeRatioInput {
  members: FamilyMemberSplitInput[];
  source: IncomeSource;
  groupCurrency: string;
  /** Convert(amount, from, to) → amount in `to` currency. */
  convert: (amount: number, from: string, to: string) => number;
}

export interface MemberShare {
  userId: string;
  /** 0..1 — share of shared expenses this member should cover. */
  ratio: number;
  /** Income (in group currency) used for ratio calculation. 0 if excluded. */
  effectiveIncome: number;
  /** True if member is in the split. */
  included: boolean;
  /** Why excluded, if not included. */
  excludedReason?: 'no_income' | 'no_consent' | 'viewer';
}

const EPSILON = 1e-9;

/**
 * Pick the income value per the configured source.
 * - declared: only declared (+ contribution)
 * - auto_3m: only auto-derived from transactions
 * - hybrid: declared if present, otherwise auto
 *
 * Returns income in the group's currency.
 */
export function pickIncome(
  m: FamilyMemberSplitInput,
  source: IncomeSource,
  groupCurrency: string,
  convert: (amount: number, from: string, to: string) => number,
): number {
  const declaredCurrency = m.declaredIncomeCurrency || groupCurrency;
  const declaredRaw = (m.declaredIncome || 0) + (m.monthlyContribution || 0);
  const declared = declaredRaw > 0
    ? convert(declaredRaw, declaredCurrency, groupCurrency)
    : 0;

  // autoIncome is assumed to be already in group currency (computed from txns).
  const auto = m.autoIncome || 0;

  switch (source) {
    case 'declared':
      return declared;
    case 'auto_3m':
      return auto;
    case 'hybrid':
    default:
      return declared > 0 ? declared : auto;
  }
}

/**
 * Compute share ratios for shared expenses.
 *
 * Rules:
 *  - Viewers are always excluded.
 *  - Members without consent are excluded (their share goes to "pending"
 *    handling at the caller; here we just exclude them from the split).
 *  - Members with 0 effective income are excluded (child, dependent).
 *  - If no members qualify → empty result (caller should fall back to equal).
 *  - Ratios sum to exactly 1.0 (last member absorbs floating-point rest).
 */
export function computeIncomeRatio(input: ComputeRatioInput): MemberShare[] {
  const { members, source, groupCurrency, convert } = input;

  const rows: MemberShare[] = members.map(m => {
    if (m.role === 'viewer') {
      return { userId: m.userId, ratio: 0, effectiveIncome: 0, included: false, excludedReason: 'viewer' };
    }
    if (!m.consent) {
      return { userId: m.userId, ratio: 0, effectiveIncome: 0, included: false, excludedReason: 'no_consent' };
    }
    const income = pickIncome(m, source, groupCurrency, convert);
    if (income <= EPSILON) {
      return { userId: m.userId, ratio: 0, effectiveIncome: 0, included: false, excludedReason: 'no_income' };
    }
    return { userId: m.userId, ratio: 0, effectiveIncome: income, included: true };
  });

  const totalIncome = rows.reduce((s, r) => s + r.effectiveIncome, 0);
  if (totalIncome <= EPSILON) return rows;

  let runningSum = 0;
  const includedRows = rows.filter(r => r.included);
  includedRows.forEach((r, idx) => {
    if (idx === includedRows.length - 1) {
      r.ratio = Math.max(0, 1 - runningSum);
    } else {
      const ratio = r.effectiveIncome / totalIncome;
      r.ratio = ratio;
      runningSum += ratio;
    }
  });

  return rows;
}

/**
 * Equal-split fallback. Used when split_mode='equal' or proportional
 * cannot be computed (no consenting income earners).
 */
export function computeEqualRatio(
  members: FamilyMemberSplitInput[],
): MemberShare[] {
  const eligible = members.filter(m => m.role !== 'viewer');
  const n = eligible.length;

  return members.map(m => {
    if (m.role === 'viewer') {
      return { userId: m.userId, ratio: 0, effectiveIncome: 0, included: false, excludedReason: 'viewer' };
    }
    return { userId: m.userId, ratio: n > 0 ? 1 / n : 0, effectiveIncome: 0, included: true };
  });
}

/**
 * Apply per-transaction override map ({userId: ratio}) on top of base ratios.
 * Overrides MUST sum to ~1.0; if not, they are normalized.
 * Members not present in override keep ratio 0.
 */
export function applySplitOverride(
  overrides: Record<string, number> | null | undefined,
  memberUserIds: string[],
): MemberShare[] {
  if (!overrides || Object.keys(overrides).length === 0) {
    return memberUserIds.map(userId => ({
      userId, ratio: 0, effectiveIncome: 0, included: false, excludedReason: 'no_consent',
    }));
  }

  const total = Object.values(overrides).reduce((s, v) => s + (v || 0), 0);
  if (total <= EPSILON) {
    return memberUserIds.map(userId => ({
      userId, ratio: 0, effectiveIncome: 0, included: false, excludedReason: 'no_consent',
    }));
  }

  return memberUserIds.map(userId => {
    const raw = overrides[userId] || 0;
    return {
      userId,
      ratio: raw > 0 ? raw / total : 0,
      effectiveIncome: 0,
      included: raw > 0,
    };
  });
}

/**
 * Project the month-end spending based on linear trend.
 *  spent: amount spent so far in the period
 *  daysElapsed: number of days from period start through today (inclusive, ≥1)
 *  daysInPeriod: total days in the period (e.g. 30/31 for a month)
 *
 * Returns a non-negative projection. If daysElapsed >= daysInPeriod,
 * returns `spent` (already at/past period end).
 */
export function projectPeriodEnd(
  spent: number,
  daysElapsed: number,
  daysInPeriod: number,
): number {
  if (spent < 0) return 0;
  if (daysElapsed <= 0 || daysInPeriod <= 0) return spent;
  if (daysElapsed >= daysInPeriod) return spent;
  return (spent / daysElapsed) * daysInPeriod;
}
