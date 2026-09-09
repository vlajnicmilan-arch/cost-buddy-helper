/**
 * Grupa D: nijedan ulaz u zaključan modul ne smije odlučivati prije nego
 * se prava znaju (`subscriptionReady`). Prije spremnosti: bez paywalla,
 * uz opcionalni `onUnready` fallback. Nakon spremnosti: stari tok.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, act } from '@testing-library/react';

const state = vi.hoisted(() => ({ ready: false, hasAccess: false }));

vi.mock('@/hooks/useFeatureAccess', () => ({
  useFeatureAccess: () => ({ hasModuleAccess: () => state.hasAccess }),
}));
vi.mock('@/contexts/SubscriptionContext', () => ({
  useSubscription: () => ({ subscriptionReady: state.ready }),
}));
vi.mock('@/components/modules/ModuleUpgradeDialog', () => ({
  ModuleUpgradeDialog: ({ open, module }: { open: boolean; module: string }) =>
    open ? <div data-testid="upgrade-dialog">{module}</div> : null,
}));

import { ModuleGateProvider, useModuleGate } from '@/hooks/useModuleGate';

const granted = vi.fn();
const unready = vi.fn();

function Trigger() {
  const { requestModule } = useModuleGate();
  return (
    <button
      onClick={() => requestModule('projects', { onGranted: granted, onUnready: unready })}
    >
      go
    </button>
  );
}

const renderGate = () =>
  render(
    <ModuleGateProvider>
      <Trigger />
    </ModuleGateProvider>,
  );

describe('useModuleGate — čeka subscriptionReady', () => {
  beforeEach(() => {
    granted.mockReset();
    unready.mockReset();
    state.ready = false;
    state.hasAccess = false;
  });

  it('prije spremnosti: bez paywalla, poziva onUnready', () => {
    renderGate();
    act(() => screen.getByText('go').click());
    expect(screen.queryByTestId('upgrade-dialog')).toBeNull();
    expect(granted).not.toHaveBeenCalled();
    expect(unready).toHaveBeenCalledTimes(1);
  });

  it('spremno + bez prava: otvara ModuleUpgradeDialog', () => {
    state.ready = true;
    renderGate();
    act(() => screen.getByText('go').click());
    expect(screen.getByTestId('upgrade-dialog').textContent).toBe('projects');
    expect(unready).not.toHaveBeenCalled();
  });

  it('s pravom: onGranted, bez dijaloga (neovisno o spremnosti)', () => {
    state.hasAccess = true;
    renderGate();
    act(() => screen.getByText('go').click());
    expect(granted).toHaveBeenCalledTimes(1);
    expect(screen.queryByTestId('upgrade-dialog')).toBeNull();
    expect(unready).not.toHaveBeenCalled();
  });
});
