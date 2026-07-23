import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { KrugListScreen } from '@/components/krug/KrugListScreen';

const state = vi.hoisted(() => ({
  hasKrugAccess: false,
  krugs: [] as Array<{ id: string; name: string; preset: string; lifecycle_state: string }>,
  requestModule: vi.fn(),
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (_key: string, fallback: string) => fallback }),
}));

vi.mock('@/hooks/useFeatureAccess', () => ({
  useFeatureAccess: () => ({ hasModuleAccess: () => state.hasKrugAccess }),
}));

vi.mock('@/hooks/useModuleGate', () => ({
  useModuleGate: () => ({ requestModule: state.requestModule }),
}));

vi.mock('@/hooks/useKrug', () => ({
  useMyKrugs: () => ({ data: state.krugs, isLoading: false, isError: false, refetch: vi.fn() }),
}));

vi.mock('@/components/krug/CreateKrugDialog', () => ({
  CreateKrugDialog: ({ open }: { open: boolean }) => open ? <div data-testid="create-krug-dialog" /> : null,
}));

vi.mock('@/components/krug/KrugLifecycleBadge', () => ({ KrugLifecycleBadge: () => null }));
vi.mock('@/components/krug/KrugBrandIcon', () => ({ KrugBrandIcon: () => null }));

describe('Krug write gate', () => {
  beforeEach(() => {
    state.hasKrugAccess = false;
    state.krugs = [];
    state.requestModule.mockReset();
    state.requestModule.mockImplementation((_module, options) => {
      if (state.hasKrugAccess) options?.onGranted?.();
    });
  });

  it('član bez Krug prava klikom na Novi Krug dobiva module gate, ne create dialog', () => {
    state.krugs = [{ id: 'k1', name: 'Test', preset: 'partner', lifecycle_state: 'active' }];
    render(<KrugListScreen onSelect={vi.fn()} />);

    fireEvent.click(screen.getByRole('button', { name: 'Otključaj Krug' }));

    expect(state.requestModule).toHaveBeenCalledWith('krug', expect.objectContaining({ onGranted: expect.any(Function) }));
    expect(screen.queryByTestId('create-krug-dialog')).not.toBeInTheDocument();
  });

  it('član s Krug pravom normalno otvara stvaranje', () => {
    state.hasKrugAccess = true;
    state.krugs = [{ id: 'k1', name: 'Test', preset: 'partner', lifecycle_state: 'active' }];
    render(<KrugListScreen onSelect={vi.fn()} />);

    fireEvent.click(screen.getByRole('button', { name: 'Novi Krug' }));

    expect(screen.getByTestId('create-krug-dialog')).toBeInTheDocument();
  });

  it('korisnik bez članstva i prava iz empty statea dobiva isti module gate', () => {
    render(<KrugListScreen onSelect={vi.fn()} />);

    fireEvent.click(screen.getByRole('button', { name: 'Otključaj Krug' }));

    expect(state.requestModule).toHaveBeenCalledWith('krug', expect.objectContaining({ onGranted: expect.any(Function) }));
    expect(screen.queryByTestId('create-krug-dialog')).not.toBeInTheDocument();
  });
});