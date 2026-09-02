/**
 * Newsletter privola pri registraciji — regresijski testovi.
 *
 * Pokriva:
 *  - payload sadrži DOSLOVAN tekst i jezik
 *  - bez označene kvačice NE ide upis (ne poziva se recordNewsletterConsent)
 *  - bez sesije namjera se sprema u sessionStorage i flusha pri prvoj prijavi
 *  - kvačica je uvijek prazna po zadanom (guard: inicijalno stanje)
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  buildConsentPayload,
  stashPendingConsent,
  readPendingConsent,
  clearPendingConsent,
  recordNewsletterConsent,
  flushPendingNewsletterConsent,
  NEWSLETTER_CONSENT_SOURCE,
} from '@/lib/newsletterConsent';

const insertMock = vi.fn();

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from: () => ({ insert: insertMock }),
  },
}));

vi.mock('react-i18next', async () => {
  const { createReactI18nextMock } = await import('@/test/mocks/reactI18next');
  return createReactI18nextMock();
});

describe('newsletterConsent', () => {
  beforeEach(() => {
    insertMock.mockReset();
    insertMock.mockResolvedValue({ error: null });
    sessionStorage.clear();
  });

  it('buildConsentPayload sadrži doslovni tekst, jezik i izvor', () => {
    const p = buildConsentPayload('  Ana@Example.com ', 'Šaljem savjete...', 'hr');
    expect(p).toEqual({
      email: 'ana@example.com',
      consentText: 'Šaljem savjete...',
      locale: 'hr',
      source: NEWSLETTER_CONSENT_SOURCE,
    });
  });

  it('recordNewsletterConsent upisuje točno jedan redak s doslovnim tekstom i jezikom', async () => {
    const p = buildConsentPayload('ana@example.com', 'Točan tekst privole', 'de');
    const ok = await recordNewsletterConsent('user-1', p);
    expect(ok).toBe(true);
    expect(insertMock).toHaveBeenCalledTimes(1);
    expect(insertMock).toHaveBeenCalledWith({
      user_id: 'user-1',
      email: 'ana@example.com',
      consent_text: 'Točan tekst privole',
      locale: 'de',
      source: 'registracija',
    });
  });

  it('greška pri upisu ne baca iznimku (privola ne blokira registraciju)', async () => {
    insertMock.mockResolvedValue({ error: new Error('rls') });
    const ok = await recordNewsletterConsent('user-1', buildConsentPayload('a@b.c', 't', 'hr'));
    expect(ok).toBe(false);
  });

  it('stash → read → clear roundtrip (odložena privola pri potvrdi maila)', () => {
    const p = buildConsentPayload('ana@example.com', 'Tekst', 'hr');
    stashPendingConsent(p);
    expect(readPendingConsent()).toEqual(p);
    clearPendingConsent();
    expect(readPendingConsent()).toBeNull();
  });

  it('flush upisuje odloženu privolu i čisti storage', async () => {
    stashPendingConsent(buildConsentPayload('ana@example.com', 'Tekst', 'hr'));
    await flushPendingNewsletterConsent('user-9');
    expect(insertMock).toHaveBeenCalledTimes(1);
    expect(insertMock.mock.calls[0][0].user_id).toBe('user-9');
    expect(readPendingConsent()).toBeNull();
  });

  it('flush bez odložene privole NE dira bazu', async () => {
    await flushPendingNewsletterConsent('user-9');
    expect(insertMock).not.toHaveBeenCalled();
  });
});

describe('Auth forma — newsletter kvačica', () => {
  it('inicijalno stanje kvačice je false (nikad pred-označena)', async () => {
    // Guard: izvorni kod Auth.tsx mora inicijalizirati newsletterConsent na false
    // i smije ga postavljati samo na korisničku akciju (onChange) ili reset.
    const fs = await import('node:fs/promises');
    const src = await fs.readFile('src/pages/Auth.tsx', 'utf-8');
    expect(src).toContain('useState(false);');
    const initLine = src.split('\n').find((l) => l.includes('newsletterConsent') && l.includes('useState'));
    expect(initLine).toBeDefined();
    expect(initLine).toContain('useState(false)');
    // Zabranjeno: useState(true) za newsletter
    expect(src).not.toMatch(/newsletterConsent[^)]*useState\(true\)/);
  });

  it('nijedna kvačica ne onemogućuje gumb — gumb je onemogućen samo dok traje slanje', async () => {
    const fs = await import('node:fs/promises');
    const src = await fs.readFile('src/pages/Auth.tsx', 'utf-8');
    // Nijedan disabled izraz ne smije ovisiti o kvačicama.
    const disabledExprs = src.match(/disabled=\{[^}]*\}/g) ?? [];
    expect(disabledExprs.length).toBeGreaterThan(0);
    for (const expr of disabledExprs) {
      expect(expr).not.toContain('newsletterConsent');
      expect(expr).not.toContain('gdprConsent');
    }
    // Submit gumb je onemogućen isključivo dok traje slanje.
    const submit = src.match(/<Button\s+type="submit"[\s\S]*?auth\.register[\s\S]*?<\/Button>/)?.[0] ?? '';
    expect(submit).toContain('disabled={loading}');
  });

  it('slanje bez prihvata Uvjeta ne prolazi i daje vidljivu poruku uz kvačicu', async () => {
    const fs = await import('node:fs/promises');
    const src = await fs.readFile('src/pages/Auth.tsx', 'utf-8');
    expect(src).toContain("error_code: 'terms_not_accepted'");
    expect(src).toContain("t('auth.termsRequired')");
    expect(src).toContain('errors.terms && <p className="text-sm text-destructive"');
    expect(src).toContain('termsAcceptanceRef.current?.focus()');
    // Newsletter kvačica nije dio te validacije.
    const validation = src.slice(src.indexOf('terms_not_accepted') - 600, src.indexOf('terms_not_accepted') + 600);
    expect(validation).not.toContain('newsletterConsent');
  });


  it('upis se događa samo unutar if (newsletterConsent) grane', async () => {
    const fs = await import('node:fs/promises');
    const src = await fs.readFile('src/pages/Auth.tsx', 'utf-8');
    const guardIdx = src.indexOf('if (newsletterConsent)');
    expect(guardIdx).toBeGreaterThan(-1);
    const recordIdx = src.indexOf('recordNewsletterConsent(uid, payload)');
    expect(recordIdx).toBeGreaterThan(guardIdx);
  });
});
