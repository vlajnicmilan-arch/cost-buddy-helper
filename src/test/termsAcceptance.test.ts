import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  insertMock: vi.fn(),
  diagnosticMock: vi.fn(),
}));

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from: () => ({ insert: mocks.insertMock }),
  },
}));

vi.mock('@/lib/diagnosticLogger', () => ({
  logDiagnostic: mocks.diagnosticMock,
}));

import {
  buildTermsAcceptancePayload,
  clearPendingTermsAcceptance,
  flushPendingTermsAcceptance,
  readPendingTermsAcceptance,
  recordTermsAcceptance,
  stashPendingTermsAcceptance,
  TERMS_ACCEPTANCE_SOURCE,
} from '@/lib/termsAcceptance';

describe('termsAcceptance', () => {
  beforeEach(() => {
    insertMock.mockReset();
    insertMock.mockResolvedValue({ error: null });
    diagnosticMock.mockReset();
    sessionStorage.clear();
  });

  it('gradi payload s verzijom, doslovnim tekstom, jezikom i izvorom', () => {
    expect(buildTermsAcceptancePayload('1.0', 'Prihvaćam Uvjete korištenja.', 'hr')).toEqual({
      tosVersion: '1.0',
      acceptedText: 'Prihvaćam Uvjete korištenja.',
      locale: 'hr',
      source: TERMS_ACCEPTANCE_SOURCE,
    });
  });

  it('upisuje prihvat u terms_acceptances', async () => {
    const payload = buildTermsAcceptancePayload('1.0', 'I accept the Terms of Use.', 'en');
    await expect(recordTermsAcceptance('user-1', payload)).resolves.toBe(true);
    expect(insertMock).toHaveBeenCalledWith({
      user_id: 'user-1',
      tos_version: '1.0',
      accepted_text: 'I accept the Terms of Use.',
      locale: 'en',
      source: 'registracija',
    });
  });

  it('zapisuje dijagnostiku i ne baca grešku ako upis ne uspije', async () => {
    insertMock.mockResolvedValue({ error: { message: 'write failed', code: '42501' } });
    await expect(recordTermsAcceptance('user-1', buildTermsAcceptancePayload('1.0', 'Tekst', 'hr'))).resolves.toBe(false);
    expect(diagnosticMock).toHaveBeenCalledWith(expect.objectContaining({
      event: 'terms_acceptance_write_failed',
      severity: 'error',
    }));
  });

  it('stash → read → flush → clear radi za potvrdu emaila', async () => {
    const payload = buildTermsAcceptancePayload('1.0', 'Tekst', 'hr');
    stashPendingTermsAcceptance(payload);
    expect(readPendingTermsAcceptance()).toEqual(payload);
    await flushPendingTermsAcceptance('user-9');
    expect(insertMock).toHaveBeenCalledTimes(1);
    expect(readPendingTermsAcceptance()).toBeNull();
  });

  it('ne čisti odgođeni prihvat ako upis ne uspije', async () => {
    insertMock.mockResolvedValue({ error: { message: 'write failed' } });
    const payload = buildTermsAcceptancePayload('1.0', 'Tekst', 'hr');
    stashPendingTermsAcceptance(payload);
    await flushPendingTermsAcceptance('user-9');
    expect(readPendingTermsAcceptance()).toEqual(payload);
    clearPendingTermsAcceptance();
  });
});
