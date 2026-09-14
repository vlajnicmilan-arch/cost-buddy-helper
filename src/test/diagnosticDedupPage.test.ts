/**
 * Dedup dijagnostike ne smije gutati stranice: expense_fetch_page 1/2/3
 * unutar 60 s moraju ostati tri zasebna retka.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const inserted: any[][] = [];

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    auth: {
      getUser: () => Promise.resolve({ data: { user: null } }),
      onAuthStateChange: () => ({ data: { subscription: { unsubscribe: () => {} } } }),
    },
    from: () => ({
      insert: (batch: any[]) => {
        inserted.push(batch);
        return Promise.resolve({ error: null });
      },
    }),
  },
}));

vi.mock('@/lib/sentry', () => ({
  captureSentryException: () => {},
  setSentryUser: () => {},
}));

describe('buildSignature uključuje details.page', () => {
  beforeEach(() => {
    inserted.length = 0;
  });

  it('tri stranice = tri retka, ista stranica se sažima', async () => {
    const { logDiagnostic } = await import('@/lib/diagnosticLogger');

    logDiagnostic({ event: 'expense_fetch_page', details: { page: 1, rows: 1000, ms: 900 } });
    logDiagnostic({ event: 'expense_fetch_page', details: { page: 2, rows: 1000, ms: 800 } });
    logDiagnostic({ event: 'expense_fetch_page', details: { page: 3, rows: 168, ms: 300 } });
    logDiagnostic({ event: 'expense_fetch_page', details: { page: 3, rows: 168, ms: 310 } });
    // Peti zapis okida flush (buffer >= 5) — koristimo neutralan događaj.
    logDiagnostic({ event: 'expense_fetch_page', details: { page: 4, rows: 0, ms: 10 } });
    logDiagnostic({ event: 'expense_fetch_page', details: { page: 5, rows: 0, ms: 10 } });

    await vi.waitFor(() => expect(inserted.length).toBeGreaterThan(0));

    const rows = inserted.flat().filter((r) => r.event === 'expense_fetch_page');
    expect(rows.map((r) => r.details.page)).toEqual([1, 2, 3, 4, 5]);
    expect(rows.find((r) => r.details.page === 3)?.details.count).toBe(2);
  });
});
