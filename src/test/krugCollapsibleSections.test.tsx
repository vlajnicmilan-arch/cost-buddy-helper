/**
 * Guard: sklopive arhivske sekcije na ekranu Kruga.
 *
 * Pravilo: što traži akciju — otvoreno; što je arhiva — zatvoreno.
 *  - "Odlučeno" i "Povijest podmirenja" su zatvorene po defaultu, s točnom
 *    ukupnom brojkom u naslovu.
 *  - Dodir otvara sadržaj.
 *  - Deep-link iz obavijesti (focusSettlementId) automatski otvara zatvorenu
 *    sekciju da HighlightTarget nađe marker.
 *  - "Za odlučivanje" / prijedlozi podjele NISU sklopivi.
 */
import { describe, it, expect, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fireEvent, render, screen } from '@testing-library/react';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (_key: string, fallback?: string) => fallback ?? _key,
    i18n: { language: 'hr' },
  }),
}));

const decided = [
  { id: 'e1', amount: 10, currency: 'EUR', date: new Date(), description: 'Prvi', krug_shared_status: 'potvrdjena', user_id: 'u1', updated_at: new Date().toISOString() },
  { id: 'e2', amount: 20, currency: 'EUR', date: new Date(), description: 'Drugi', krug_shared_status: 'nepotvrdjena', user_id: 'u1', updated_at: new Date().toISOString() },
  { id: 'e3', amount: 30, currency: 'EUR', date: new Date(), description: 'Treci', krug_shared_status: 'potvrdjena', user_id: 'u1', updated_at: new Date().toISOString() },
];

vi.mock('@/hooks/useKrugDecidedExpenses', () => ({
  useKrugDecidedExpenses: () => ({ data: decided, isLoading: false }),
}));

vi.mock('@/contexts/CurrencyContext', () => ({
  useCurrency: () => ({ formatAmount: (n: number) => `${n} €` }),
}));

vi.mock('@/hooks/useUserProfiles', () => ({
  useUserProfiles: () => new Map(),
}));

vi.mock('@/components/TransactionDetailDialog', () => ({
  TransactionDetailDialog: () => null,
}));

const ledger = [
  { id: 's1', krug_id: 'k1', from_user: 'u1', to_user: 'u2', amount: 12, currency: 'EUR', note: null, marked_by: 'u1', marked_at: new Date().toISOString(), voided_at: null, voided_by: null, void_reason: null },
  { id: 's2', krug_id: 'k1', from_user: 'u2', to_user: 'u1', amount: 8, currency: 'EUR', note: null, marked_by: 'u2', marked_at: new Date().toISOString(), voided_at: null, voided_by: null, void_reason: null },
];

vi.mock('@/hooks/useKrugSettlementMutations', () => ({
  useKrugSettlementLedger: () => ({ data: ledger, isLoading: false }),
  useKrugVoidSettlement: () => ({ mutateAsync: vi.fn(), isPending: false }),
}));

vi.mock('@/hooks/useAuth', () => ({
  useAuth: () => ({ user: { id: 'u1' } }),
}));

vi.mock('@/components/common/ConfirmActionDialog', () => ({
  ConfirmActionDialog: () => null,
}));

import { KrugDecidedSection } from '@/components/krug/KrugDecidedSection';
import { KrugSettlementHistory } from '@/components/krug/KrugSettlementHistory';

describe('Krug sklopive sekcije', () => {
  it('Odlučeno je zatvoreno po defaultu i prikazuje ukupnu brojku', () => {
    render(<KrugDecidedSection krugId="k1" />);
    expect(screen.getByText('Odlučeno')).toBeInTheDocument();
    expect(screen.getByText('(3)')).toBeInTheDocument();
    expect(screen.getByTestId('krug-decided-section-toggle')).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByText('Prvi')).not.toBeInTheDocument();
  });

  it('dodir otvara Odlučeno', () => {
    render(<KrugDecidedSection krugId="k1" />);
    fireEvent.click(screen.getByTestId('krug-decided-section-toggle'));
    expect(screen.getByText('Prvi')).toBeInTheDocument();
    expect(screen.getByText('Treci')).toBeInTheDocument();
  });

  it('Povijest podmirenja je zatvorena po defaultu s točnom brojkom', () => {
    render(<KrugSettlementHistory krugId="k1" isFullMember />);
    expect(screen.getByText('(2)')).toBeInTheDocument();
    expect(screen.getByTestId('krug-settlement-history-toggle')).toHaveAttribute('aria-expanded', 'false');
    expect(document.querySelector('[data-highlight-id="settlement:s1"]')).toBeNull();
  });

  it('deep-link automatski otvara zatvorenu Povijest podmirenja i marker je u DOM-u', () => {
    render(<KrugSettlementHistory krugId="k1" isFullMember focusSettlementId="s2" />);
    expect(screen.getByTestId('krug-settlement-history-toggle')).toHaveAttribute('aria-expanded', 'true');
    expect(document.querySelector('[data-highlight-id="settlement:s2"]')).not.toBeNull();
  });

  it('sekcije koje traže akciju nisu sklopive', () => {
    const queue = readFileSync(join(process.cwd(), 'src/components/krug/KrugApprovalQueue.tsx'), 'utf8');
    expect(queue).not.toMatch(/CollapsibleSection/);
  });
});
