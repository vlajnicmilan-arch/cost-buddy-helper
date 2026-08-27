/**
 * KVAR 2 (UI dio) — nijema greška.
 * Dijalog MORA prikazati konkretan razlog iz `mail_item_confirm`, ne generički
 * "Spremanje nije uspjelo".
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

const { showError, showSuccess, confirmItem } = vi.hoisted(() => ({
  showError: vi.fn(),
  showSuccess: vi.fn(),
  confirmItem: vi.fn(),
}));

vi.mock('@/hooks/useStatusFeedback', () => ({ showError, showSuccess }));

import { createReactI18nextMock } from '@/test/mocks/reactI18next';
vi.mock('react-i18next', () => ({
  ...createReactI18nextMock(),
  useTranslation: () => ({
    t: (key: string, fallback?: string) =>
      key === 'mailReview.error.nedostaju_polja'
        ? 'Nedostaju obavezni podaci — OIB dobavljača i broj dokumenta.'
        : (fallback ?? key),
  }),
}));

// Kartica izvoda vuče cijeli uvoz (i18n init) — ovdje testiramo samo račun.
vi.mock('@/components/mail/StatementReviewCard', () => ({
  StatementReviewCard: () => null,
}));

// Chip odredišta traži profile (useAuth) — u ovom testu nas zanima samo greška.
vi.mock('@/hooks/useBusinessProfiles', () => ({
  useBusinessProfiles: () => ({ profiles: [], loading: false, refetch: vi.fn() }),
}));

vi.mock('@/hooks/useMailReviewQueue', () => ({
  useMailReviewQueue: () => ({
    items: [
      {
        id: 'item-1',
        classification: 'racun',
        // OIB je prisutan: nedostatak OIB-a od kolovoza 2026 traži svjesnu
        // kvačicu, pa bi inače pao klijentski uvjet prije RPC-a.
        extraction: { supplier_name: 'ACME', supplier_oib: '69435151530', invoice_number: '1' },
        confidence: 'visoka',
        trust_level: 'T1',
        warnings: [],
        doc_type: '380',
        created_at: '2026-08-09T06:00:00Z',
        subject: 'Račun',
        from_header: 'acme@example.com',
      },
    ],
    loading: false,
    working: false,
    confirmItem,
    discardItem: vi.fn(),
    setScope: vi.fn(),
    refresh: vi.fn(),
  }),
}));

import { MailReviewDialog } from '@/components/mail/MailReviewDialog';
import { BackButtonProvider } from '@/contexts/BackButtonContext';
import { MemoryRouter } from 'react-router-dom';

const renderDialog = () =>
  render(
    <MemoryRouter>
      <BackButtonProvider>
        <MailReviewDialog open onOpenChange={() => {}} />
      </BackButtonProvider>
    </MemoryRouter>,
  );

describe('MailReviewDialog — razlog greške', () => {
  beforeEach(() => {
    showError.mockClear();
    showSuccess.mockClear();
    confirmItem.mockReset();
  });

  it('prikazuje konkretan razlog umjesto generičkog teksta', async () => {
    confirmItem.mockResolvedValue({ ok: false, reason: 'nedostaju_polja' });

    renderDialog();
    fireEvent.click(screen.getAllByText('Potvrdi')[0]);

    await waitFor(() => expect(showError).toHaveBeenCalled());
    expect(showError.mock.calls[0][0]).toContain('Nedostaju obavezni podaci');
    expect(showError.mock.calls[0][0]).not.toBe('Spremanje nije uspjelo');
  });

  it('ponovljena potvrda (already) javlja da je dokument već spremljen', async () => {
    confirmItem.mockResolvedValue({ ok: true, invoiceId: 'inv-1', already: true });

    renderDialog();
    fireEvent.click(screen.getAllByText('Potvrdi')[0]);

    await waitFor(() => expect(showSuccess).toHaveBeenCalled());
    expect(showSuccess.mock.calls[0][0]).toContain('već');
    expect(showError).not.toHaveBeenCalled();
  });
});
