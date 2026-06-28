/**
 * Val 2 — Tier merge semantics (TS mirror of SQL `resolve_event_at_merge`).
 *
 * This helper is the canonical TS form of the time/confidence merge rule
 * used whenever two representations of the same financial event meet
 * (manual ↔ bank, scan ↔ bank, etc.). It is intentionally GENERIC.
 * It is NOT Aircash-specific. It is NOT scan-specific. It is the project's
 * single, source-agnostic tier resolver.
 *
 * Rule:
 *   1. If the existing row was explicitly user-edited → keep existing.
 *   2. Otherwise, the higher confidence tier wins.
 *      Tier ranking: C1 > C2 > C3 > C4 > (NULL/unknown).
 *   3. Equal or lower incoming tier → keep existing.
 *
 * Semantics MUST stay 1:1 with `public.resolve_event_at_merge`
 * (see migration 20260628 Val 2).
 */

export type TimeConfidence = 'C1' | 'C2' | 'C3' | 'C4' | null | undefined;

const TIER_RANK: Record<string, number> = {
  C1: 4,
  C2: 3,
  C3: 2,
  C4: 1,
};

/**
 * Numeric tier rank for a confidence value. Unknown / null → 0.
 */
export function tierRank(c: TimeConfidence): number {
  if (!c) return 0;
  return TIER_RANK[c] ?? 0;
}

/**
 * Compare two confidence tiers.
 * Returns:
 *   > 0 if `a` is stronger than `b`
 *   < 0 if `a` is weaker than `b`
 *   = 0 if equal
 */
export function compareConfidenceTier(a: TimeConfidence, b: TimeConfidence): number {
  return tierRank(a) - tierRank(b);
}

export interface ResolveEventAtMergeInput {
  existingEventAt: string | null;
  existingConfidence: TimeConfidence;
  existingUserEditedEventAt: boolean;
  incomingEventAt: string | null;
  incomingConfidence: TimeConfidence;
}

export interface ResolveEventAtMergeResult {
  eventAt: string | null;
  timeConfidence: TimeConfidence;
}

/**
 * Resolve which (event_at, time_confidence) pair survives a merge.
 * See module docstring for the rule.
 */
export function resolveEventAtMerge(
  input: ResolveEventAtMergeInput,
): ResolveEventAtMergeResult {
  const {
    existingEventAt,
    existingConfidence,
    existingUserEditedEventAt,
    incomingEventAt,
    incomingConfidence,
  } = input;

  // Rule 1: user-edit wins absolutely.
  if (existingUserEditedEventAt === true) {
    return { eventAt: existingEventAt, timeConfidence: existingConfidence };
  }

  // Rule 2: strictly higher tier wins.
  if (tierRank(incomingConfidence) > tierRank(existingConfidence)) {
    return { eventAt: incomingEventAt, timeConfidence: incomingConfidence };
  }

  // Rule 3: equal or lower tier → keep existing.
  return { eventAt: existingEventAt, timeConfidence: existingConfidence };
}
