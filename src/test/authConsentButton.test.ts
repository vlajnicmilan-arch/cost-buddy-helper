import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const src = readFileSync(resolve(process.cwd(), 'src/pages/Auth.tsx'), 'utf8');

describe('auth register button — consent is validated on submit, not by disabling', () => {
  it('uses the user identity returned by signUp instead of reading the session', () => {
    expect(src).toContain('const uid = data?.user?.id;');
    expect(src).not.toContain('const { data: sessionData } = await supabase.auth.getSession()');
  });

  it('submit button is disabled only while loading (never by missing consent)', () => {
    // The register/login submit is the one rendering auth.login / auth.register.
    const submit = src.match(/<Button\s+type="submit"[\s\S]*?auth\.register[\s\S]*?<\/Button>/)?.[0] ?? '';
    expect(submit).not.toBe('');
    expect(submit).toContain('disabled={loading}');
    expect(submit).not.toContain('gdprConsent');
    // Nowhere in the file may consent disable any button again.
    expect(src).not.toMatch(/disabled=\{[^}]*gdprConsent[^}]*\}/);
  });

  it('terms are a notice next to the form, shown in BOTH modes', () => {
    expect(src).not.toContain("error_code: 'terms_not_accepted'");
    expect(src).toContain("t('auth.termsNotice')");
    expect(src).toContain('/terms-of-service');
    expect(src).toContain('/privacy-policy');
    // The notice is not wrapped in a !isLogin branch.
    const idx = src.indexOf("t('auth.termsNotice')");
    expect(src.slice(idx - 300, idx)).not.toContain('{!isLogin && (');
  });

  it('terms acceptance is recorded on all three paths', () => {
    const stashes = src.match(/stashPendingTermsAcceptance\(buildTermsPayload\(\)\)/g) ?? [];
    // login + google + apple
    expect(stashes.length).toBe(3);
    expect(src).toContain('recordTermsAcceptance(uid, termsPayload)');
  });

  it('OAuth buttons sit above the form fields, divider between them', () => {
    const iGoogle = src.indexOf("{t('auth.continueWithGoogle')}");
    const iDivider = src.indexOf("{t('auth.orDivider')}");
    const iEmail = src.indexOf('id="email"');
    expect(iGoogle).toBeGreaterThan(-1);
    expect(iDivider).toBeGreaterThan(iGoogle);
    expect(iEmail).toBeGreaterThan(iDivider);
  });

  it('no longer references the worker name-recognition hint', () => {
    expect(src).not.toContain('nameRecognitionHint');
  });
});
