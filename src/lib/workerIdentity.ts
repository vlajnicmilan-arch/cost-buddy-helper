/**
 * Pure helpers for the "Ljudi" (worker identity) feature.
 *
 * A person who works by the hour is one identity (`public.workers`) that can
 * hold several ENGAGEMENTS (`public.project_workers`) — one per project.
 * Hours, rate history and payouts stay bound to the ENGAGEMENT; this module
 * only sums them up per person.
 *
 * Hard boundary: collaborators (`project_collaborators`) are NOT part of this
 * model and must never be merged, summed or linked here.
 */

import {
  computeWorkerCostTotals,
  type RateHistoryRow,
  type WorkEntryForCost,
} from '@/lib/workerRateHistory';

export interface EngagementRow {
  /** project_workers.id */
  id: string;
  project_id: string | null;
  /** workers.id — null until the identity migration is confirmed */
  worker_id: string | null;
  first_name: string;
  last_name: string;
  position: string;
  hourly_rate: number;
  business_profile_id: string | null;
}

export interface PayoutRow {
  /** project_worker_payouts.id */
  id?: string;
  /** project_workers.id (engagement) */
  worker_id: string;
  /** Set when the payout was made together with others (one expense). */
  batch_id?: string | null;
  void_reason?: string | null;
  /** What the payout was worth (hours × rate at the time). */
  gross_amount?: number | null;
  paid_amount: number;
  paid_at: string;
  period_start?: string | null;
  period_end?: string | null;
  project_id: string | null;
  status?: string | null;
  voided_at?: string | null;
  deleted_at?: string | null;
}


/** Lowercase, diacritics-stripped, whitespace-collapsed "first last". */
export function normalizePersonName(first: string, last: string): string {
  return `${first ?? ''} ${last ?? ''}`
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[đĐ]/g, 'd')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

export interface IdentityGroupSuggestion {
  key: string;
  firstName: string;
  lastName: string;
  businessProfileId: string | null;
  engagementIds: string[];
  projectIds: string[];
  /** true when the group spans more than one engagement — user must confirm. */
  needsConfirmation: boolean;
}

/**
 * Group engagements that have no identity yet by (business profile, normalized
 * name). Groups of size > 1 need the user's explicit "is this the same person?"
 * confirmation — never merge automatically.
 */
export function suggestIdentityGroups(rows: readonly EngagementRow[]): IdentityGroupSuggestion[] {
  const map = new Map<string, IdentityGroupSuggestion>();
  for (const r of rows) {
    if (r.worker_id) continue;
    const name = normalizePersonName(r.first_name, r.last_name);
    const key = `${r.business_profile_id ?? 'personal'}|${name}`;
    let g = map.get(key);
    if (!g) {
      g = {
        key,
        firstName: (r.first_name ?? '').trim(),
        lastName: (r.last_name ?? '').trim(),
        businessProfileId: r.business_profile_id ?? null,
        engagementIds: [],
        projectIds: [],
        needsConfirmation: false,
      };
      map.set(key, g);
    }
    g.engagementIds.push(r.id);
    if (r.project_id && !g.projectIds.includes(r.project_id)) g.projectIds.push(r.project_id);
  }
  const out = [...map.values()];
  for (const g of out) g.needsConfirmation = g.engagementIds.length > 1;
  return out.sort((a, b) => b.engagementIds.length - a.engagementIds.length || a.key.localeCompare(b.key));
}

/**
 * Find an existing identity whose name matches, within the same business
 * profile scope. Used by the "already exists among People" prompt.
 */
export function findExistingIdentityByName(
  people: readonly { id: string; first_name: string; last_name: string; business_profile_id: string | null; archived_at?: string | null }[],
  first: string,
  last: string,
  businessProfileId: string | null,
): { id: string; first_name: string; last_name: string } | null {
  const target = normalizePersonName(first, last);
  if (!target) return null;
  const hit = people.find(
    (p) =>
      !p.archived_at &&
      (p.business_profile_id ?? null) === (businessProfileId ?? null) &&
      normalizePersonName(p.first_name, p.last_name) === target,
  );
  return hit ? { id: hit.id, first_name: hit.first_name, last_name: hit.last_name } : null;
}

/** Money still owed on one earlier payout (gross booked, less actually paid). */
export interface PayoutShortfall {
  payoutId: string | null;
  periodStart: string | null;
  periodEnd: string | null;
  amount: number;
}

export interface PersonProjectBreakdown {
  engagementId: string;
  projectId: string | null;
  hourlyRate: number;
  position: string;
  hours: number;
  earned: number;
  /** Actually paid on this engagement (voided payouts excluded). */
  paid: number;
  /** earned − paid, never negative. */
  remaining: number;
  /** paid − earned when the person was paid ahead; never negative. */
  advance: number;
  /** Underpaid parts of earlier payouts — offered by name in the payout dialog. */
  shortfalls: PayoutShortfall[];
  /** Oldest / newest work date not yet covered by a payout. */
  unpaidFrom: string | null;
  unpaidTo: string | null;
}

export interface PersonAggregate {
  engagementCount: number;
  totalHours: number;
  totalEarned: number;
  totalPaid: number;
  totalRemaining: number;
  /** Sum of per-engagement advances (money paid beyond what was earned). */
  totalAdvance: number;
  byProject: PersonProjectBreakdown[];
  payouts: PayoutRow[];
}

