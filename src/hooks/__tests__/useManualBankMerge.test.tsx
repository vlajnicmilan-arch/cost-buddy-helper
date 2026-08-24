import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';

const rpcMock = vi.fn();
const logDiagnosticMock = vi.fn();
const showErrorMock = vi.fn();
const showSuccessMock = vi.fn();

vi.mock('@/integrations/supabase/client', () => ({
  supabase: { rpc: (...args: unknown[]) => rpcMock(...args) },
}));
vi.mock('@/lib/diagnosticLogger', () => ({
  logDiagnostic: (...args: unknown[]) => logDiagnosticMock(...args),
}));
vi.mock('@/hooks/useStatusFeedback', () => ({
  showError: (...args: unknown[]) => showErrorMock(...args),
  showSuccess: (...args: unknown[]) => showSuccessMock(...args),
}));
vi.mock('@/lib/funnelTracking', () => ({ logFunnelEvent: () => Promise.resolve() }));
vi.mock('@/lib/featureFlags', () => ({ MANUAL_MERGE_ENABLED: true }));
vi.mock('@/lib/version', () => ({ APP_VERSION: '9.9.9-test' }));
vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string, arg?: any) => (typeof arg === 'string' ? arg : key) }),
}));
vi.mock('@tanstack/react-query', () => ({
  useQueryClient: () => ({ invalidateQueries: () => Promise.resolve() }),
}));

import { useManualBankMerge } from '@/hooks/useManualBankMerge';

const MANUAL = '441ccf61-9658-452a-87d9-fefb0d351871';
const BANK = '659de06a-f83d-47ed-8acd-b1fb2b5860d5';

const lastLog = () => logDiagnosticMock.mock.calls.at(-1)?.[0];

describe('useManualBankMerge diagnostics', () => {
  beforeEach(() => {
    rpcMock.mockReset();
    logDiagnosticMock.mockReset();
    showErrorMock.mockReset();
    showSuccessMock.mockReset();
  });

  it('logs manual_bank_merge_ok on success', async () => {
    rpcMock.mockResolvedValue({ error: null });
    const { result } = renderHook(() => useManualBankMerge());
    let ok = false;
    await act(async () => {
      ok = await result.current.mergePair(MANUAL, BANK, { context: 'duplicate_dialog' });
    });
    expect(ok).toBe(true);
    const log = lastLog();
    expect(log.event).toBe('manual_bank_merge_ok');
    expect(log.details).toMatchObject({
      rpc_called: true,
      manual_id: MANUAL,
      bank_id: BANK,
      app_version: '9.9.9-test',
    });
  });

  it('logs manual_bank_merge_failed with the database reason', async () => {
    rpcMock.mockResolvedValue({ error: { message: 'bank_deleted', code: 'P0001' } });
    const { result } = renderHook(() => useManualBankMerge());
    let ok = true;
    await act(async () => {
      ok = await result.current.mergePair(MANUAL, BANK, { rowAlreadySaved: true });
    });
    expect(ok).toBe(false);
    const log = lastLog();
    expect(log.event).toBe('manual_bank_merge_failed');
    expect(log.severity).toBe('error');
    expect(log.details).toMatchObject({
      rpc_called: true,
      reason: 'bank_deleted',
      db_code: 'P0001',
      db_message: 'bank_deleted',
      row_already_saved: true,
    });
    expect(showErrorMock).toHaveBeenCalledWith('transactions.merge.savedButFailed');
  });

  it('logs rpc_called:false when an id is missing', async () => {
    const { result } = renderHook(() => useManualBankMerge());
    let ok = true;
    await act(async () => {
      ok = await result.current.mergePair(undefined, BANK, { rowAlreadySaved: true });
    });
    expect(ok).toBe(false);
    expect(rpcMock).not.toHaveBeenCalled();
    const log = lastLog();
    expect(log.event).toBe('manual_bank_merge_failed');
    expect(log.details).toMatchObject({
      rpc_called: false,
      reason: 'missing_id',
      manual_id_missing: true,
      bank_id_missing: false,
    });
  });
});
