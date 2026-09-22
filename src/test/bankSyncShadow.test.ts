/**
 * SJENA BANKOVNE SINKRONIZACIJE — jezgra gleda, ali NE odlučuje.
 *
 * Brane iz naloga 2 (KORAK 3):
 *  - greška u jezgri ne obara sinkronizaciju i ne mijenja upise,
 *  - kandidat drugog vlasnika nikad ne postane odabrani,
 *  - isti ulaz sa sjenom i bez sjene daje ISTE upise.
 */
import { describe, it, expect } from 'vitest';
import { BankSyncShadow } from '../../supabase/functions/_shared/bankSyncShadow.ts';
import { planLedgerRow } from '../lib/moneyLedgerPlan';

const OWNER = 'aa000000-0000-4000-8000-000000000001';
const OTHER = 'bb000000-0000-4000-8000-000000000002';
const WALLET = 'cc000000-0000-4000-8000-000000000003';

/** Snimljeni Enable Banking odgovor (skraćen na ono što odluka čita). */
const EB_ROWS = [
  { stableId: 'eb-1', amount: 12.5, dateIso: '2026-03-01', direction: 'out' as const },
  { stableId: 'eb-2', amount: 40, dateIso: '2026-03-02', direction: 'in' as const },
  { stableId: 'eb-3', amount: 7.25, dateIso: '2026-03-03', direction: 'out' as const },
];

/** Minimalna petlja koja oponaša redoslijed upisa u sinkronizaciji. */
function runSync(shadow: BankSyncShadow | null) {
  const writes: Array<{ op: string; stableId: string }> = [];
  let rowIndex = -1;
  for (const row of EB_ROWS) {
    rowIndex += 1;
    writes.push({ op: 'insert', stableId: row.stableId });
    shadow?.observe({
      rowIndex,
      userId: OWNER,
      stableId: row.stableId,
      amount: row.amount,
      dateIso: row.dateIso,
      direction: row.direction,
      walletId: WALLET,
      legacyOutcome: 'new',
      classification: { kind: 'new', existsByFingerprint: false, deletedByFingerprint: false },
      candidates: [],
      userChoice: { newRowOn: true },
    });
  }
  return writes;
}

describe('bank sync shadow', () => {
  it('daje iste upise sa sjenom i bez nje', () => {
    const withoutShadow = runSync(null);
    const withShadow = runSync(
      new BankSyncShadow({ sessionId: 's', userId: OWNER, bankAccountId: 'acc' }),
    );
    expect(withShadow).toEqual(withoutShadow);
    expect(withShadow).toHaveLength(EB_ROWS.length);
  });

  it('greška u jezgri ne obara sinkronizaciju', () => {
    const shadow = new BankSyncShadow({
      sessionId: 's',
      userId: OWNER,
      bankAccountId: 'acc',
      plan: () => {
        throw new Error('jezgra pukla');
      },
    });
    const writes = runSync(shadow);
    expect(writes).toEqual(runSync(null));

    const log = shadow.summaryLog();
    expect(log).not.toBeNull();
    const details = (log as any).details;
    expect(details.processed).toBe(EB_ROWS.length);
    expect(details.core_errors).toBe(EB_ROWS.length);
    expect(details.core_first_error).toContain('jezgra pukla');
  });

  it('kandidat drugog vlasnika nikad ne postane odabrani', () => {
    const decision = planLedgerRow({
      rowIndex: 0,
      userId: OWNER,
      amount: 12.5,
      dateIso: '2026-03-01',
      direction: 'out',
      walletId: WALLET,
      fingerprint: 'eb-1',
      classification: { kind: 'auto_merge', manualId: 'tudji-redak' },
      candidates: [{ id: 'tudji-redak', userId: OTHER, kind: 'manual' }],
      userChoice: { autoMergeOn: true },
    });
    expect(decision.candidateId).not.toBe('tudji-redak');
  });

  it('zbirni zapis ne nosi iznose ni opise', () => {
    const shadow = new BankSyncShadow({ sessionId: 's', userId: OWNER, bankAccountId: 'acc' });
    runSync(shadow);
    const serialized = JSON.stringify(shadow.summaryLog());
    expect(serialized).not.toContain('12.5');
    expect(serialized).not.toContain('7.25');
  });
});