export const isLivePayout = (p: PayoutRow) =>
  !p.deleted_at && !p.voided_at && (p.status ?? 'paid') !== 'voided';

/** Voided payouts stay visible in history; deleted rows do not. */
export const isVisiblePayout = (p: PayoutRow) => !p.deleted_at;

const round2 = (n: number): number => Math.round((n + Number.EPSILON) * 100) / 100;

/**
 * Sum a single person's hourly work across their engagements.
 *
 * "Remaining" is measured in MONEY (earned − actually paid), never in
 * uncovered hours: a partially paid payout locks its hours, and an
 * hours-based measure would hide that debt and make it unpayable.
 * Read-only: introduces no new writes and no new payout path.
 */
export function aggregatePerson(
  engagements: readonly EngagementRow[],
  entries: readonly WorkEntryForCost[],
  rateHistory: readonly RateHistoryRow[],
  payouts: readonly PayoutRow[],
  now: Date = new Date(),
): PersonAggregate {
  const ids = new Set(engagements.map((e) => e.id));
  const scopedEntries = entries.filter((e) => ids.has(e.worker_id));
  const fallback: Record<string, number> = {};
  for (const e of engagements) fallback[e.id] = Number(e.hourly_rate) || 0;

  const totals = computeWorkerCostTotals(scopedEntries, rateHistory, fallback, now);

  // Unpaid work window per engagement — the period a payout would cover.
  const unpaid = new Map<string, { from: string; to: string }>();
  for (const e of scopedEntries) {
    if (e.payout_id) continue;
    const cur = unpaid.get(e.worker_id);
    if (!cur) unpaid.set(e.worker_id, { from: e.work_date, to: e.work_date });
    else {
      if (e.work_date < cur.from) cur.from = e.work_date;
      if (e.work_date > cur.to) cur.to = e.work_date;
    }
  }

  const scopedPayouts = payouts.filter((p) => ids.has(p.worker_id) && isVisiblePayout(p));
  const livePayouts = scopedPayouts.filter(isLivePayout);

  const paidByEngagement = new Map<string, number>();
  for (const p of livePayouts) {
    paidByEngagement.set(p.worker_id, round2((paidByEngagement.get(p.worker_id) ?? 0) + (Number(p.paid_amount) || 0)));
  }

  const shortfallsByEngagement = new Map<string, PayoutShortfall[]>();
  for (const p of [...livePayouts].sort((a, b) => (a.paid_at < b.paid_at ? -1 : 1))) {
    const amount = round2((Number(p.gross_amount) || 0) - (Number(p.paid_amount) || 0));
    if (amount <= 0.005) continue;
    const list = shortfallsByEngagement.get(p.worker_id) ?? [];
    list.push({
      payoutId: p.id ?? null,
      periodStart: p.period_start ?? null,
      periodEnd: p.period_end ?? null,
      amount,
    });
    shortfallsByEngagement.set(p.worker_id, list);
  }

  const byProject: PersonProjectBreakdown[] = engagements.map((e) => {
    const t = totals[e.id];
    const w = unpaid.get(e.id);
    const earned = round2(t?.totalCost ?? 0);
    const paid = round2(paidByEngagement.get(e.id) ?? 0);
    const balance = round2(earned - paid);
    const shortfalls = shortfallsByEngagement.get(e.id) ?? [];
    // Fall back to the underpaid payout's own period when every hour is locked.
    const fallbackPeriod = shortfalls[0];
    return {
      engagementId: e.id,
      projectId: e.project_id,
      hourlyRate: Number(e.hourly_rate) || 0,
      position: e.position,
      hours: t?.totalHours ?? 0,
      earned,
      paid,
      remaining: Math.max(0, balance),
      advance: Math.max(0, round2(-balance)),
      shortfalls,
      unpaidFrom: w?.from ?? fallbackPeriod?.periodStart ?? null,
      unpaidTo: w?.to ?? fallbackPeriod?.periodEnd ?? null,
    };
  });

  return {
    engagementCount: engagements.length,
    totalHours: round2(byProject.reduce((s, b) => s + b.hours, 0)),
    totalEarned: round2(byProject.reduce((s, b) => s + b.earned, 0)),
    totalPaid: round2(livePayouts.reduce((s, p) => s + (Number(p.paid_amount) || 0), 0)),
    totalRemaining: round2(byProject.reduce((s, b) => s + b.remaining, 0)),
    totalAdvance: round2(byProject.reduce((s, b) => s + b.advance, 0)),
    byProject,
    payouts: [...scopedPayouts].sort((a, b) => (a.paid_at < b.paid_at ? 1 : -1)),
  };
}


export interface PersonListRow {
  workerId: string;
  firstName: string;
  lastName: string;
  engagementCount: number;
  remaining: number;
}

/** Sort: remaining amount desc, then name asc. */
export function sortPeopleRows(rows: readonly PersonListRow[]): PersonListRow[] {
  return [...rows].sort(
    (a, b) =>
      b.remaining - a.remaining ||
      `${a.lastName} ${a.firstName}`.localeCompare(`${b.lastName} ${b.firstName}`, 'hr'),
  );
}
