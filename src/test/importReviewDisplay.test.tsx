import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { AmountCell } from '@/pages/ImportReview';
import { formatDateUi } from '@/lib/dateFormat';

const formatAmount = (n: number) =>
  new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' }).format(n);

const ERSTE_ROWS = [
  { amount: 140.29, type: 'expense' },
  { amount: 42.51, type: 'expense' },
  { amount: 136.04, type: 'expense' },
  { amount: 127.54, type: 'expense' },
  { amount: 330.0, type: 'income' },
] as const;

/**
 * ČUVAR PRIKAZA EKRANA UVOZA (/import-review).
 *
 * 1. Datum se prikazuje prema aktivnom jeziku (hr/en/de), s vidljivom godinom.
 * 2. Odljev i priljev se razlikuju istim tokenima kao u TransactionItem:
 *    expense = − + text-expense, income = + + text-income.
 */
describe('ImportReview prikaz — stvarni Erste rujan 2026', () => {
  it.each([
    { lang: 'hr', date: '02.09.2026.' },
    { lang: 'en', date: '2 Sept 2026' },
    { lang: 'de', date: '2. Sept. 2026' },
  ])('datum i iznosi za $lang', ({ lang, date }) => {
    expect(formatDateUi('2026-09-02', lang)).toBe(date);

    const expectedAmounts = ERSTE_ROWS.map(
      r => `${r.type === 'expense' ? '−' : '+'}${formatAmount(r.amount)}`,
    );

    for (let i = 0; i < ERSTE_ROWS.length; i++) {
      const row = ERSTE_ROWS[i];
      const { container, unmount } = render(
        <AmountCell amount={row.amount} type={row.type} formatAmount={formatAmount} />,
      );
      expect(container.textContent).toBe(expectedAmounts[i]);
      expect(
        container.querySelector(row.type === 'expense' ? '.text-expense' : '.text-income'),
      ).toBeTruthy();
      unmount();
    }
  });
});
