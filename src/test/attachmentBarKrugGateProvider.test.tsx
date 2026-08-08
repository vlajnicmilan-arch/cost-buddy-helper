/**
 * Regresija za kvar 8.8.2026: Krug chip u dijalogu troška nije reagirao na
 * klik jer je AddExpenseDialog (preko GlobalReceiptScanHost) bio montiran
 * IZVAN ModuleGateProvider-a → useModuleGate je vraćao no-op fallback i
 * `onGranted` (koji otvara picker) nikad se nije pozvao.
 *
 * Ovdje koristimo PRAVI ModuleGateProvider (bez mockanja gatea) i tvrdimo:
 *  - unutar providera + s pravom → picker se otvori
 *  - bez providera → picker se NE otvori (dokaz padanja / staro stablo)
 */
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { AttachmentBar } from '@/components/add-expense/AttachmentBar';
import { ModuleGateProvider } from '@/hooks/useModuleGate';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (_key: string, fallback: string) => fallback }),
}));

vi.mock('@/hooks/useKrug', () => ({
  useMyKrugs: () => ({ data: [{ id: 'k1', name: 'Test' }], isLoading: false }),
}));

vi.mock('@/hooks/useFeatureAccess', () => ({
  useFeatureAccess: () => ({ hasModuleAccess: () => true }),
}));

vi.mock('@/components/modules/ModuleUpgradeDialog', () => ({
  ModuleUpgradeDialog: () => null,
}));

describe('AttachmentBar — Krug chip unutar ModuleGateProvider-a', () => {
  it('klik na Krug chip s pravom otvara picker', async () => {
    render(
      <MemoryRouter>
        <ModuleGateProvider>
          <AttachmentBar showKrug onKrugChange={vi.fn()} />
        </ModuleGateProvider>
      </MemoryRouter>,
    );

    fireEvent.click(screen.getByTestId('attachment-chip-krug'));

    expect(await screen.findByText('Test')).toBeInTheDocument();
  });

  it('dokaz padanja — bez providera picker ostaje zatvoren (staro stablo)', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    render(
      <MemoryRouter>
        <AttachmentBar showKrug onKrugChange={vi.fn()} />
      </MemoryRouter>,
    );

    fireEvent.click(screen.getByTestId('attachment-chip-krug'));

    expect(screen.queryByText('Test')).not.toBeInTheDocument();
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('ModuleGateProvider'));
    warn.mockRestore();
  });
});
