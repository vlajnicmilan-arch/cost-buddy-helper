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

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, fallback?: string) =>
      key === 'mailReview.error.nedostaju_polja'
        ? 'Nedostaju obavezni podaci — OIB dobavljača i broj dokumenta.'
        : (fallback ?? key),
  }),
}));

vi.mock('@/hooks/useMailReviewQueue', () => ({
  useMailReviewQueue: () => ({
    items: [
      {
        id: 'item-1',
        classification: 'racun',
        extraction: { supplier_name: 'ACME', invoice_number: '1' },
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
    refresh: vi.fn(),
  }),
}));

import { MailReviewDialog } from '@/components/mail/MailReviewDialog';
import { BackButtonProvider } from '@/contexts/BackButtonContext';

const renderDialog = () =>
  render(
    <BackButtonProvider>
      <MailReviewDialog open onOpenChange={() => {}} />
    </BackButtonProvider>,
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
