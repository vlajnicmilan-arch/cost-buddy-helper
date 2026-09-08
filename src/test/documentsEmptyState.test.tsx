/**
 * Prazno stanje /dokumenti objašnjava mail-lijevak, pokazuje prijemnu adresu
 * (isti izvor kao Postavke → Uvoz iz e-maila) i nudi gumb Kopiraj.
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

vi.mock('react-i18next', async () => ({
  ...(await import('@/test/mocks/reactI18next')).createReactI18nextMock(),
  useTranslation: () => ({ t: (key: string, fallback?: string) => fallback ?? key }),
}));

vi.mock('@/hooks/useMailInbox', () => ({
  useMailInbox: () => ({
    alias: { id: 'a1', alias_local: 'c-abcdefgh23456789', created_at: '', disabled_at: null },
    messages: [],
    loading: false,
    working: false,
    ensureAlias: vi.fn(),
    regenerateAlias: vi.fn(),
    refetch: vi.fn(),
  }),
}));

import { DocumentsEmptyState } from '@/components/mail/DocumentsEmptyState';

describe('DocumentsEmptyState', () => {
  it('renderira objašnjenje, adresu i gumb Kopiraj', () => {
    render(
      <MemoryRouter>
        <DocumentsEmptyState />
      </MemoryRouter>
    );

    expect(screen.getByText(/Ovdje stižu računi, ponude i izvodi/)).toBeInTheDocument();
    expect(screen.getByText('c-abcdefgh23456789@centar.vmbalance.com')).toBeInTheDocument();
    expect(screen.getByText('Kopiraj')).toBeInTheDocument();
    expect(screen.getByText('Postavke uvoza')).toBeInTheDocument();
  });
});
