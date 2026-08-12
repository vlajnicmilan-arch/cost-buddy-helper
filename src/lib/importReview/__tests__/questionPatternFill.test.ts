import { describe, it, expect } from 'vitest';
import {
  buildQuestionPatternKey,
  computeQuestionPatternFill,
  PATTERN_FILL_THRESHOLD,
  type QuestionCandidateRow,
  type QuestionManualDecision,
} from '../questionPatternFill';

const WALLET = 'custom:aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const WALLET_B = 'custom:bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
const NAME = 'naknada za placanje';

const manualNew = (index: number, over: Partial<QuestionManualDecision> = {}): QuestionManualDecision => ({
  index,
  nameKey: NAME,
  sourceWalletKey: WALLET,
  answer: { choice: 'new' },
  ...over,
});

const row = (index: number, over: Partial<QuestionCandidateRow> = {}): QuestionCandidateRow => ({
  index,
  nameKey: NAME,
  sourceWalletKey: WALLET,
  candidates: [],
  ...over,
});

describe('buildQuestionPatternKey', () => {
  it('traži ime i novčanik; iznos nije dio ključa', () => {
    expect(buildQuestionPatternKey({ nameKey: NAME, sourceWalletKey: WALLET })).toBe(`${NAME}::${WALLET}`);
    expect(buildQuestionPatternKey({ nameKey: null, sourceWalletKey: WALLET })).toBeNull();
    expect(buildQuestionPatternKey({ nameKey: NAME, sourceWalletKey: null })).toBeNull();
    expect(buildQuestionPatternKey({ nameKey: NAME, sourceWalletKey: WALLET })).not.toMatch(/\d+\.\d{2}/);
  });
});

describe('computeQuestionPatternFill — 8x "Naknada za plaćanje"', () => {
  it('dva ručna odgovora popune preostalih šest', () => {
    const out = computeQuestionPatternFill({
      manual: [manualNew(0), manualNew(1)],
      candidates: [2, 3, 4, 5, 6, 7].map(i => row(i)),
    });
    expect(out.map(f => f.index)).toEqual([2, 3, 4, 5, 6, 7]);
    for (const f of out) expect(f.answer).toEqual({ choice: 'new' });
  });

  it('JEDNA odluka ne pokreće ništa', () => {
    expect(PATTERN_FILL_THRESHOLD).toBe(2);
    expect(computeQuestionPatternFill({ manual: [manualNew(0)], candidates: [row(1), row(2)] })).toEqual([]);
  });

  it('"Poništi za sve" (nema više ručnih odluka u obrascu) ne popunjava ništa', () => {
    expect(computeQuestionPatternFill({ manual: [], candidates: [row(2), row(3)] })).toEqual([]);
  });

  it('drugi novčanik ostaje netaknut', () => {
    const out = computeQuestionPatternFill({
      manual: [manualNew(0), manualNew(1)],
      candidates: [row(2, { sourceWalletKey: WALLET_B })],
    });
    expect(out).toEqual([]);
  });

  it('drugo ime ostaje netaknuto', () => {
    const out = computeQuestionPatternFill({
      manual: [manualNew(0), manualNew(1)],
      candidates: [row(2, { nameKey: 'konzum' })],
    });
    expect(out).toEqual([]);
  });

  it('nesuglasne ručne odluke ne popunjavaju ništa', () => {
    const out = computeQuestionPatternFill({
      manual: [
        manualNew(0),
        manualNew(1, { answer: { choice: 'merge', candidateNameKey: NAME } }),
      ],
      candidates: [row(2, { candidates: [{ id: 'c1', nameKey: NAME }] })],
    });
    expect(out).toEqual([]);
  });

  it('izuzeti redak se ne popunjava', () => {
    const out = computeQuestionPatternFill({
      manual: [manualNew(0), manualNew(1)],
      candidates: [row(2), row(3)],
      excluded: [2],
    });
    expect(out.map(f => f.index)).toEqual([3]);
  });
});

describe('computeQuestionPatternFill — "spoji s postojećim" je uzak', () => {
  const mergeManual = (index: number): QuestionManualDecision =>
    manualNew(index, { answer: { choice: 'merge', candidateNameKey: NAME } });

  it('popunjava se SAMO kad pitanje ima točno jednog kandidata istog imena', () => {
    const out = computeQuestionPatternFill({
      manual: [mergeManual(0), mergeManual(1)],
      candidates: [row(2, { candidates: [{ id: 'c9', nameKey: NAME }] })],
    });
    expect(out).toEqual([{ index: 2, answer: { choice: 'merge', manualId: 'c9' } }]);
  });

  it('pitanje s DVA kandidata NIJE popunjeno', () => {
    const out = computeQuestionPatternFill({
      manual: [mergeManual(0), mergeManual(1)],
      candidates: [row(2, { candidates: [{ id: 'c1', nameKey: NAME }, { id: 'c2', nameKey: NAME }] })],
    });
    expect(out).toEqual([]);
  });

  it('kandidat drugog imena se NIKAD ne spaja ("spoji s bilo čim" ne postoji)', () => {
    const out = computeQuestionPatternFill({
      manual: [mergeManual(0), mergeManual(1)],
      candidates: [row(2, { candidates: [{ id: 'c1', nameKey: 'konzum' }] })],
    });
    expect(out).toEqual([]);
  });
});
