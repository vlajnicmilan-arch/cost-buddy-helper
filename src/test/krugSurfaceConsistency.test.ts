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

  it('WS1b: legacy private prikazuje personal kao aktivan i dopušta migraciju klikom', () => {
    const panel = read('src/components/krug/KrugTransactionPanel.tsx');
    // Aktivnost NE smije više biti gated iza !isLegacyPrivate — legacy zapis
    // mora vizualno prikazati `personal` kao aktivan izbor.
    expect(panel).not.toMatch(/active\s*=\s*!isLegacyPrivate\s*&&/);
    // Mora postojati izuzeće koje dopušta klik na aktivan `personal` gumb
    // isključivo za legacy `private` (migracijski put).
    expect(panel).toMatch(/isMigrationTarget\s*=\s*isLegacyPrivate\s*&&\s*opt\.key\s*===\s*['"]personal['"]/);
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

  it('KrugSelector state u AddExpenseDialog je tri-state personal | shared | null (bez skrivenog defaulta)', () => {
    const src = read('src/components/add-expense/AddExpenseDialog.tsx');
    expect(src).toMatch(/useState<'personal'\s*\|\s*'shared'\s*\|\s*null>/);
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

describe('WS2a — Scan create surface parity with manual create', () => {
  it('ScannedDataPreview importa i renderira KrugSelector iza triple-guard-a (show + non-transfer + onChange)', () => {
    const src = read('src/components/add-expense/ScannedDataPreview.tsx');
    expect(src).toMatch(/from\s+['"]@\/components\/krug\/KrugSelector['"]/);
    // Guard mora eksplicitno isključiti transfer i zahtijevati eksplicitno onKrugChange
    expect(src).toMatch(
      /showKrugSelector\s*&&\s*scannedData\.transaction_type\s*!==\s*['"]transfer['"]\s*&&\s*onKrugChange/,
    );
  });

  it('ScannedDataPreview props tipiziraju privacy kao personal | shared (bez private)', () => {
    const src = read('src/components/add-expense/ScannedDataPreview.tsx');
    expect(src).toMatch(/KrugSelectorPrivacy/);
    // Ne smije se pojaviti bilo koji default ili literal 'private' za privacy u ovoj surface-i
    expect(src).not.toMatch(/privacy['"]?\s*:\s*['"]private['"]/);
  });

  it('AddExpenseDialog prosljeđuje scan preview-u isti personal-only guard kao manual formi', () => {
    const src = read('src/components/add-expense/AddExpenseDialog.tsx');
    // Show flag = negacija business konteksta, kao i u manual putu
    const matches = src.match(/showKrugSelector=\{!effectiveBusinessProfileId\}/g) ?? [];
    // Jedan za ManualExpenseForm, jedan za ScannedDataPreview
    expect(matches.length).toBeGreaterThanOrEqual(2);
    // Scan accept payload šalje krug (write parity s manual)
    expect(src).toMatch(/krug_id:\s*!effectiveBusinessProfileId\s*\?\s*\(krugId\s*\|\|\s*null\)\s*:\s*null/);
  });
});

describe('WS2b — Installment create path parity with manual create', () => {
  it('AddExpenseDialog installment grana veže krug_id i krug_privacy istim guard-om kao manual/scan put', () => {
    const src = read('src/components/add-expense/AddExpenseDialog.tsx');
    // Occurrences moraju postojati barem 3 puta: manual newExpense, scan accept, installment grana.
    const krugIdWrites = src.match(/krug_id:\s*!effectiveBusinessProfileId\s*\?\s*\(krugId\s*\|\|\s*null\)\s*:\s*null/g) ?? [];
    expect(krugIdWrites.length).toBeGreaterThanOrEqual(3);
    const krugPrivacyWrites = src.match(/krug_privacy:\s*!effectiveBusinessProfileId\s*&&\s*krugId\s*\?\s*krugPrivacy\s*:\s*null/g) ?? [];
    expect(krugPrivacyWrites.length).toBeGreaterThanOrEqual(3);
  });

  it('Installment grana ostaje unutar non-transfer guard-a (transfer se ne installmentira)', () => {
    const src = read('src/components/add-expense/AddExpenseDialog.tsx');
    // Ulaz u installment granu je gated iza `isInstallment && type !== 'transfer'`.
    expect(src).toMatch(/isInstallment\s*&&\s*type\s*!==\s*['"]transfer['"]/);
  });

  it('Installment plan payload ne uvodi novu Krug semantiku (nema krug_id na createInstallmentPlan args)', () => {
    const src = read('src/components/add-expense/AddExpenseDialog.tsx');
    const call = src.match(/createInstallmentPlan\(\{[\s\S]*?\}\);/);
    expect(call, 'createInstallmentPlan call not found').toBeTruthy();
    // Krug ne živi na planu — samo na inicijalnom expense zapisu. Minimalni model.
    expect(call![0]).not.toMatch(/krug_id/);
    expect(call![0]).not.toMatch(/krug_privacy/);
  });
});

