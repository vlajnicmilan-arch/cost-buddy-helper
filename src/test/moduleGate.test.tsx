/**
 * useModuleGate — bez prava zahtjev za modul otvara dijalog, a "Ne sada"
 * (dismiss) poziva onDismiss bez errora. S pravom → poziva onGranted i
 * ne otvara dijalog.
 */
import { describe, it, expect, vi } from 'vitest';
import { render, act } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { ModuleGateProvider, useModuleGate } from '@/hooks/useModuleGate';

vi.mock('@/hooks/useFeatureAccess', () => ({
  useFeatureAccess: () => ({ hasAccess: (f: string) => f === 'projects' }),
}));

// Dijalog nam ne treba renderirati — samo verificiramo ugovor open/dismiss.
vi.mock('@/components/modules/ModuleUpgradeDialog', () => ({
  ModuleUpgradeDialog: ({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) => {
    (globalThis as any).__gateOpen = open;
    (globalThis as any).__gateClose = () => onOpenChange(false);
    return null;
  },
}));

function Harness({ onReady }: { onReady: (g: ReturnType<typeof useModuleGate>) => void }) {
  const gate = useModuleGate();
  onReady(gate);
  return null;
}

describe('useModuleGate', () => {
  it('bez prava → otvara dijalog, dismiss zove onDismiss (bez errora)', async () => {
    let gate!: ReturnType<typeof useModuleGate>;
    render(
      <MemoryRouter>
        <ModuleGateProvider>
          <Harness onReady={(g) => { gate = g; }} />
        </ModuleGateProvider>
      </MemoryRouter>,
    );
    const dismissed = vi.fn();
    act(() => gate.requestModule('krug', { onDismiss: dismissed }));
    expect((globalThis as any).__gateOpen).toBe(true);
    await act(async () => { (globalThis as any).__gateClose(); });
    await Promise.resolve();
    expect(dismissed).toHaveBeenCalledTimes(1);
    expect((globalThis as any).__gateOpen).toBe(false);
  });

  it('s pravom → poziva onGranted odmah, ne otvara dijalog', () => {
    (globalThis as any).__gateOpen = false;
    let gate!: ReturnType<typeof useModuleGate>;
    render(
      <MemoryRouter>
        <ModuleGateProvider>
          <Harness onReady={(g) => { gate = g; }} />
        </ModuleGateProvider>
      </MemoryRouter>,
    );
    const granted = vi.fn();
    act(() => gate.requestModule('projects', { onGranted: granted }));
    expect(granted).toHaveBeenCalledTimes(1);
    expect((globalThis as any).__gateOpen).toBe(false);
  });
});
