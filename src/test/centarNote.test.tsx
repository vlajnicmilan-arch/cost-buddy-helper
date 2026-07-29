import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import CentarNote from '@/components/CentarNote';
import StatusFeedback from '@/components/StatusFeedback';
import {
  showSuccess,
  showError,
  showWarning,
  computeDuration,
  useStatusFeedback,
  dismissFeedback,
  __resetFeedbackDedup,
} from '@/hooks/useStatusFeedback';
import i18n from '@/i18n';
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

  it('greška je sticky — ostaje vidljiva i nakon 10s', () => {
    act(() => showError('Nešto je puklo'));
    act(() => vi.advanceTimersByTime(10000));
    const Probe = () => {
      const s = useStatusFeedback();
      return <span data-testid="vis">{String(s.visible)}</span>;
    };
    render(<Probe />);
    expect(screen.getByTestId('vis').textContent).toBe('true');
    act(() => dismissFeedback());
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

describe('Faza 2 — sticky, warning, dedup', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    delete document.body.dataset.module;
    __resetFeedbackDedup();
    dismissFeedback();
  });
  afterEach(() => vi.useRealTimers());

  const Probe = () => {
    const s = useStatusFeedback();
    return <span data-testid="vis">{`${s.visible}|${s.severity}|${s.duration}`}</span>;
  };

  it('projects greška je sticky i ostaje vidljiva nakon 10s', () => {
    render(<Probe />);
    act(() => showError('Projekt nije spremljen', { module: 'projects' }));
    act(() => vi.advanceTimersByTime(10000));
    expect(screen.getByTestId('vis').textContent).toBe('true|error|0');
    act(() => dismissFeedback());
    expect(screen.getByTestId('vis').textContent?.startsWith('false')).toBe(true);
  });

  it('svi moduli su sticky — wallet greška ostaje nakon 10s', () => {
    render(<Probe />);
    act(() => showError('Novčanik greška', { module: 'wallet' }));
    expect(screen.getByTestId('vis').textContent).toBe('true|error|0');
    act(() => vi.advanceTimersByTime(10000));
    expect(screen.getByTestId('vis').textContent).toBe('true|error|0');
    act(() => dismissFeedback());
    expect(screen.getByTestId('vis').textContent?.startsWith('false')).toBe(true);
  });

  it.each(['projects', 'wallet', 'budgets', 'krug', 'overview', 'centar'] as const)(
    'modul %s: greška je sticky (duration 0)',
    (module) => {
      render(<Probe />);
      act(() => showError(`Greška ${module}`, { module }));
      expect(screen.getByTestId('vis').textContent).toBe('true|error|0');
      act(() => dismissFeedback());
    },
  );

  it('dedup: 2× ista greška unutar 2s emitira jedan prikaz', () => {
    const seen: boolean[] = [];
    const Counter = () => {
      const s = useStatusFeedback();
      seen.push(s.visible);
      return null;
    };
    render(<Counter />);
    const before = seen.length;
    act(() => showError('Ista poruka', { module: 'wallet' }));
    act(() => showError('Ista poruka', { module: 'wallet' }));
    expect(seen.length - before).toBe(1);
  });

  it('showWarning: severity warning, 5s, ima progress crticu', () => {
    render(<Probe />);
    act(() => showWarning('Pazi', { module: 'wallet' }));
    expect(screen.getByTestId('vis').textContent).toBe('true|warning|5000');
    act(() => vi.advanceTimersByTime(5100));
    expect(screen.getByTestId('vis').textContent?.startsWith('false')).toBe(true);
    render(<CentarNote severity="warning" module="wallet" message="Pazi" duration={5000} />);
    expect(screen.getByTestId('centar-note-progress')).toBeInTheDocument();
  });

  it('sticky kartica ima default gumb "U redu" koji gasi obavijest', () => {
    const onDismiss = vi.fn();
    render(
      <CentarNote
        severity="error"
        module="projects"
        message="Greška"
        duration={0}
        onDismiss={onDismiss}
      />,
    );
    const btn = screen.getByTestId('centar-note-action');
    expect(btn.textContent).toBe(i18n.t('common.ok'));
    act(() => {
      btn.click();
    });
    expect(onDismiss).toHaveBeenCalled();
  });
});
