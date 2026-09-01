import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { MailReviewFieldInput } from '@/components/mail/MailReviewFieldInput';
import { formatDateHr } from '@/lib/dateFormat';

vi.mock('react-i18next', async () => ({
  ...(await import('@/test/mocks/reactI18next')).createReactI18nextMock(),
  useTranslation: () => ({ t: (_key: string, fallback: string) => fallback }),
}));

/**
 * Regresija (živi test #4): odabir datuma u Calendar popoveru ostavljao je
 * popover otvoren. Popover mora nestati u istom potezu s upisom vrijednosti.
 */
describe('MailReviewFieldInput — kalendar', () => {
  it('odabir datuma upisuje vrijednost i ODMAH zatvara popover', () => {
    const onChange = vi.fn();
    const fixedValue = '15.08.2026.';
    render(
      <MailReviewFieldInput
        label="Datum"
        kind="date"
        value={fixedValue}
        dateContext="expense"
        onChange={onChange}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Odaberi datum' }));
    expect(screen.getByRole('grid')).toBeInTheDocument();

    // Odaberi dan koji je sigurno različit od vrijednosti u polju i dopušten za 'expense'.
    const dayCell = screen
      .getAllByRole('gridcell')
      .find((el) => el.textContent?.trim() === '16' && el.getAttribute('aria-disabled') !== 'true');
    expect(dayCell).toBeTruthy();
    fireEvent.click(dayCell!);

    expect(onChange).toHaveBeenCalledWith('16.08.2026.');
    expect(screen.queryByRole('grid')).not.toBeInTheDocument();
  });

  it('klik na već odabrani datum zatvara popover, ali NE mijenja vrijednost', () => {
    const onChange = vi.fn();
    const fixedValue = '15.08.2026.';
    render(
      <MailReviewFieldInput
        label="Datum"
        kind="date"
        value={fixedValue}
        dateContext="expense"
        onChange={onChange}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Odaberi datum' }));
    expect(screen.getByRole('grid')).toBeInTheDocument();

    const dayCell = screen
      .getAllByRole('gridcell')
      .find((el) => el.textContent?.trim() === '15' && el.getAttribute('aria-disabled') !== 'true');
    expect(dayCell).toBeTruthy();
    fireEvent.click(dayCell!);

    expect(onChange).not.toHaveBeenCalled();
    expect(screen.queryByRole('grid')).not.toBeInTheDocument();
  });

  it('polje s nevaljanim datumom prikazuje inline poruku, ne pada tiho', () => {
    render(
      <MailReviewFieldInput label="Datum" kind="date" value="32.13.2026." onChange={vi.fn()} />,
    );
    expect(screen.getByText('Nevaljan datum — npr. 15.08.2026.')).toBeInTheDocument();
  });
});
