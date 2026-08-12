import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { computePatternFill, type PatternCandidateRow, type PatternManualDecision } from '@/lib/importReview/patternFill';

const SRC = readFileSync(resolve(process.cwd(), 'src/pages/ImportReview.tsx'), 'utf8');

/**
 * ČUVAR UČENJA UNUTAR SERIJE (/import-review).
 * Prag, ključ i vidljivost su nepregovarački; obrazac ne smije dirati ponudu
 * kasne kartice, pitanja, fingerprint ni needs_explanation.
 */
describe('ImportReview — obrazac serije, ožičenje stranice', () => {
  it('auto-popunjeni redak se NE broji u prag', () => {
    expect(SRC).toMatch(/if \(autoFilled\[row\.index\]\) continue;/);
  });

  it('podobni su samo čisti novi redci — bez fingerprinta, kasne kartice i pitanja', () => {
    expect(SRC).toContain("if (row.classification.kind !== 'new') continue;");
    expect(SRC).toContain('if (row.classification.existsByFingerprint) continue;');
    expect(SRC).toContain('if (row.lateMatchOffer) continue;');
    expect(SRC).toContain('if (decisions.questions[row.index]) continue;');
  });

  it('popunjavanje ne pali needs_explanation ni pravila', () => {
    const effect = SRC.slice(SRC.indexOf('const fills = computePatternFill'), SRC.indexOf('const handleCancel'));
    expect(effect).not.toContain('setNeedsExplanation');
    expect(effect).toContain('rememberRule: false');
  });

  it('svaki popunjeni redak nosi vidljivu oznaku', () => {
    expect(SRC).toContain("t('importReview.patternFill.badge')");
    expect(SRC).toContain('data-testid={`pattern-filled-${row.index}`}');
  });

  it('"Poništi za sve" vraća samo auto-popunjene retke i gasi obrazac', () => {
    expect(SRC).toMatch(/const undoAllPatternFills[\s\S]{0,600}setTransferDecision\(next, idx, null\)[\s\S]{0,200}setAutoFilled\(\{\}\);[\s\S]{0,80}setPatternDisabled\(true\);/);
    expect(SRC).toContain("t('importReview.patternFill.undoAll')");
  });

  it('ručna izmjena gasi oznaku na tom retku', () => {
    expect(SRC).toMatch(/const updateTransfer[\s\S]{0,700}setAutoFilled\(prev => \{[\s\S]{0,200}delete next\[idx\];/);
  });
});

describe('Obrazac serije — KEKS reprodukcija kroz čistu logiku', () => {
  const WALLET = 'custom:aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
  const TARGET = 'cccccccc-cccc-cccc-cccc-cccccccccccc';
  const base = { merchantKey: 'aircash eu zagreb', sourceWalletKey: WALLET, direction: 'out' as const };
  const manual: PatternManualDecision[] = [
    { index: 0, ...base, targetIncomeSourceId: TARGET },
    { index: 1, ...base, targetIncomeSourceId: TARGET },
  ];
  const candidates: PatternCandidateRow[] = [2, 3, 4, 5].map(index => ({ index, ...base }));

  it('preostala četiri retka se popune, a nakon "Poništi za sve" ništa se ne popunjava', () => {
    const filled = computePatternFill({ manual, candidates });
    expect(filled).toHaveLength(4);
    // "Poništi za sve" u stranici gasi obrazac za cijelu seriju — ovdje ga
    // modeliramo praznim ulazom ručnih odluka.
    expect(computePatternFill({ manual: [], candidates })).toEqual([]);
  });

  it('treći redak vraćen u neodlučeno ostaje izuzet, ostali netaknuti', () => {
    const filled = computePatternFill({ manual, candidates, excluded: [4] });
    expect(filled.map(f => f.index)).toEqual([2, 3, 5]);
  });
});
