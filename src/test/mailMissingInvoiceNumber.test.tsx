/**
 * RAČUN BEZ BROJA NIJE SLIJEPA ULICA.
 *
 * Živi kvar (5.9.2026.): stavka s urednim OIB-om, ali bez broja dokumenta,
 * dobila je poruku koja imenuje i OIB. Korisnik je tražio krivo polje.
 * Od sada: broj je vidljivo obavezan PRIJE klika, kvačica „nema broj" ga
 * oslobađa, a poruka imenuje SAMO ono što stvarno nedostaje.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

const { showError, showSuccess, confirmItem } = vi.hoisted(() => ({
  showError: vi.fn(),
  showSuccess: vi.fn(),
  confirmItem: vi.fn(),
}));

vi.mock('@/hooks/useStatusFeedback', () => ({ showError, showSuccess, showUndoToast: vi.fn() }));

vi.mock('react-i18next', async () => ({
  ...(await import('@/test/mocks/reactI18next')).createReactI18nextMock(),
  useTranslation: () => ({
    t: (key: string, fallback?: string | Record<string, unknown>, vars?: Record<string, unknown>) => {
      const opts = (typeof fallback === 'object' ? fallback : vars) as
        | Record<string, unknown>
        | undefined;
      if (key === 'mailReview.error.missingFields') return `Nedostaje: ${String(opts?.fields ?? '')}`;
      if (key === 'mailReview.field.invoiceNumber') return 'Broj dokumenta';
      return typeof fallback === 'string' ? fallback : key;
    },
  }),
}));

vi.mock('@/components/mail/StatementReviewCard', () => ({ StatementReviewCard: () => null }));
vi.mock('@/hooks/useBusinessProfiles', () => ({
  useBusinessProfiles: () => ({ profiles: [], loading: false, refetch: vi.fn() }),
}));

vi.mock('@/hooks/useMailReviewQueue', () => ({
  useMailReviewQueue: () => ({
    items: [
      {
        id: 'item-bolt',
        classification: 'racun',
        extraction: {
          supplier_name: 'Taxi Dama',
          supplier_oib: '58303618666',
          total_amount: 9.8,
          issue_date: '2026-09-01',
          invoice_number: null,
        },
        confidence: 'visoka',
        trust_level: 'T2',
        warnings: [],
        doc_type: '380',
        created_at: '2026-09-01T06:00:00Z',
        subject: 'Tvoja Bolt vožnja u utorak',
        from_header: 'bolt@example.com',
      },
    ],
    loading: false,
    working: false,
    confirmItem,
    discardItem: vi.fn(),
    confirmAsStatement: vi.fn(),
    confirmAsInvoice: vi.fn(),
    keepItem: vi.fn(),
    markVerificationClicked: vi.fn(),
    setScope: vi.fn(),
    refetch: vi.fn(),
  }),
}));

import { MailReviewList } from '@/components/mail/MailReviewList';
import { BackButtonProvider } from '@/contexts/BackButtonContext';
import { MemoryRouter } from 'react-router-dom';

const renderList = () =>
  render(
    <MemoryRouter>
      <BackButtonProvider>
        <MailReviewList active />
      </BackButtonProvider>
    </MemoryRouter>,
  );

const confirmButton = () =>
  screen.getAllByRole('button').find((b) => b.textContent?.includes('Potvrdi')) as HTMLButtonElement;

describe('račun bez broja dokumenta', () => {
  beforeEach(() => {
    showError.mockClear();
    showSuccess.mockClear();
    confirmItem.mockReset().mockResolvedValue({ ok: true, invoiceId: 'inv-1', already: false });
  });

  it('nudi kvačicu „dokument nema broj" i drži „Potvrdi" onemogućenim dok nije označena', () => {
    renderList();
    expect(screen.getByTestId('missing-number-ack')).toBeTruthy();
    expect(confirmButton().disabled).toBe(true);
  });

  it('označena kvačica otključava potvrdu i šalje allow_missing_number', async () => {
    renderList();
    fireEvent.click(screen.getByTestId('missing-number-ack').querySelector('button')!);
    await waitFor(() => expect(confirmButton().disabled).toBe(false));
    fireEvent.click(confirmButton());
    await waitFor(() => expect(confirmItem).toHaveBeenCalled());
    const payload = confirmItem.mock.calls[0][1] as Record<string, unknown>;
    expect(payload.allow_missing_number).toBe(true);
    expect(payload.allow_missing_oib).toBe(false);
  });

  it('poruka imenuje SAMO polja iz odgovora baze — ne spominje OIB', async () => {
    confirmItem.mockResolvedValue({ ok: false, reason: 'nedostaju_polja', missing: ['invoice_number'] });
    renderList();
    fireEvent.click(screen.getByTestId('missing-number-ack').querySelector('button')!);
    await waitFor(() => expect(confirmButton().disabled).toBe(false));
    fireEvent.click(confirmButton());

    await waitFor(() => expect(showError).toHaveBeenCalled());
    const msg = String(showError.mock.calls[0][0]);
    expect(msg).toBe('Nedostaje: Broj dokumenta');
    expect(msg).not.toContain('OIB');
    // Polje se osvjetljava u obrascu, obrazac ostaje otvoren.
    await waitFor(() =>
      expect(screen.getByTestId('mail-field-missing-invoice_number')).toBeTruthy(),
    );
  });
});
