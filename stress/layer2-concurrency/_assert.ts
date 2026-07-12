/**
 * Layer 2 — assertion helpers.
 *
 * Design principles (see stress/README.md, Faza 2):
 *   - Every assertion throws on first violation (Layer 2 is fail-fast).
 *   - No retry / no eventual-consistency waiting: invariants must hold
 *     immediately after the race completes and both promises settled.
 *   - Latency is NOT an assertion. It's recorded and reported only.
 */

export class InvariantViolation extends Error {
  constructor(msg: string) {
    super(msg);
    this.name = "InvariantViolation";
  }
}

export function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new InvariantViolation(msg);
}

export function assertEq<T>(actual: T, expected: T, label: string) {
  if (actual !== expected) {
    throw new InvariantViolation(
      `${label}: expected=${JSON.stringify(expected)} actual=${JSON.stringify(actual)}`,
    );
  }
}

export function assertOneOf<T>(actual: T, allowed: readonly T[], label: string) {
  if (!allowed.includes(actual)) {
    throw new InvariantViolation(
      `${label}: expected one of ${JSON.stringify(allowed)} actual=${JSON.stringify(actual)}`,
    );
  }
}

/**
 * Count occurrences of each string in `outcomes` (from Promise.allSettled results).
 * Useful for post-race distribution assertions:
 *   assertDistribution(outcomes, { ok_confirmed: 1, wrong_state: 1 })
 */
export function countBy(list: readonly string[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const s of list) out[s] = (out[s] ?? 0) + 1;
  return out;
}

export function assertDistribution(
  actual: readonly string[],
  expected: Record<string, number>,
  label: string,
) {
  const counts = countBy(actual);
  const keys = new Set([...Object.keys(counts), ...Object.keys(expected)]);
  for (const k of keys) {
    if ((counts[k] ?? 0) !== (expected[k] ?? 0)) {
      throw new InvariantViolation(
        `${label}: distribution mismatch — actual=${JSON.stringify(counts)} expected=${JSON.stringify(expected)}`,
      );
    }
  }
}
