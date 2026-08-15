/**
 * Brief-vrata — ponašanje ekrana: tišina, timeout/pad RPC-a, "Uđi", ErrorBoundary.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';

const mockGate = vi.fn();
vi.mock('@/hooks/useBriefGate', () => ({ useBriefGate: () => mockGate() }));
vi.mock('@/contexts/AppStateContext', () => ({ useAppState: () => ({ displayName: 'Milan' }) }));
vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (k: string, o?: Record<string, unknown>) => (o?.count !== undefined ? `${k}:${o.count}` : k) }),
}));

import BriefGate from '@/pages/BriefGate';
import { BriefGateBoundary } from '@/components/BriefGateBoundary';

const renderGate = (node: React.ReactNode = <BriefGate />) =>
  render(
    <MemoryRouter initialEntries={['/brief']}>
      <Routes>
        <Route path="/brief" element={node} />
        <Route path="/home" element={<div>HOME</div>} />
      </Routes>
    </MemoryRouter>,
  );

beforeEach(() => {
  mockGate.mockReset();
  localStorage.clear();
});

describe('BriefGate screen', () => {
  it('tišina (sve nule) => ravno u /home', () => {
    mockGate.mockReturnValue({
      snapshot: { enabled: true, invoices: { count: 0, nextDue: null }, documents: { count: 0 }, attention: { count: 0 } },
      hasImportDraft: false,
      giveUp: false,
    });
    renderGate();
    expect(screen.getByText('HOME')).toBeInTheDocument();
  });

  it('RPC pad/timeout bez snimke => ravno u /home', () => {
    mockGate.mockReturnValue({ snapshot: null, hasImportDraft: false, giveUp: true });
    renderGate();
    expect(screen.getByText('HOME')).toBeInTheDocument();
  });

  it('bez snimke i bez timeouta => nema loading ceremonije ni vrata', () => {
    mockGate.mockReturnValue({ snapshot: null, hasImportDraft: false, giveUp: false });
    const { container } = renderGate();
    expect(container.textContent).toBe('');
  });

  it('istina postoji => vrata, "Uđi" vodi u /home', () => {
    mockGate.mockReturnValue({
      snapshot: { enabled: true, documents: { count: 2 } },
      hasImportDraft: false,
      giveUp: false,
    });
    renderGate();
    fireEvent.click(screen.getByTestId('brief-gate-enter'));
    expect(screen.getByText('HOME')).toBeInTheDocument();
  });

  it('po prikazu zapisuje žig učestalosti', () => {
    mockGate.mockReturnValue({ snapshot: { enabled: true, attention: { count: 1 } }, hasImportDraft: false, giveUp: false });
    renderGate();
    expect(localStorage.getItem('vmb-brief-gate:last-shown:v1')).toBeTruthy();
  });

  it('korisnik nije na popisu (enabled=false) => ravno u /home', () => {
    mockGate.mockReturnValue({ snapshot: { enabled: false }, hasImportDraft: false, giveUp: false });
    renderGate();
    expect(screen.getByText('HOME')).toBeInTheDocument();
  });

  it('ErrorBoundary: kvar ekrana => /home', () => {
    const Boom = () => { throw new Error('boom'); };
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    renderGate(<BriefGateBoundary><Boom /></BriefGateBoundary>);
    expect(screen.getByText('HOME')).toBeInTheDocument();
    spy.mockRestore();
  });
});
