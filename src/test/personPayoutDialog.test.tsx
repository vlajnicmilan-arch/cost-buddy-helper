import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { PersonPayoutDialog } from '@/components/projects/PersonPayoutDialog';
import type { PersonAggregate } from '@/lib/workerIdentity';

const payPerson = vi.fn();
const previewPersonPeriod = vi.fn();

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, def?: unknown, opts?: Record<string, unknown>) => {
      const o = (typeof def === 'object' ? def : opts) as Record<string, unknown> | undefined;
      const base = typeof def === 'string' ? def : key;
      return base.replace(/\{\{(\w+)\}\}/g, (_, k) => String(o?.[k] ?? ''));
    },
    i18n: { language: 'hr' },
  }),
}));
vi.mock('@/contexts/CurrencyContext', () => ({
  useCurrency: () => ({ formatAmount: (n: number) => `${Number(n).toFixed(2)} €` }),
}));
vi.mock('@/hooks/useCustomPaymentSources', () => ({
  useCustomPaymentSources: () => ({ customPaymentSources: [{ id: 's1', name: 'Blagajna' }] }),
}));
vi.mock('@/hooks/usePersonPayout', () => ({
  usePersonPayout: () => ({ payPerson, submitting: false }),
}));
vi.mock('@/hooks/useBackButton', () => ({ useBackButton: () => {} }));
vi.mock('@/hooks/useStatusFeedback', () => ({ showError: vi.fn(), showSuccess: vi.fn() }));
vi.mock('@/lib/personPayoutPreview', () => ({
  previewPersonPeriod: (...a: unknown[]) => previewPersonPeriod(...a),
}));

const row = (id: string, projectId: string, remaining: number, earned: number, from: string) => ({
  engagementId: id,
  projectId,
  hourlyRate: 10,
  position: null,
  hours: earned / 10,
  earned,
  paid: earned - remaining,
  remaining,
  advance: 0,
  shortfalls: [],
  unpaidFrom: from,
  unpaidTo: from,
});

const aggregate = {
  byProject: [row('eA', 'pA', 100, 150, '2026-05-01'), row('eB', 'pB', 50, 50, '2026-03-01')],
  payouts: [],
} as unknown as PersonAggregate;

const names = { pA: 'Kuća', pB: 'Stan' };

const setup = (projectId: string | null = null) =>
  render(
    <PersonPayoutDialog
      open
      onOpenChange={() => {}}
      personId="w1"
      name="Ivo"
      aggregate={aggregate}
      projectNames={names}
      projectId={projectId}
    />,
  );

const amountInput = () => screen.getByPlaceholderText('0,00');
const allocInput = (p: string) => screen.getByLabelText(`Iznos za ${p}`) as HTMLInputElement;
const summary = () => screen.getByTestId('payout-summary').textContent;

beforeEach(() => {
  payPerson.mockReset();
  previewPersonPeriod.mockReset();
});

describe('PersonPayoutDialog scope', () => {
  it('opened from a project does not fill other projects', () => {
    setup('pA');
    fireEvent.change(amountInput(), { target: { value: '120' } });
    // FIFO would put 50 on the older Stan first; the scope keeps it on Kuća.
    expect(allocInput('Kuća').value).toBe('100');
    expect(allocInput('Stan').value).toBe('0');
    expect(allocInput('Stan').disabled).toBe(true);
  });

  it('"Raspodijeli na sve" fills FIFO across all projects', () => {
    setup('pA');
    fireEvent.change(amountInput(), { target: { value: '120' } });
    fireEvent.click(screen.getByText('Raspodijeli na sve'));
    expect(allocInput('Stan').value).toBe('50');
    expect(allocInput('Kuća').value).toBe('70');
  });

  it('opened from People without a project uses FIFO over everything', () => {
    setup(null);
    fireEvent.change(amountInput(), { target: { value: '60' } });
    expect(allocInput('Stan').value).toBe('50');
    expect(allocInput('Kuća').value).toBe('10');
    expect(screen.queryByText('Raspodijeli na sve')).toBeNull();
  });

  it('summary follows amount and selection', () => {
    setup('pA');
    expect(summary()).toBe('Isplaćuješ 0.00 € · Zarađeno 150.00 € · Ostaje 100.00 €');
    fireEvent.change(amountInput(), { target: { value: '40' } });
    expect(summary()).toBe('Isplaćuješ 40.00 € · Zarađeno 150.00 € · Ostaje 60.00 €');
    fireEvent.click(screen.getByRole('checkbox', { name: 'Stan' }));
    expect(summary()).toBe('Isplaćuješ 40.00 € · Zarađeno 200.00 € · Ostaje 110.00 €');
  });
});

describe('PersonPayoutDialog lockEntries', () => {
  const pay = async () => {
    fireEvent.change(amountInput(), { target: { value: '10' } });
    // wallet select: pick through Radix is not possible in jsdom; set via keyboard fallback
    const trigger = screen.getByRole('combobox');
    fireEvent.keyDown(trigger, { key: 'Enter' });
    fireEvent.click(await screen.findByRole('option', { name: 'Blagajna' }));
    payPerson.mockResolvedValue({ ok: true, result: {} });
    fireEvent.click(screen.getByRole('button', { name: 'Isplati' }));
    await waitFor(() => expect(payPerson).toHaveBeenCalled());
    return payPerson.mock.calls[0][0].lockEntries;
  };

  it('defaults to true', async () => {
    setup(null);
    expect(await pay()).toBe(true);
  });

  it('sends false when switched off', async () => {
    setup(null);
    fireEvent.click(screen.getByRole('switch'));
    expect(await pay()).toBe(false);
  });
});

describe('PersonPayoutDialog rate breakdown', () => {
  it('shows hours × rate per engagement from the preview', async () => {
    previewPersonPeriod.mockResolvedValue({
      total: 80,
      items: [{ engagementId: 'eA', projectId: 'pA', hours: 8, gross: 80 }],
    });
    setup('pA');
    // Range picking goes through the calendar; trigger calc via the section by
    // selecting two days.
    fireEvent.click(screen.getByText('Odaberi razdoblje'));
    const days = await screen.findAllByRole('gridcell');
    const buttons = days.map((d) => d.querySelector('button')).filter((b): b is HTMLButtonElement => !!b && !b.disabled);
    fireEvent.click(buttons[0]);
    fireEvent.click(buttons[1]);
    await waitFor(() => expect(previewPersonPeriod).toHaveBeenCalled());
    // only the project engagement is previewed
    expect(previewPersonPeriod.mock.calls[0][0].map((o: { engagementId: string }) => o.engagementId)).toEqual(['eA']);
    fireEvent.click(await screen.findByText('Raščlamba po satnici'));
    expect((await screen.findByTestId('rate-breakdown-row')).textContent).toContain('8 h × 10.00 €/h = 80.00 €');
  });
});
