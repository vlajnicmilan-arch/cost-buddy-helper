/**
 * BRIEF-VRATA — vizualni predah: koreografija bez pomicanja, tipografske akcije.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, act, waitFor } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import BriefGate from '@/pages/BriefGate';
import type { BriefSnapshot } from '@/lib/brief/types';
import { BRIEF_GATE_LAST_SHOWN_KEY } from '@/lib/briefGate';
import { describeDueWhen } from '@/lib/brief/dueWhen';
import {
  BRIEF_FADE_MS,
  BRIEF_PAUSE_MAX_MS,
  BRIEF_PAUSE_MIN_MS,
  pauseAfter,
  planChoreography,
} from '@/lib/brief/choreography';

const rpcMock = vi.fn();

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    rpc: (...args: unknown[]) => rpcMock(...args),
    auth: {
      getUser: () => Promise.resolve({ data: { user: null }, error: null }),
      onAuthStateChange: () => ({ data: { subscription: { unsubscribe: () => undefined } } }),
    },
  },
}));

vi.mock('@/contexts/AppStateContext', () => ({
  useAppState: () => ({ displayName: 'Milan' }),
}));

vi.mock('@/lib/instantCache', () => ({
  instantCache: { read: () => null, write: () => undefined },
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, opts?: unknown) => (typeof opts === 'string' ? opts : key),
  }),
}));

const snapshot = (categories: BriefSnapshot['categories']): BriefSnapshot => ({
  enabled: true,
  categories,
});

const twoTruths = snapshot({
  uncertainty: { count: 2, watermark: null, filter: { path: '/dokumenti', tab: 'pending' } },
  due: { count: 3, watermark: null, filter: { path: '/home', view: 'overdue' } },
});

const renderGate = () =>
  render(
    <MemoryRouter initialEntries={['/brief']}>
      <Routes>
        <Route path="/brief" element={<BriefGate />} />
        <Route path="/home" element={<div>HOME</div>} />
        <Route path="/dokumenti" element={<div>DOKUMENTI</div>} />
      </Routes>
    </MemoryRouter>,
  );

const setReducedMotion = (matches: boolean) => {
  window.matchMedia = ((query: string) => ({
    matches,
    media: query,
    onchange: null,
    addListener: () => undefined,
    removeListener: () => undefined,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
    dispatchEvent: () => false,
  })) as unknown as typeof window.matchMedia;
};

beforeEach(() => {
  localStorage.clear();
  rpcMock.mockReset();
  setReducedMotion(false);
});

afterEach(() => {
  vi.useRealTimers();
});

describe('koreografija vrata', () => {
  it('konacne pozicije su iste prije i poslije koreografije (samo prozirnost)', async () => {
    rpcMock.mockResolvedValue({ data: twoTruths, error: null });
    renderGate();
    const first = await screen.findByTestId('brief-gate-message');
    const before = screen.getByTestId('brief-gate-actions').className;
    expect(first.getAttribute('data-visible')).toBe('false');

    fireEvent.pointerDown(screen.getByTestId('brief-gate'));

    expect(screen.getByTestId('brief-gate-message').getAttribute('data-visible')).toBe('true');
    const after = screen.getByTestId('brief-gate-actions').className;
    // Razlikuje se iskljucivo klasa prozirnosti; sve ostalo (razmaci, poravnanje) je isto.
    const strip = (c: string) => c.replace(/opacity-\d+/g, '').trim();
    expect(strip(after)).toBe(strip(before));
  });

  it('dodir tijekom koreografije sve otkriva i ne aktivira akciju', async () => {
    rpcMock.mockResolvedValue({ data: twoTruths, error: null });
    renderGate();
    await screen.findByTestId('brief-gate-message');
    fireEvent.pointerDown(screen.getByTestId('brief-gate-action'));
    expect(screen.getByTestId('brief-gate').getAttribute('data-complete')).toBe('true');
    expect(screen.queryByText('DOKUMENTI')).toBeNull();
  });

  it('prefers-reduced-motion => odmah konacno stanje', async () => {
    setReducedMotion(true);
    rpcMock.mockResolvedValue({ data: twoTruths, error: null });
    renderGate();
    await screen.findByTestId('brief-gate-message');
    // `complete` postavlja pasivni ucinak; findBy moze rijesiti prije njegova ispiranja.
    await waitFor(() =>
      expect(screen.getByTestId('brief-gate').getAttribute('data-complete')).toBe('true'),
    );
  });

  it('ponovni prikaz istog dana (>= 4 h) => bez koreografije', async () => {
    localStorage.setItem(BRIEF_GATE_LAST_SHOWN_KEY, new Date().toISOString());
    rpcMock.mockResolvedValue({ data: twoTruths, error: null });
    renderGate();
    await screen.findByTestId('brief-gate-message');
    await waitFor(() =>
      expect(screen.getByTestId('brief-gate').getAttribute('data-complete')).toBe('true'),
    );
  });

  it('tiho stanje: pozdrav i rečenica u istom koraku', () => {
    const plan = planChoreography({
      firstDaily: true,
      reducedMotion: false,
      calm: true,
      greetingText: 'Dobro jutro, Milan.',
      lineTexts: ['Nema ničega za odluku.'],
    });
    expect(plan.greetingDelay).toBe(0);
    expect(plan.lineDelays).toEqual([0]);
    expect(plan.actionsDelay).toBe(BRIEF_FADE_MS + pauseAfter('Dobro jutro, Milan. Nema ničega za odluku.'));
  });

  it('pauza se mjeri od KRAJA fade-ina', () => {
    const greeting = 'Dobro jutro, Milan.';
    const lines = ['Dva dokumenta čekaju.', 'Najbliži račun dospijeva u ponedjeljak.'];
    const plan = planChoreography({
      firstDaily: true,
      reducedMotion: false,
      calm: false,
      greetingText: greeting,
      lineTexts: lines,
    });
    const t1 = BRIEF_FADE_MS + pauseAfter(greeting);
    const t2 = t1 + BRIEF_FADE_MS + pauseAfter(lines[0]);
    expect(plan.lineDelays).toEqual([t1, t2]);
    expect(plan.actionsDelay).toBe(t2 + BRIEF_FADE_MS + pauseAfter(lines[1]));
  });

  it('duga recenica dobiva dulju pauzu od kratke, obje unutar granica', () => {
    const kratka = pauseAfter('Dobro jutro.');
    const duga = pauseAfter('Najbliži račun dospijeva u ponedjeljak i traži tvoju odluku danas.');
    expect(duga).toBeGreaterThan(kratka);
    for (const p of [kratka, duga]) {
      expect(p).toBeGreaterThanOrEqual(BRIEF_PAUSE_MIN_MS);
      expect(p).toBeLessThanOrEqual(BRIEF_PAUSE_MAX_MS);
    }
  });

  it('gornja granica stvarno reze', () => {
    expect(pauseAfter(Array.from({ length: 80 }, () => 'riječ').join(' '))).toBe(BRIEF_PAUSE_MAX_MS);
  });

  it('fade je 550 ms za sve elemente', () => {
    expect(BRIEF_FADE_MS).toBe(550);
    const plan = planChoreography({
      firstDaily: true,
      reducedMotion: false,
      calm: false,
      greetingText: 'Dobro jutro.',
      lineTexts: ['Jedna rečenica.'],
    });
    expect(plan.fadeMs).toBe(550);
  });

  it('ponovni ulazak i reduced-motion => bez koreografije', () => {
    const input = { greetingText: 'Dobro jutro.', lineTexts: ['A.', 'B.'] };
    for (const plan of [
      planChoreography({ firstDaily: false, reducedMotion: false, calm: false, ...input }),
      planChoreography({ firstDaily: true, reducedMotion: true, calm: false, ...input }),
    ]) {
      expect(plan.animated).toBe(false);
      expect(plan.lineDelays).toEqual([0, 0]);
      expect(plan.actionsDelay).toBe(0);
    }
  });
});

describe('akcije vrata', () => {
  it('bez dokazive destinacije nema "Pogledaj", ulaz postoji uvijek', async () => {
    rpcMock.mockResolvedValue({
      data: snapshot({ uncertainty: { count: 0, watermark: null, filter: { path: '/dokumenti', tab: 'pending' } } }),
      error: null,
    });
    renderGate();
    await screen.findByTestId('brief-gate-message');
    expect(screen.queryByTestId('brief-gate-action')).toBeNull();
    expect(screen.getByTestId('brief-gate-enter')).toBeTruthy();
  });

  it('s destinacijom akcija vodi na odrediste (nakon dovrsenog prikaza)', async () => {
    setReducedMotion(true);
    rpcMock.mockResolvedValue({
      data: snapshot({
        uncertainty: { count: 1, watermark: null, filter: { path: '/dokumenti', tab: 'pending' } },
      }),
      error: null,
    });
    renderGate();
    fireEvent.click(await screen.findByTestId('brief-gate-action'));
    await screen.findByText('DOKUMENTI');
  });
});

describe('izraz roka', () => {
  const now = new Date(2026, 7, 15, 10, 0, 0); // subota

  it('danas', () => {
    expect(describeDueWhen('2026-08-15', now)?.kind).toBe('today');
  });
  it('sutra', () => {
    expect(describeDueWhen('2026-08-16', now)?.kind).toBe('tomorrow');
  });
  it('unutar tjedna => dan u tjednu', () => {
    const w = describeDueWhen('2026-08-17', now);
    expect(w?.kind).toBe('weekday');
    expect(w?.weekday).toBe(1);
    expect(describeDueWhen('2026-08-21', now)?.kind).toBe('weekday');
  });
  it('sedmi dan i dalje => datum', () => {
    expect(describeDueWhen('2026-08-22', now)?.kind).toBe('date');
    expect(describeDueWhen('2026-09-30', now)?.kind).toBe('date');
  });
  it('proslost => datum', () => {
    expect(describeDueWhen('2026-08-10', now)?.kind).toBe('date');
  });
  it('nevaljan ulaz => null', () => {
    expect(describeDueWhen(null, now)).toBeNull();
    expect(describeDueWhen('bez-datuma', now)).toBeNull();
  });
});
