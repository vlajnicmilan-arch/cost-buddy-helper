import { describe, it, expect } from 'vitest';
import { selectPatternInputs, type PatternSelectionRow } from '../patternSelection';
import { computePatternFill } from '../patternFill';

const WALLET = 'custom:aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const REVOLUT = 'cccccccc-cccc-cccc-cccc-cccccccccccc';

/** Aircash izvod, ~desetak „Uplata na Aircash Google Pay … Revolut" redaka. */
const gpayRow = (index: number, over: Partial<PatternSelectionRow> = {}): PatternSelectionRow => ({
  index,
  type: 'income',
  merchantName: null,
  description: 'Uplata na Aircash Google Pay Revolut',
  classificationKind: 'transfer',
  classificationTargetIncomeSourceId: '',
  paymentSource: WALLET,
  txType: 'income',
  ...over,
});

const decided = (over: Record<string, unknown> = {}) => ({
  enabled: true,
  targetIncomeSourceId: REVOLUT,
  direction: 'in' as const,
  rememberRule: false,
  merchantKey: null,
  sourceWalletKey: null,
  ...over,
});

const run = (rows: PatternSelectionRow[], transfers: Record<number, unknown>, excluded: number[] = []) => {
  const { manual, candidates } = selectPatternInputs({
    rows,
    transfers: transfers as never,
  });
  return computePatternFill({ manual, candidates, excluded });
};

describe('selectPatternInputs — Aircash serija (kind transfer, prazan cilj, bez trgovca)', () => {
  const rows = [0, 1, 2, 3, 4, 5].map(i => gpayRow(i));

  it('(a) dvije ručne odluke popune preostala četiri retka', () => {
    const fills = run(rows, { 0: decided(), 1: decided() });
    expect(fills.map(f => f.index)).toEqual([2, 3, 4, 5]);
    for (const f of fills) {
      expect(f.targetIncomeSourceId).toBe(REVOLUT);
      expect(f.direction).toBe('in');
    }
  });

  it('(b) jedna odluka sa „Zapamti" popuni preostalih pet', () => {
    const fills = run(rows, { 0: decided({ rememberRule: true }) });
    expect(fills.map(f => f.index)).toEqual([1, 2, 3, 4, 5]);
  });

  it('(c) jedna odluka bez „Zapamti" ne popunjava ništa', () => {
    expect(run(rows, { 0: decided() })).toEqual([]);
  });

  it('(d) „nije prijenos" i izuzeti redak ostaju netaknuti', () => {
    const fills = run(
      rows,
      { 0: decided(), 1: decided(), 2: decided({ enabled: false, targetIncomeSourceId: '' }) },
      [3],
    );
    expect(fills.map(f => f.index)).toEqual([4, 5]);
  });

  it('(e) drugi trgovac se ne miješa', () => {
    const other = gpayRow(6, { description: 'Uplata na Aircash Google Pay Wise' });
    const fills = run([...rows, other], { 0: decided(), 1: decided() });
    expect(fills.map(f => f.index)).toEqual([2, 3, 4, 5]);
  });
});

describe('selectPatternInputs — isključenja', () => {
  it('transfer s već predodabranim ciljem nije kandidat', () => {
    const { candidates } = selectPatternInputs({
      rows: [gpayRow(0, { classificationTargetIncomeSourceId: REVOLUT })],
      transfers: {},
    });
    expect(candidates).toEqual([]);
  });

  it('otisak, kasna kartica i odgovoreno pitanje isključuju redak', () => {
    const { candidates } = selectPatternInputs({
      rows: [
        gpayRow(0, { existsByFingerprint: true }),
        gpayRow(1, { lateMatchOffer: 'manual-1' }),
        gpayRow(2),
      ],
      transfers: {},
      answeredQuestions: { 2: { choice: 'new' } },
    });
    expect(candidates).toEqual([]);
  });

  it('auto-popunjeni redak se ne broji u prag', () => {
    const { manual } = selectPatternInputs({
      rows: [gpayRow(0), gpayRow(1)],
      transfers: { 0: decided(), 1: decided() } as never,
      autoFilled: { 1: true },
    });
    expect(manual.map(m => m.index)).toEqual([0]);
  });

  it('ključ se izvodi iz opisa kad nema imena trgovca', () => {
    const { candidates } = selectPatternInputs({ rows: [gpayRow(0)], transfers: {} });
    expect(candidates[0].merchantKey).toBeTruthy();
    expect(candidates[0].sourceWalletKey).toBe(WALLET);
    expect(candidates[0].direction).toBe('in');
  });
});

/**
 * STVARNI SLUČAJ 19.9. — Aircash izvod, redci „Uplata na Aircash Google Pay",
 * trgovac „Google Pay", txType 'transfer' (ključna riječ), statementDirection
 * 'in', iznos 60. Tip 'transfer' SAM PO SEBI ne nosi smjer — bez predznaka
 * takav redak ne smije biti kandidat.
 */
const realRow = (index: number, over: Partial<PatternSelectionRow> = {}): PatternSelectionRow => ({
  index,
  type: 'income',
  merchantName: 'Google Pay',
  description: 'Uplata na Aircash Google Pay',
  classificationKind: 'transfer',
  classificationTargetIncomeSourceId: '',
  paymentSource: WALLET,
  txType: 'transfer',
  statementDirection: 'in',
  amount: 60,
  ...over,
});

describe('selectPatternInputs — smjer kandidata (Aircash Google Pay serija)', () => {
  it('(a) 1 ručna odluka + „Zapamti" popuni preostalih 5 (txType transfer, bez „Revolut" u opisu)', () => {
    const rows = [0, 1, 2, 3, 4, 5].map(i => realRow(i));
    expect(rows.every(r => !r.description!.includes('Revolut'))).toBe(true);
    expect(rows.every(r => r.txType === 'transfer')).toBe(true);
    const fills = run(rows, { 0: decided({ rememberRule: true }) });
    expect(fills.map(f => f.index)).toEqual([1, 2, 3, 4, 5]);
    for (const f of fills) expect(f.direction).toBe('in');
  });

  it('(b) 2 ručne bez „Zapamti" popune preostala 4', () => {
    const rows = [0, 1, 2, 3, 4, 5].map(i => realRow(i));
    const fills = run(rows, { 0: decided(), 1: decided() });
    expect(fills.map(f => f.index)).toEqual([2, 3, 4, 5]);
  });

  it('(c) bez statementDirection, pozitivan iznos uz tip income → smjer in', () => {
    const rows = [0, 1].map(i =>
      realRow(i, { statementDirection: null, type: 'income', txType: 'income', amount: 60 }));
    const fills = run(rows, { 0: decided({ rememberRule: true }) });
    expect(fills.map(f => f.index)).toEqual([1]);
  });

  it('(d) txType transfer bez ikakvog smjera nije kandidat', () => {
    const rows = [0, 1, 2].map(i =>
      realRow(i, { statementDirection: null, type: 'transfer', txType: 'transfer', amount: null }));
    const fills = run(rows, { 0: decided({ rememberRule: true }), 1: decided({ rememberRule: true }) });
    expect(fills).toEqual([]);
  });
});
