import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import CentarNote from '@/components/CentarNote';
import StatusFeedback from '@/components/StatusFeedback';
import {
  showSuccess,
  showError,
  computeDuration,
  useStatusFeedback,
} from '@/hooks/useStatusFeedback';
import { resolveNoteModule, noteModuleHsl } from '@/lib/notifyModule';
import { MODULE_HSL } from '@/lib/moduleColors';

describe('CentarNote — render po severity', () => {
  it('info prikazuje progress crticu', () => {
    render(<CentarNote severity="info" module="wallet" message="Spremljeno" duration={3000} />);
    expect(screen.getByTestId('centar-note-progress')).toBeInTheDocument();
    expect(screen.getByTestId('centar-note')).toHaveAttribute('data-severity', 'info');
  });

  it('sticky (duration=0) nema progress crtice', () => {
    render(<CentarNote severity="error" module="wallet" message="Greška" duration={0} />);
    expect(screen.queryByTestId('centar-note-progress')).toBeNull();
  });

  it('oznaka modula ima veliko prvo slovo i odgovara nazivu u aplikaciji', () => {
    render(<CentarNote severity="info" module="projects" message="ok" duration={3000} />);
    const label = screen.getByTestId('centar-note-module-label');
    expect(label.textContent).toBe('Projekti');
  });

  it('boja dolazi iz MODULE_HSL mape, ne iz literala', () => {
    render(<CentarNote severity="info" module="projects" message="ok" duration={3000} />);
    const root = screen.getByTestId('centar-note');
    expect(root.style.getPropertyValue('--module-accent')).toBe(MODULE_HSL.projects);
  });

  it('uspjeh i greška istog modula imaju istu boju', () => {
    const { unmount } = render(
      <CentarNote severity="info" module="krug" message="ok" duration={3000} />,
    );
    const ok = screen.getByTestId('centar-note').style.getPropertyValue('--module-accent');
    unmount();
    render(<CentarNote severity="error" module="krug" message="ne" duration={6000} />);
    const err = screen.getByTestId('centar-note').style.getPropertyValue('--module-accent');
    expect(err).toBe(ok);
    expect(err).toBe(MODULE_HSL.krug);
  });
});

describe('notifyModule', () => {
  beforeEach(() => {
    delete document.body.dataset.module;
  });

  it("dataset.module='projects' → 'projects'", () => {
    document.body.dataset.module = 'projects';
    expect(resolveNoteModule()).toBe('projects');
  });

  it("prazan dataset → 'centar'", () => {
    expect(resolveNoteModule()).toBe('centar');
  });

  it("'Failed to fetch' → 'centar' i kad je modul aktivan", () => {
    document.body.dataset.module = 'wallet';
    expect(resolveNoteModule({ message: 'Failed to fetch' })).toBe('centar');
  });

  it('eksplicitni modul ima prednost', () => {
    document.body.dataset.module = 'wallet';
    expect(resolveNoteModule({ explicit: 'budgets' })).toBe('budgets');
  });

  it('neutralne rute → centar', () => {
    document.body.dataset.module = 'wallet';
    expect(resolveNoteModule({ pathname: '/settings/profile' })).toBe('centar');
  });

  it('centar ima vlastitu (jantar) boju različitu od modula', () => {
    expect(noteModuleHsl('centar')).not.toBe(MODULE_HSL.overview);
  });
});

describe('computeDuration — regresija', () => {
  it('kratke poruke drže minimum', () => {
    expect(computeDuration('success', 'ok')).toBe(2500);
    expect(computeDuration('error', 'ok')).toBe(3000);
  });

  it('duge poruke ne prelaze maksimum', () => {
    const long = 'x'.repeat(300);
    expect(computeDuration('success', long)).toBe(4500);
    expect(computeDuration('error', long)).toBe(6000);
  });
});

describe('store + StatusFeedback adapter', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('stari potpis showSuccess("x") radi i emitira jedan event', () => {
    const seen: unknown[] = [];
    const Probe = () => {
      const s = useStatusFeedback();
      seen.push(s.visible);
      return null;
    };
    render(<Probe />);
    const before = seen.length;
    act(() => showSuccess('Spremljeno'));
    expect(seen.length - before).toBe(1);
    expect(seen[seen.length - 1]).toBe(true);
  });

  it('info se sam gasi nakon computeDuration (~2.5s)', () => {
    render(<StatusFeedback />);
    act(() => showSuccess('ok'));
    expect(screen.getByTestId('centar-note')).toBeInTheDocument();
    act(() => vi.advanceTimersByTime(2600));
    expect(screen.getByTestId('centar-note')).toHaveAttribute('data-severity', 'info');
  });

  it('greška traje 6s', () => {
    act(() => showError('Nešto je puklo'));
    act(() => vi.advanceTimersByTime(5900));
    const Probe = () => {
      const s = useStatusFeedback();
      return <span data-testid="vis">{String(s.visible)}</span>;
    };
    render(<Probe />);
    expect(screen.getByTestId('vis').textContent).toBe('true');
    act(() => vi.advanceTimersByTime(200));
    expect(screen.getByTestId('vis').textContent).toBe('false');
  });

  it('showError bez opcija dobiva severity error i modul iz konteksta', () => {
    document.body.dataset.module = 'budgets';
    act(() => showError('Neuspjelo spremanje'));
    const Probe = () => {
      const s = useStatusFeedback();
      return <span data-testid="meta">{`${s.severity}|${s.module}`}</span>;
    };
    render(<Probe />);
    expect(screen.getByTestId('meta').textContent).toBe('error|budgets');
    delete document.body.dataset.module;
  });
});
