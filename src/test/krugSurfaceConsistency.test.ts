/**
 * WS1a — Krug Surface Consistency regression suite.
 *
 * Ne testira runtime rendering (nema React DOM assertion-a) — testira
 * source truth invariante koje bi tiho pukle da netko vrati `private`
 * kao user-facing izbor, ili da uvede Krug u transfer entry surface.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';

const read = (rel: string) => readFileSync(resolve(__dirname, '..', '..', rel), 'utf8');

describe('Krug UI: private is not a user-facing option (Semantics Lock v1)', () => {
  it('KrugSelector nudi samo personal | shared', () => {
    const src = read('src/components/krug/KrugSelector.tsx');
    expect(src).toContain("export type KrugSelectorPrivacy = 'personal' | 'shared'");
    // Ne smije se nuditi kao selectable button/option
    expect(src).not.toMatch(/handlePrivacyChange\(\s*['"]private['"]\s*\)/);
  });

  it('KrugTransactionPanel privacyOptions ne uključuje private', () => {
    const src = read('src/components/krug/KrugTransactionPanel.tsx');
    // Iz privacyOptions arraya (izbori) mora nestati private key
    const arr = src.match(/privacyOptions[\s\S]{0,600}?\];/);
    expect(arr, 'privacyOptions block not found').toBeTruthy();
    expect(arr![0]).not.toMatch(/key:\s*['"]private['"]/);
    // EyeOff ikona koja se koristila samo za private više se ne importa
    expect(src).not.toMatch(/\bEyeOff\b/);
  });

  it('Legacy private se prepoznaje i mapira u personal na display sloju', () => {
    const panel = read('src/components/krug/KrugTransactionPanel.tsx');
    expect(panel).toMatch(/isLegacyPrivate\s*=\s*flags\.prevPrivacy\s*===\s*['"]private['"]/);
    expect(panel).toMatch(/legacyPrivateHint/);
    const editor = read('src/components/EditTransactionDialog.tsx');
    expect(editor).toMatch(/legacyPrivate/);
  });
});

describe('Krug entry surface guards', () => {
  it('ManualExpenseForm ne renderira KrugSelector za transfer', () => {
    const src = read('src/components/add-expense/ManualExpenseForm.tsx');
    expect(src).toMatch(/props\.type\s*!==\s*['"]transfer['"]/);
  });

  it('EditTransactionDialog ne renderira KrugSelector za transfer', () => {
    const src = read('src/components/EditTransactionDialog.tsx');
    expect(src).toMatch(/type\s*!==\s*['"]transfer['"]/);
  });

  it('AddExpenseDialog gasi Krug u business kontekstu', () => {
    const src = read('src/components/add-expense/AddExpenseDialog.tsx');
    expect(src).toMatch(/showKrugSelector=\{!effectiveBusinessProfileId\}/);
    // Payload put mora nulirati krug u business modu
    expect(src).toMatch(/!effectiveBusinessProfileId\s*\?\s*\(krugId\s*\|\|\s*null\)\s*:\s*null/);
  });

  it('KrugSelector state u AddExpenseDialog je personal | shared (bez private)', () => {
    const src = read('src/components/add-expense/AddExpenseDialog.tsx');
    expect(src).toMatch(/useState<'personal'\s*\|\s*'shared'>/);
  });
});

describe('Krug pokriva expense + income, ne transfer', () => {
  it('Manual entry surface ne nameće type=expense', () => {
    // KrugSelector se prikazuje za sve non-transfer tipove (expense + income).
    const src = read('src/components/add-expense/ManualExpenseForm.tsx');
    // Uvjet je isključivo type !== transfer, nema whitelisting-a na expense.
    expect(src).not.toMatch(/props\.type\s*===\s*['"]expense['"][\s\S]{0,120}KrugSelector/);
  });
});
