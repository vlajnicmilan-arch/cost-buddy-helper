import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { AttachmentBar } from '@/components/add-expense/AttachmentBar';

const state = vi.hoisted(() => ({
  granted: false,
  requestModule: vi.fn(),
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (_key: string, fallback: string) => fallback }),
}));

vi.mock('@/hooks/useKrug', () => ({
  useMyKrugs: () => ({ data: [{ id: 'k1', name: 'Test' }], isLoading: false }),
}));

vi.mock('@/hooks/useModuleGate', () => ({
  useModuleGate: () => ({ requestModule: state.requestModule }),
}));

describe('Krug expense selector gate', () => {
  beforeEach(() => {
    state.granted = false;
    state.requestModule.mockReset();
    state.requestModule.mockImplementation((_module, options) => {
      if (state.granted) options?.onGranted?.();
    });
  });

  it('član bez prava klikom na Krug chip dobiva module gate i picker ostaje zatvoren', () => {
    render(<AttachmentBar showKrug onKrugChange={vi.fn()} />);

    fireEvent.click(screen.getByTestId('attachment-chip-krug'));

    expect(state.requestModule).toHaveBeenCalledWith(
      'krug',
      expect.objectContaining({ onGranted: expect.any(Function) }),
    );
    expect(screen.queryByText('Test')).not.toBeInTheDocument();
  });

  it('član s pravom normalno otvara Krug picker', () => {
    state.granted = true;
    render(<AttachmentBar showKrug onKrugChange={vi.fn()} />);

    fireEvent.click(screen.getByTestId('attachment-chip-krug'));

    expect(screen.getByText('Test')).toBeInTheDocument();
  });
});