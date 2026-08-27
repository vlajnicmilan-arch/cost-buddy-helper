/**
 * RASKRIŽJE UMJESTO PROVALIJE.
 *
 * Živi kvar (17.8.2026.): pitanje „je li ovo izvod?" imalo je JEDINI drugi
 * izlaz „nije" — a taj je stavku slao u `odbacio_korisnik`. Dokument je
 * nestao. Od sada pitanje ima četiri izlaza i samo IZRIČITI „Odbaci"
 * odbacuje.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

const { showError, showSuccess, confirmAsStatement, confirmAsInvoice, keepItem, discardItem } =
  vi.hoisted(() => ({
    showError: vi.fn(),
    showSuccess: vi.fn(),
    confirmAsStatement: vi.fn(),
    confirmAsInvoice: vi.fn(),
    keepItem: vi.fn(),
    discardItem: vi.fn(),
  }));

vi.mock('@/hooks/useStatusFeedback', () => ({
  showError,
  showSuccess,
  showUndoToast: vi.fn(),
}));

import { createReactI18nextMock } from '@/test/mocks/reactI18next';
vi.mock('react-i18next', () => ({
  ...createReactI18nextMock(),
  useTranslation: () => ({ t: (key: string, fallback?: string) => fallback ?? key }),
}));

vi.mock('@/components/mail/StatementReviewCard', () => ({ StatementReviewCard: () => null }));

vi.mock('@/hooks/useBusinessProfiles', () => ({
  useBusinessProfiles: () => ({ profiles: [], loading: false, refetch: vi.fn() }),
}));

vi.mock('@/hooks/useMailReviewQueue', () => ({
  useMailReviewQueue: () => ({
    items: [
      {
        id: 'item-osijek',
        classification: 'nepoznato',
        extraction: null,
        confidence: 'niska',
        trust_level: 'T2',
        warnings: ['mozda_izvod'],
        doc_type: null,
        created_at: '2026-08-17T03:42:00Z',
        subject: 'Fwd: Račun Grad Osijek',
        from_header: 'posiljatelj@example.com',
      },
    ],
    loading: false,
    working: false,
    confirmItem: vi.fn(),
    discardItem,
    confirmAsStatement,
    confirmAsInvoice,
    keepItem,
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

describe('pitanje „je li izvod?" je raskrižje', () => {
  beforeEach(() => {
    confirmAsStatement.mockReset().mockResolvedValue({ ok: true });
    confirmAsInvoice.mockReset().mockResolvedValue({ ok: true });
    keepItem.mockReset().mockResolvedValue(true);
    discardItem.mockReset().mockResolvedValue(undefined);
    showError.mockClear();
    showSuccess.mockClear();
  });

  it('nudi sva četiri izlaza', () => {
    renderList();
    expect(screen.getByTestId('mail-maybe-statement-item')).toBeTruthy();
    expect(screen.getByTestId('mail-choice-invoice')).toBeTruthy();
    expect(screen.getByTestId('mail-choice-keep')).toBeTruthy();
    expect(screen.getByTestId('mail-choice-discard')).toBeTruthy();
  });

  it('„Ovo je račun" šalje stavku u račun-put i NE odbacuje je', async () => {
    renderList();
    fireEvent.click(screen.getByTestId('mail-choice-invoice'));
    await waitFor(() => expect(confirmAsInvoice).toHaveBeenCalledWith('item-osijek'));
    expect(discardItem).not.toHaveBeenCalled();
  });

  it('„Zadrži" ostavlja dokument u Primljeno, bez odbacivanja', async () => {
    renderList();
    fireEvent.click(screen.getByTestId('mail-choice-keep'));
    await waitFor(() => expect(keepItem).toHaveBeenCalledWith('item-osijek'));
    expect(discardItem).not.toHaveBeenCalled();
  });

  it('NEGATIVNI: izričiti „Odbaci" i dalje odbacuje', async () => {
    renderList();
    fireEvent.click(screen.getByTestId('mail-choice-discard'));
    await waitFor(() => expect(discardItem).toHaveBeenCalledWith('item-osijek'));
    expect(confirmAsInvoice).not.toHaveBeenCalled();
    expect(keepItem).not.toHaveBeenCalled();
  });
});
