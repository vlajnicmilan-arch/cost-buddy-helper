import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import type { ReactNode } from 'react';
import { PdfImportProvider, usePdfImport } from '@/contexts/PdfImportContext';
import type { CustomPaymentSource } from '@/types/customPaymentSource';

vi.mock('@/lib/featureFlags', () => ({ IMPORT_FROZEN: true }));
vi.mock('@/lib/diagnosticLogger', () => ({ logDiagnostic: vi.fn() }));
vi.mock('@/hooks/useStatusFeedback', () => ({ showError: vi.fn(), showSuccess: vi.fn() }));
vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (k: string) => k }) }));

const wrapper = ({ children }: { children: ReactNode }) => (
  <PdfImportProvider>{children}</PdfImportProvider>
);

const source = { id: 'src-1' } as unknown as CustomPaymentSource;
const file = new File(['x'], 'x.pdf', { type: 'application/pdf' });

describe('PdfImportContext s IMPORT_FROZEN=true', () => {
  beforeEach(() => vi.clearAllMocks());

  it('startPdfImport VIŠE NE blokira — postavi phase=starting', async () => {
    const { result } = renderHook(() => usePdfImport(), { wrapper });
    await act(async () => { await result.current.startPdfImport({ file, source }); });
    expect(result.current.phase).toBe('starting');
    expect(result.current.source).toBe(source);
  });

  it('startHtmlImport VIŠE NE blokira — postavi phase=starting', async () => {
    const { result } = renderHook(() => usePdfImport(), { wrapper });
    await act(async () => { await result.current.startHtmlImport({ file, source }); });
    expect(result.current.phase).toBe('starting');
  });

  it('_runImport I DALJE blokira upis dok je IMPORT_FROZEN=true', async () => {
    const { result } = renderHook(() => usePdfImport(), { wrapper });
    const onImportCSV = vi.fn();
    act(() => { result.current.registerHandlers({ onImportCSV }); });
    await act(async () => { await result.current._runImport([]); });
    expect(onImportCSV).not.toHaveBeenCalled();
  });
});
