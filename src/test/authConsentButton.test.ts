import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const src = readFileSync(resolve(process.cwd(), 'src/pages/Auth.tsx'), 'utf8');

describe('auth register button — consent is validated on submit, not by disabling', () => {
  it('submit button is disabled only while loading (never by missing consent)', () => {
    const submit = src.match(/<Button\s+type="submit"[\s\S]*?\/>|<Button\s+type="submit"[\s\S]*?<\/Button>/)?.[0] ?? '';
    expect(submit).toContain('disabled={loading}');
    expect(submit).not.toContain('gdprConsent');
    // Nowhere in the file may consent disable any button again.
    expect(src).not.toMatch(/disabled=\{[^}]*gdprConsent[^}]*\}/);
  });

  it('submit without consent shows an inline error instead of silence', () => {
    // handleSubmit must short-circuit with a visible message...
    expect(src).toContain("error_code: 'consent_required'");
    expect(src).toContain("stage: 'client_validation'");
    expect(src).toContain("t('auth.consentRequired')");
    // ...rendered next to the checkbox like other field errors.
    expect(src).toContain('errors.consent && <p className="text-sm text-destructive"');
    // ...and the checkbox receives focus so the user sees where the problem is.
    expect(src).toContain('gdprConsentRef.current?.focus()');
  });

  it('marks the consent checkbox as required', () => {
    expect(src).toContain('aria-required="true"');
    expect(src).toContain('aria-invalid={!!errors.consent}');
  });

  it('clears the consent error once the checkbox is ticked', () => {
    expect(src).toContain('setErrors((prev) => ({ ...prev, consent: undefined }))');
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
