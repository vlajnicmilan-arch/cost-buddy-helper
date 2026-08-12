import { describe, it, expect } from 'vitest';
import {
  buildPatternKey,
  computePatternFill,
  PATTERN_FILL_THRESHOLD,
  type PatternCandidateRow,
  type PatternManualDecision,
} from '../patternFill';

const WALLET = 'custom:aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const WALLET_B = 'custom:bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
const TARGET = 'cccccccc-cccc-cccc-cccc-cccccccccccc';

const manual = (index: number, over: Partial<PatternManualDecision> = {}): PatternManualDecision => ({
  index,
  merchantKey: 'aircash eu',
  sourceWalletKey: WALLET,
  direction: 'out',
  targetIncomeSourceId: TARGET,
  ...over,
});

const candidate = (index: number, over: Partial<PatternCandidateRow> = {}): PatternCandidateRow => ({
  index,
  merchantKey: 'aircash eu',
  sourceWalletKey: WALLET,
  direction: 'out',
  ...over,
});

describe('buildPatternKey', () => {
  it('traži trgovca, novčanik i smjer', () => {
    expect(buildPatternKey({ merchantKey: 'a', sourceWalletKey: WALLET, direction: 'out' }))
      .toBe(`a::${WALLET}::out`);
    expect(buildPatternKey({ merchantKey: null, sourceWalletKey: WALLET, direction: 'out' })).toBeNull();
    expect(buildPatternKey({ merchantKey: 'a', sourceWalletKey: null, direction: 'out' })).toBeNull();
    expect(buildPatternKey({ merchantKey: 'a', sourceWalletKey: WALLET, direction: null })).toBeNull();
  });
});

describe('computePatternFill — KEKS slučaj (AIRCASH.EU ZAGREB, 6+ redaka, različiti iznosi)', () => {
  it('dvije ručne odluke popunjavaju preostale retke istog ključa', () => {
    const out = computePatternFill({
      manual: [manual(0), manual(1)],
      candidates: [candidate(2), candidate(3), candidate(4), candidate(5)],
    });
    expect(out.map(f => f.index)).toEqual([2, 3, 4, 5]);
    for (const f of out) {
      expect(f.targetIncomeSourceId).toBe(TARGET);
      expect(f.direction).toBe('out');
    }
  });

  it('JEDNA odluka ne pokreće ništa', () => {
    expect(PATTERN_FILL_THRESHOLD).toBe(2);
    const out = computePatternFill({
      manual: [manual(0)],
      candidates: [candidate(1), candidate(2)],
    });
    expect(out).toEqual([]);
  });

  it('iznos nije dio ključa — redci se popunjavaju bez obzira na iznose', () => {
    // Iznos se u ovom sloju uopće ne pojavljuje; ključ ga ne može sadržavati.
    const key = buildPatternKey(candidate(9));
    expect(key).not.toMatch(/\d+\.\d{2}/);
  });
});

describe('computePatternFill — negativni čuvari', () => {
  it('drugi trgovac u istoj seriji ostaje netaknut', () => {
    const out = computePatternFill({
      manual: [manual(0), manual(1)],
      candidates: [candidate(2, { merchantKey: 'konzum' })],
    });
    expect(out).toEqual([]);
  });

  it('drugi novčanik ostaje netaknut', () => {
    const out = computePatternFill({
      manual: [manual(0), manual(1)],
      candidates: [candidate(2, { sourceWalletKey: WALLET_B })],
    });
    expect(out).toEqual([]);
  });

  it('suprotan smjer ostaje netaknut', () => {
    const out = computePatternFill({
      manual: [manual(0), manual(1)],
      candidates: [candidate(2, { direction: 'in' })],
    });
    expect(out).toEqual([]);
  });

  it('nesuglasne ručne odluke (dva različita cilja) ne popunjavaju ništa', () => {
    const out = computePatternFill({
      manual: [manual(0), manual(1, { targetIncomeSourceId: 'drugi-cilj' })],
      candidates: [candidate(2)],
    });
    expect(out).toEqual([]);
  });

  it('izuzeti redci (korisnik ih vratio u neodlučeno) se ne popunjavaju ponovo', () => {
    const out = computePatternFill({
      manual: [manual(0), manual(1)],
      candidates: [candidate(2), candidate(3)],
      excluded: [2],
    });
    expect(out.map(f => f.index)).toEqual([3]);
  });

  it('kandidat bez identiteta trgovca se preskače', () => {
    const out = computePatternFill({
      manual: [manual(0), manual(1)],
      candidates: [candidate(2, { merchantKey: null })],
    });
    expect(out).toEqual([]);
  });
});
