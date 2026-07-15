import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useState } from 'react';
import { BackButtonProvider, BACK_PRIORITY } from '@/contexts/BackButtonContext';
import { useBackButton } from '@/hooks/useBackButton';
import { useBackNavigationTab } from '@/hooks/useBackNavigationTab';

const { logDiagnosticMock } = vi.hoisted(() => ({
  logDiagnosticMock: vi.fn(),
}));

vi.mock('@/lib/diagnosticLogger', () => ({
  logDiagnostic: logDiagnosticMock,
}));

vi.mock('@/lib/nativeFlowGuard', () => ({
  isNativeFlowActive: () => false,
}));

function BackHarness() {
  const [fullscreenOpen, setFullscreenOpen] = useState(false);
  const [activeTab, setActiveTab] = useState('overview');
  const [detailOpen, setDetailOpen] = useState(false);

  useBackButton(
    fullscreenOpen,
    () => setFullscreenOpen(false),
    BACK_PRIORITY.FULLSCREEN,
    'FULLSCREEN:test',
  );
  useBackNavigationTab(
    activeTab,
    'overview',
    setActiveTab,
    fullscreenOpen,
    'TAB:test',
  );
  useBackButton(
    detailOpen,
    () => setDetailOpen(false),
    BACK_PRIORITY.DETAIL,
    'DETAIL:test',
  );

  return (
    <div>
      <button type="button" onClick={() => setFullscreenOpen(true)}>open fullscreen</button>
      <button type="button" onClick={() => setActiveTab('decisions')}>open decisions tab</button>
      <button type="button" onClick={() => setDetailOpen(true)}>open detail</button>
      <span data-testid="state">
        {fullscreenOpen ? 'fullscreen' : 'closed'}:{activeTab}:{detailOpen ? 'detail' : 'list'}
      </span>
    </div>
  );
}

describe('BackButtonContext layered registration', () => {
  beforeEach(() => {
    logDiagnosticMock.mockClear();
    window.history.pushState({}, '', '/projects');
  });

  it('registrira ROOT + FULLSCREEN + TAB + DETAIL prije konzumacije backa', async () => {
    render(
      <BrowserRouter>
        <BackButtonProvider>
          <BackHarness />
        </BackButtonProvider>
      </BrowserRouter>,
    );

    fireEvent.click(screen.getByRole('button', { name: 'open fullscreen' }));
    fireEvent.click(screen.getByRole('button', { name: 'open decisions tab' }));
    fireEvent.click(screen.getByRole('button', { name: 'open detail' }));

    await waitFor(() => {
      const registeredLabels = logDiagnosticMock.mock.calls
        .map(([arg]) => (typeof arg === 'object' ? arg.details?.label : undefined))
        .filter(Boolean);

      expect(registeredLabels).toEqual(expect.arrayContaining([
        'ROOT',
        'FULLSCREEN:test',
        'TAB:test',
        'DETAIL:test',
      ]));
    });

    window.dispatchEvent(new PopStateEvent('popstate'));

    await waitFor(() => {
      const popstateCall = logDiagnosticMock.mock.calls.find(([arg]) => (
        typeof arg === 'object' && arg.event === 'backctx_popstate'
      ));
      expect(popstateCall).toBeTruthy();
      const layers = (popstateCall?.[0] as any).details.layers;
      expect(layers).toEqual(expect.arrayContaining([
        expect.objectContaining({ label: 'ROOT', priority: BACK_PRIORITY.ROOT }),
        expect.objectContaining({ label: 'FULLSCREEN:test', priority: BACK_PRIORITY.FULLSCREEN }),
        expect.objectContaining({ label: 'TAB:test', priority: BACK_PRIORITY.TAB }),
        expect.objectContaining({ label: 'DETAIL:test', priority: BACK_PRIORITY.DETAIL }),
      ]));
      expect((popstateCall?.[0] as any).details.stackDepthBefore).toBe(4);
      expect((popstateCall?.[0] as any).details.topHandlerLabel).toBe('DETAIL:test');
    });

    await waitFor(() => {
      expect(screen.getByTestId('state')).toHaveTextContent('fullscreen:decisions:list');
    });
  });
});