/**
 * UI refresh — Transaction Attachment Bar.
 *
 * Source-level guardovi za novi kompaktni chip red. Ne testira runtime rendering
 * (nema React DOM), samo osigurava da se UI reorganizacija drži zaključanih
 * pravila vidljivosti i semantike (WS1/WS2):
 *  - Krug chip nikada nije aktivan za `transfer`.
 *  - Krug chip u business kontekstu ostaje gugašen (`showKrugSelector={!effectiveBusinessProfileId}`).
 *  - Manual i Scan surface koriste **isti** AttachmentBar (parity).
 *  - Projekt/Smjer handleri (onSelectedProjectIdChange / onSelectedBudgetIdChange)
 *    prolaze kroz bar netaknuti — write-path guardovi ostaju izvorni.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';

const read = (rel: string) => readFileSync(resolve(__dirname, '..', '..', rel), 'utf8');

describe('AttachmentBar — kompaktni chip red', () => {
  it('AttachmentBar komponenta postoji i eksportira se', () => {
    const src = read('src/components/add-expense/AttachmentBar.tsx');
    expect(src).toMatch(/export const AttachmentBar/);
    // Tri chipa: projekt, smjer, krug
    expect(src).toMatch(/attachment-chip-project/);
    expect(src).toMatch(/attachment-chip-budget/);
    expect(src).toMatch(/attachment-chip-krug/);
  });

  it('AttachmentBar propagira postojeće handlere netaknute (bez mijenjanja write-patha)', () => {
    const src = read('src/components/add-expense/AttachmentBar.tsx');
    expect(src).toMatch(/onSelectedProjectIdChange\?\.\(/);
    expect(src).toMatch(/onSelectedBudgetIdChange\?\.\(/);
    expect(src).toMatch(/onKrugChange\?\.\(/);
  });
});

describe('ManualExpenseForm — koristi AttachmentBar umjesto zasebnih selectora', () => {
  const src = read('src/components/add-expense/ManualExpenseForm.tsx');

  it('koristi AttachmentBar', () => {
    expect(src).toMatch(/import\s+\{\s*AttachmentBar\s*\}\s+from\s+['"]\.\/AttachmentBar['"]/);
    expect(src).toMatch(/<AttachmentBar/);
  });

  it('Krug ostaje zaključan iza non-transfer guarda', () => {
    expect(src).toMatch(/props\.type\s*!==\s*['"]transfer['"]/);
  });

  it('Projekt chip poštuje `projectsModuleEnabled` gate', () => {
    expect(src).toMatch(/showProject=\{projectsModuleEnabled\s*&&\s*props\.projects\.length\s*>\s*0\}/);
  });

  it('Smjer chip poštuje `type === expense` gate', () => {
    expect(src).toMatch(/showBudget=\{props\.type\s*===\s*['"]expense['"]\s*&&\s*props\.budgets\.length\s*>\s*0\}/);
  });
});

describe('ScannedDataPreview — parity s ManualExpenseForm attachment barom', () => {
  const src = read('src/components/add-expense/ScannedDataPreview.tsx');

  it('koristi isti AttachmentBar', () => {
    expect(src).toMatch(/import\s+\{\s*AttachmentBar\s*\}\s+from\s+['"]\.\/AttachmentBar['"]/);
    expect(src).toMatch(/<AttachmentBar/);
  });

  it('Krug chip ostaje personal-only + non-transfer + onKrugChange guard', () => {
    expect(src).toMatch(
      /showKrug=\{!!\(showKrugSelector\s*&&\s*scannedData\.transaction_type\s*!==\s*['"]transfer['"]\s*&&\s*onKrugChange\)\}/,
    );
  });

  it('Scan surface zadržava mutual-exclusion projekt/budžet (scan-specific)', () => {
    expect(src).toMatch(/mutuallyExclusiveProjectBudget/);
  });
});
