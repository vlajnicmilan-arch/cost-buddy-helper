/**
 * (c) i (d) — središnja zaštita u useStatusFeedback: tehnički tekst se
 * zamjenjuje ljudskom rečenicom i zapisuje kao raw_error_shown.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';

const { logDiagnostic } = vi.hoisted(() => ({ logDiagnostic: vi.fn() }));
vi.mock('@/lib/diagnosticLogger', () => ({ logDiagnostic }));
vi.mock('@/lib/errorMessages', () => ({
  tr: (_key: string, fallback?: string) => fallback ?? _key,
}));

import {
  showError,
  useStatusFeedback,
  dismissFeedback,
  __resetFeedbackDedup,
} from '@/hooks/useStatusFeedback';
import { RAW_ERROR_REPLACEMENT } from '@/lib/rawErrorGuard';

describe('showError — tehnička poruka', () => {
  beforeEach(() => {
    logDiagnostic.mockClear();
    dismissFeedback();
    __resetFeedbackDedup();
  });

  it('(c) pokazuje zamjenski tekst i zove logDiagnostic raw_error_shown', async () => {
    const { result } = renderHook(() => useStatusFeedback());

    act(() => {
      showError('TypeError: Failed to fetch');
    });

    expect(result.current.message).toBe(RAW_ERROR_REPLACEMENT);
    expect(result.current.message).not.toMatch(/fetch/i);

    await waitFor(() => expect(logDiagnostic).toHaveBeenCalled());
    const payload = logDiagnostic.mock.calls[0][0];
    expect(payload.event).toBe('raw_error_shown');
    expect(payload.severity).toBe('warning');
    expect(payload.details.raw_message).toBe('TypeError: Failed to fetch');
    expect(typeof payload.details.caller_stack).toBe('string');
  });

  it('(d) obična hrvatska poruka prolazi nepromijenjena', async () => {
    const { result } = renderHook(() => useStatusFeedback());

    act(() => {
      showError('Greška pri učitavanju budžeta');
    });

    expect(result.current.message).toBe('Greška pri učitavanju budžeta');
    await new Promise((r) => setTimeout(r, 10));
    expect(logDiagnostic).not.toHaveBeenCalled();
  });
});
