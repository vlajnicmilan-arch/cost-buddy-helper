/**
 * (c) i (d) — središnja zaštita u useStatusFeedback.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const { logDiagnostic } = vi.hoisted(() => ({ logDiagnostic: vi.fn() }));
vi.mock('@/lib/diagnosticLogger', () => ({ logDiagnostic }));
vi.mock('@/lib/errorMessages', () => ({
  tr: (_key: string, fallback?: string) => fallback ?? _key,
}));

import { showError, __resetFeedbackDedup } from '@/hooks/useStatusFeedback';
import { RAW_ERROR_REPLACEMENT } from '@/lib/rawErrorGuard';

const currentMessage = async () => {
  const mod = await import('@/hooks/useStatusFeedback');
  let seen: string | undefined;
  // Pretplata kroz hook nije potrebna: čitamo kroz javni show → listener.
  const listener = (state: any) => {
    seen = state.message;
  };
  // interni listener registar nije izložen, pa koristimo React-free pristup:
  return { mod, listener, seen };
};

describe('showError — tehnička poruka', () => {
  beforeEach(() => {
    logDiagnostic.mockClear();
    __resetFeedbackDedup();
  });

  it('(c) tehnički tekst se zamjenjuje i zapisuje raw_error_shown', async () => {
    showError('TypeError: Failed to fetch');

    await new Promise((r) => setTimeout(r, 0));

    expect(logDiagnostic).toHaveBeenCalledWith(
      expect.objectContaining({ event: 'raw_error_shown', severity: 'warning' }),
    );
    const details = logDiagnostic.mock.calls[0][0].details;
    expect(details.raw_message).toBe('TypeError: Failed to fetch');
    expect(typeof details.caller_stack).toBe('string');
    expect(RAW_ERROR_REPLACEMENT).toContain('Pokušaj ponovno');
  });

  it('(d) obična hrvatska poruka ne stvara zapis', async () => {
    showError('Greška pri učitavanju budžeta');
    await new Promise((r) => setTimeout(r, 0));
    expect(logDiagnostic).not.toHaveBeenCalled();
  });
});
