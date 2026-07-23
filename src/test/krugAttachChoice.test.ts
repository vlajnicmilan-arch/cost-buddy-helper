/**
 * Krug attach choice — bez skrivenog defaulta + auto-close popupa.
 *
 * Source-level guardovi za novi tri-state model (`personal | shared | null`)
 * u AttachmentBar-u i AddExpenseDialog-u:
 *  - Odabir Kruga u panelu NE postavlja implicitno `personal` — privacy ostaje `null`.
 *  - Klik na Moje / Za Krug postavlja privacy I zatvara popover (`close()`).
 *  - Submit u AddExpenseDialog blokira ako je `krugId` postavljen a `krugPrivacy == null`.
 *  - Scan surface (`acceptScannedData`) ima isti guard.
 *  - State u AddExpenseDialog je nullable: `useState<'personal' | 'shared' | null>`.
 *  - Reset flow postavlja privacy na `null`, ne na `'personal'`.
 *  - Promjena Kruga resetira privacy na `null` (nema carryovera).
 *
 * Namjerno source-level (bez DOM rendera) — svrha je zaključati semantiku
 * write-patha bez ovisnosti o preview iframu.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';

const read = (rel: string) => readFileSync(resolve(__dirname, '..', '..', rel), 'utf8');

describe('AttachmentBar — Krug tri-state (personal | shared | null)', () => {
  const src = read('src/components/add-expense/AttachmentBar.tsx');

  it('props tipiziraju privacy kao KrugPrivacy | null (bez skrivenog defaulta)', () => {
    expect(src).toMatch(/krugPrivacy\?:\s*KrugPrivacy\s*\|\s*null/);
    expect(src).toMatch(
      /onKrugChange\?:\s*\(next:\s*\{\s*krugId:\s*string\s*\|\s*null;\s*privacy:\s*KrugPrivacy\s*\|\s*null\s*\}\)/,
    );
  });

  it('odabir novog Kruga resetira privacy na null (bez carryovera)', () => {
    // Guard nad grananjem: kad je odabrani k.id razlicit od trenutnog krugId, privacy = null.
    expect(src).toMatch(/props\.krugId\s*===\s*k\.id\s*\?\s*\(props\.krugPrivacy\s*\?\?\s*null\)\s*:\s*null/);
  });

  it('Moje / Za Krug gumb postavlja privacy I zatvara popover (close())', () => {
    // Personal
    expect(src).toMatch(
      /data-testid="krug-privacy-personal"[\s\S]{0,220}privacy:\s*'personal'\s*\}\)[\s\S]{0,40}close\(\)/,
    );
    // Shared
    expect(src).toMatch(
      /data-testid="krug-privacy-shared"[\s\S]{0,220}privacy:\s*'shared'\s*\}\)[\s\S]{0,40}close\(\)/,
    );
  });

  it('nedovršeno stanje ima vizualni hint dok privacy nije odabran', () => {
    expect(src).toMatch(/krug-privacy-required-hint/);
    expect(src).toMatch(/krug\.selector\.pickPrivacyHint/);
  });

  it('Clear briše i krug i privacy (oboje null)', () => {
    expect(src).toMatch(
      /onClear=\{\(\)\s*=>\s*runKrugWrite\(\(\)\s*=>\s*props\.onKrugChange\?\.\(\{\s*krugId:\s*null,\s*privacy:\s*null\s*\}\)\)\}/,
    );
  });
});

describe('AddExpenseDialog — Krug tri-state state model + submit guardovi', () => {
  const src = read('src/components/add-expense/AddExpenseDialog.tsx');

  it('krugPrivacy state je tri-state (nullable)', () => {
    expect(src).toMatch(/useState<'personal'\s*\|\s*'shared'\s*\|\s*null>\(null\)/);
  });

  it('reset postavlja privacy na null (bez skrivenog defaulta)', () => {
    expect(src).toMatch(/setKrugPrivacy\(null\)/);
    expect(src).not.toMatch(/setKrugPrivacy\(['"]personal['"]\)/);
  });

  it('handleSubmit blokira kad je krug odabran a privacy null', () => {
    expect(src).toMatch(
      /!effectiveBusinessProfileId\s*&&\s*krugId\s*&&\s*krugPrivacy\s*==\s*null[\s\S]{0,200}krug\.selector\.pickPrivacyHint/,
    );
  });

  it('acceptScannedData ima isti guard (parity manual / scan)', () => {
    // Guard mora postojati dvaput u fajlu (handleSubmit + acceptScannedData)
    const matches = src.match(/krugId\s*&&\s*krugPrivacy\s*==\s*null/g) ?? [];
    expect(matches.length).toBeGreaterThanOrEqual(2);
  });
});
