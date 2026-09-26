import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

const mutate = vi.fn();
const item = {
  id: 'q', user_id: 'u', bank_account_id: 'b', stable_id: 's', reason: 'ambiguous', candidate_ids: ['a', 'b'], created_at: '',
  payload: { amount: 12, date: '2026-09-01T00:00:00Z', type: 'expense', description: 'KONZUM', currency: 'EUR', payment_source: 'custom:w1', wallet_id: 'w1', payment_source_card_id: null, business_profile_id: null, bank_raw_line: 'KONZUM 123' },
};
const cand = (id: string) => ({ id, user_id: 'u', amount: 12, date: '2026-09-01', description: `ručno ${id}`, payment_source: 'custom:w1' });
let queue: unknown = { items: [item], candidates: { a: cand('a'), b: cand('b') } };

vi.mock('react-i18next', () => ({ initReactI18next: { type: '3rdParty', init: () => {} }, useTranslation: () => ({ t: (k: string, o?: Record<string, unknown>) => (o?.label ? `${k}:${o.label}` : k) }) }));
vi.mock('@/hooks/useBankSyncReviewQueue', () => ({
  useBankSyncReviewQueue: () => ({ data: queue, isLoading: false, error: null }),
  useBankSyncReviewDecide: () => ({ mutate, isPending: false }),
}));
vi.mock('@/hooks/useCustomPaymentSources', () => ({
  useCustomPaymentSources: () => ({ customPaymentSources: [{ id: 'w1', name: 'Tekući' }, { id: 'w2', name: 'Štednja' }] }),
}));
vi.mock('@/hooks/useStatusFeedback', () => ({ showError: vi.fn(), showSuccess: vi.fn() }));

import BankSyncReview from '@/pages/BankSyncReview';

const renderPage = () => render(<MemoryRouter><BankSyncReview /></MemoryRouter>);
const choiceOf = () => mutate.mock.calls.at(-1)?.[0].choice;

describe('BankSyncReview — 5 odluka', () => {
  beforeEach(() => { mutate.mockReset(); queue = { items: [item], candidates: { a: cand('a'), b: cand('b') } }; });

  it('prikazuje kandidate s datumom, iznosom, novčanikom i tekstom banke', () => {
    renderPage();
    expect(screen.getByText('KONZUM 123')).toBeTruthy();
    expect(screen.getByText('ručno a')).toBeTruthy();
    expect(screen.getAllByText(/Tekući/).length).toBeGreaterThan(0);
  });
  it('Spoji s A / B', () => {
    renderPage();
    fireEvent.click(screen.getByText('bankReview.mergeWith:A'));
    expect(choiceOf()).toEqual({ kind: 'merge', targetId: 'a' });
    fireEvent.click(screen.getByText('bankReview.mergeWith:B'));
    expect(choiceOf()).toEqual({ kind: 'merge', targetId: 'b' });
  });
  it('Novi redak i Preskoči', () => {
    renderPage();
    fireEvent.click(screen.getByText('bankReview.newRow'));
    expect(choiceOf()).toEqual({ kind: 'new' });
    fireEvent.click(screen.getByText('bankReview.dismiss'));
    expect(choiceOf()).toEqual({ kind: 'dismiss' });
  });
  it('Prijenos traži cilj', () => {
    renderPage();
    fireEvent.click(screen.getByText('bankReview.transfer'));
    expect((screen.getByText('bankReview.transferConfirm').closest('button') as HTMLButtonElement).disabled).toBe(true);
    expect(mutate).not.toHaveBeenCalled();
  });
  it('prazno stanje', () => {
    queue = { items: [], candidates: {} };
    renderPage();
    expect(screen.getByTestId('review-empty')).toBeTruthy();
  });
});
