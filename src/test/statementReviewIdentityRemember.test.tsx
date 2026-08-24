/**
 * ČUVAR — svjesna potvrda na neslaganju identiteta računa se NIKAD ne pamti.
 *
 * Ako izvod glasi na jedan IBAN, a odabrani novčanik na drugi, korisnik može
 * kliknuti „Svejedno uvezi", ali se to NE smije pretvoriti u zapamćeno pravilo
 * niti u upisani identifikator na novčanik.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { StatementReviewCard } from '@/components/mail/StatementReviewCard';
import type { MailReviewItem } from '@/hooks/useMailReviewQueue';

const STATEMENT_IBAN = 'LT433250072163608687';
const WALLET_IBAN = 'LT183250041594525319';

const baseItem = (extraction: Record<string, unknown> = {}): MailReviewItem => ({
  id: 'item-1',
  classification: 'izvod',
  extraction,
  confidence: null,
  trust_level: 'T4',
  warnings: [],
  doc_type: null,
  created_at: '2026-08-24T00:00:00Z',
  subject: 'Izvod',
  from_header: 'banka@example.com',
  scope_type: 'user',
  scope_id: null,
  scope_set_by_user: false,
  attachment_id: 'att-1',
  storage_path: 'inbound-mail/item-1/izvod.pdf',
  file_name: 'izvod.pdf',
});

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (_key: string, defaultValue?: string) => defaultValue ?? _key,
  }),
}));

vi.mock('@/hooks/useAuth', () => ({
  useAuth: () => ({ user: { id: 'u1' } }),
}));

vi.mock('@/hooks/useStatusFeedback', () => ({
  showError: vi.fn(),
  showSuccess: vi.fn(),
}));

const mocks = vi.hoisted(() => ({
  rememberRule: vi.fn(() => Promise.resolve(true)),
  suggestSourceId: vi.fn(() => null),
  suggestSourceFromBankAccounts: vi.fn(() => Promise.resolve(null)),
  updateCustomPaymentSource: vi.fn(() => Promise.resolve(true)),
  addCustomPaymentSource: vi.fn(() => Promise.resolve(null)),
  startImport: vi.fn(() => Promise.resolve({ kind: 'started' as const })),
}));

vi.mock('@/hooks/useStatementSourceMemory', () => ({
  useStatementSourceMemory: () => ({
    rules: [],
    loading: false,
    working: false,
    suggestSourceId: mocks.suggestSourceId,
    rememberRule: mocks.rememberRule,
    forgetRule: vi.fn(),
    refetch: vi.fn(),
  }),
  suggestSourceFromBankAccounts: mocks.suggestSourceFromBankAccounts,
}));

const buildSources = (accountIdentifier: string | null) => [
  {
    id: 'src-revolut',
    name: 'Revolut',
    icon: '🏦',
    color: 'hsl(172 66% 40%)',
    balance: 0,
    currency: 'EUR',
    isOwned: true,
    business_profile_id: null,
    account_identifier: accountIdentifier,
  },
];

vi.mock('@/hooks/useCustomPaymentSources', () => ({
  useCustomPaymentSources: () => ({
    get customPaymentSources() {
      return buildSources((globalThis as any).__sourceIdentifier ?? null);
    },
    loading: false,
    addCustomPaymentSource: mocks.addCustomPaymentSource,
    updateCustomPaymentSource: mocks.updateCustomPaymentSource,
  }),
}));

vi.mock('@/hooks/useStatementImport', () => ({
  useStatementImport: () => ({ busy: false, startImport: mocks.startImport }),
}));

beforeEach(() => {
  vi.clearAllMocks();
  (globalThis as any).__sourceIdentifier = null;
});

const renderCard = (item: MailReviewItem) =>
  render(
    <StatementReviewCard
      item={item}
      disabled={false}
      onDiscard={vi.fn()}
      onLinked={vi.fn()}
    />,
  );

const waitForEnabledImport = async () => {
  const btn = screen.getByText('Uvezi izvod');
  await waitFor(() => expect(btn).not.toBeDisabled(), { timeout: 2000 });
  return btn;
};

describe('neslaganje identiteta — mismatch', () => {
  it('ne prikazuje kvačicu za pamćenje i ne sprema pravilo nakon „Svejedno uvezi"', async () => {
    (globalThis as any).__sourceIdentifier = WALLET_IBAN;
    const item = baseItem({
      account_iban: STATEMENT_IBAN,
      bank_name: 'Revolut Bank UAB',
      closing_balance: 100,
      currency: 'EUR',
    });

    renderCard(item);

    const importBtn = await waitForEnabledImport();
    expect(screen.queryByTestId('remember-statement-source')).toBeNull();

    fireEvent.click(importBtn);
    const confirmBtn = await screen.findByTestId('identity-confirm');
    fireEvent.click(confirmBtn);

    await waitFor(() => expect(mocks.startImport).toHaveBeenCalledTimes(1));
    expect(mocks.rememberRule).not.toHaveBeenCalled();
    expect(mocks.updateCustomPaymentSource).not.toHaveBeenCalled();
  });
});

describe('podudaranje identiteta — match', () => {
  it('prikazuje kvačicu i sprema pravilo', async () => {
    (globalThis as any).__sourceIdentifier = STATEMENT_IBAN;
    const item = baseItem({
      account_iban: STATEMENT_IBAN,
      bank_name: 'Revolut Bank UAB',
      closing_balance: 100,
      currency: 'EUR',
    });

    renderCard(item);

    const importBtn = await waitForEnabledImport();
    expect(screen.getByTestId('remember-statement-source')).toBeInTheDocument();

    fireEvent.click(importBtn);
    await waitFor(() => expect(mocks.startImport).toHaveBeenCalledTimes(1));

    await waitFor(() => expect(mocks.rememberRule).toHaveBeenCalledTimes(1));
    expect(mocks.rememberRule).toHaveBeenCalledWith(
      expect.objectContaining({
        identifier: STATEMENT_IBAN,
        paymentSourceId: 'src-revolut',
      }),
    );
  });
});

describe('nepoznat identitet novčanika — unknown', () => {
  it('prikazuje kvačicu i sprema pravilo kao i dosad', async () => {
    (globalThis as any).__sourceIdentifier = '';
    const item = baseItem({
      account_iban: STATEMENT_IBAN,
      bank_name: 'Revolut Bank UAB',
      closing_balance: 100,
      currency: 'EUR',
    });

    renderCard(item);

    const importBtn = await waitForEnabledImport();
    expect(screen.getByTestId('remember-statement-source')).toBeInTheDocument();

    fireEvent.click(importBtn);
    await waitFor(() => expect(mocks.startImport).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(mocks.rememberRule).toHaveBeenCalledTimes(1));
  });
});
