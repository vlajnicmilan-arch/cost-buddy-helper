/**
 * Guard — istekla sesija na pozivnici u Krug.
 *
 * Incident 08.08.2026: `krug-add-member` je vraćao 401 (session_not_found), UI
 * je prikazao generičku „Greška pri dodavanju člana.", a u logovima nije bilo
 * NIJEDNOG zapisa jer 401 grana nije ništa logirala. Dijagnoza je trajala
 * dulje nego popravak. Ovaj test drži oba kraja: server logira, klijent mapira
 * 401 u `unauthorized` i prikazuje poruku o isteku sesije.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const FN = readFileSync(
  resolve(__dirname, '../../supabase/functions/krug-add-member/index.ts'),
  'utf8',
);
const HOOK = readFileSync(resolve(__dirname, '../hooks/useKrugMemberMutations.ts'), 'utf8');
const DIALOG = readFileSync(
  resolve(__dirname, '../components/krug/AddKrugMemberDialog.tsx'),
  'utf8',
);
const HR = JSON.parse(readFileSync(resolve(__dirname, '../i18n/locales/hr.json'), 'utf8'));
const EN = JSON.parse(readFileSync(resolve(__dirname, '../i18n/locales/en.json'), 'utf8'));
const DE = JSON.parse(readFileSync(resolve(__dirname, '../i18n/locales/de.json'), 'utf8'));

describe('krug-add-member 401 observability', () => {
  it('warns when the Authorization header is missing', () => {
    expect(FN).toMatch(/console\.warn\("\[KRUG-ADD-MEMBER\] unauthorized: missing Authorization/);
  });

  it('warns when the session is invalid or expired', () => {
    expect(FN).toMatch(/console\.warn\("\[KRUG-ADD-MEMBER\] unauthorized: session invalid/);
  });

  it('never logs the raw token', () => {
    expect(FN).not.toMatch(/console\.(warn|log|error)\([^)]*authHeader/);
  });
});

describe('client mapping of the expired session', () => {
  it('maps HTTP 401 to the unauthorized outcome', () => {
    expect(HOOK).toMatch(/if \(status === 401\) return \{ ok: false, error: 'unauthorized' \}/);
  });

  it('does not fold unauthorized into the generic error branch', () => {
    expect(DIALOG).toMatch(/case 'unauthorized':[\s\S]{0,200}krug\.member\.add\.errors\.unauthorized/);
  });

  it.each([
    ['hr', HR],
    ['en', EN],
    ['de', DE],
  ])('has the %s translation', (_loc, dict) => {
    const msg = dict?.krug?.member?.add?.errors?.unauthorized;
    expect(typeof msg).toBe('string');
    expect((msg as string).length).toBeGreaterThan(10);
  });
});
