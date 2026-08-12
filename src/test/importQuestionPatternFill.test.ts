import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const SRC = readFileSync(resolve(process.cwd(), 'src/pages/ImportReview.tsx'), 'utf8');

/**
 * ČUVAR OBRASCA ZA PITANJA (/import-review). Prag, ključ i vidljivost su
 * nepregovarački; obrazac ne smije postati tiho spajanje.
 */
describe('ImportReview — obrazac odgovora na pitanja, ožičenje stranice', () => {
  it('auto-popunjeni odgovor se NE broji u prag', () => {
    expect(SRC).toContain('if (autoFilledQuestions[row.index]) continue;');
  });

  it('podobna su samo prava pitanja koja nisu pretvorena u prijenos', () => {
    expect(SRC).toContain("if (row.classification.kind !== 'question') continue;");
    expect(SRC).toContain('if (decisions.transfers[row.index]?.enabled) continue;');
  });

  it('ključ je izvedeno ime + novčanik (bez iznosa)', () => {
    const effect = SRC.slice(
      SRC.indexOf('const fills = computeQuestionPatternFill') - 3000,
      SRC.indexOf('const fills = computeQuestionPatternFill'),
    );
    expect(effect).toContain('deriveComparableName');
    expect(effect).toContain('resolvePaymentSourceKey');
    expect(effect).not.toContain('amount');
  });

  it('svaki popunjeni odgovor nosi vidljivu oznaku i traku "Poništi za sve"', () => {
    expect(SRC).toContain('data-testid={`question-pattern-filled-${row.index}`}');
    expect(SRC).toContain('data-testid="question-pattern-fill-undo-all"');
    expect(SRC).toContain("t('importReview.patternFill.badge')");
  });

  it('"Poništi za sve" vraća odgovore u neodgovoreno i gasi obrazac', () => {
    expect(SRC).toMatch(
      /const undoAllQuestionFills[\s\S]{0,600}answerQuestion\(next, idx, null\)[\s\S]{0,200}setAutoFilledQuestions\(\{\}\);[\s\S]{0,120}setQuestionPatternDisabled\(true\);/,
    );
  });

  it('ručna izmjena gasi oznaku na tom retku', () => {
    expect(SRC).toMatch(/const updateQuestion[\s\S]{0,600}setAutoFilledQuestions\(prev => \{[\s\S]{0,200}delete next\[idx\];/);
  });
});
