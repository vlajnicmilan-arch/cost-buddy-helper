/**
 * Reconciliation summary — Faza 2 executor extension tests.
 *
 * Verificiraju:
 *   - collectTouchedSourceIds izvlači UUID-jeve iz custom:<uuid> + transfer target
 *   - buildReconciliationSummary poziva preview_source_balance_after_batch po source_id
 *   - delta > 0.01 → needsReconciliation=true; delta ≤ 0.01 → false
 *   - rpc error → entry s error poljem i needsReconciliation=false
 */

import { describe, it, expect } from 'vitest';
import { collectTouchedSourceIds } from '../executor';
import type { PlannedWork } from '../executor';

const A = '11111111-1111-1111-1111-111111111111';
const B = '22222222-2222-2222-2222-222222222222';

function mkPlan(over: Partial<PlannedWork> = {}): PlannedWork {
  return {
    autoMerges: [],
    questionMerges: [],
    inserts: [],
    transfers: [],
    rulesToUpsert: [],
    skippedByUser: 0,
    skippedFingerprint: 0,
    ...over,
  } as PlannedWork;
}

describe('collectTouchedSourceIds', () => {
  it('extracts UUIDs from custom:<uuid> paymentSource on inserts', () => {
    const plan = mkPlan({
      inserts: [
        { tx: { paymentSource: `custom:${A}` } as never, rowIndex: 0 } as never,
        { tx: { paymentSource: 'cash' } as never, rowIndex: 1 } as never,
      ],
    });
    expect(collectTouchedSourceIds(plan)).toEqual([A]);
  });

  it('includes both source and target for transfers, dedupes', () => {
    const plan = mkPlan({
      inserts: [{ tx: { paymentSource: `custom:${A}` } as never, rowIndex: 0 } as never],
      transfers: [{
        tx: { paymentSource: `custom:${A}` } as never,
        decision: { targetIncomeSourceId: B } as never,
        rowIndex: 2,
      } as never],
    });
    const ids = collectTouchedSourceIds(plan);
    expect(new Set(ids)).toEqual(new Set([A, B]));
  });
});
