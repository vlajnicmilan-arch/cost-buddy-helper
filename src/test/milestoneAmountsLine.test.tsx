import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { buildMilestoneAmountsLine } from '@/lib/milestoneAmounts';
import { MilestoneAmountsSection } from '@/components/projects/MilestoneAmountsSection';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

vi.mock('@/contexts/CurrencyContext', () => ({
  useCurrency: () => ({ formatAmount: (n: number) => `${n} €`, currency: { symbol: '€' } }),
}));

describe('buildMilestoneAmountsLine — četiri slučaja retka s iznosima', () => {
  it('oba iznosa -> listLine', () => {
    expect(buildMilestoneAmountsLine(100, 150)).toEqual({
      key: 'projects.milestoneAmounts.listLine',
      cost: 100,
      price: 150,
    });
  });

  it('samo trošak -> listLineCostOnly', () => {
    expect(buildMilestoneAmountsLine(100, null)).toEqual({
      key: 'projects.milestoneAmounts.listLineCostOnly',
      cost: 100,
      price: null,
    });
  });

  it('samo cijena -> listLinePriceOnly (Korak C: budget premješten u investor_price)', () => {
    expect(buildMilestoneAmountsLine(null, 150)).toEqual({
      key: 'projects.milestoneAmounts.listLinePriceOnly',
      cost: null,
      price: 150,
    });
  });

  it('nijedan iznos -> null (retka nema)', () => {
    expect(buildMilestoneAmountsLine(null, null)).toBeNull();
    expect(buildMilestoneAmountsLine(undefined, undefined)).toBeNull();
    expect(buildMilestoneAmountsLine(0, 0)).toBeNull();
  });

  it('nula i NaN se ne prikazuju sami za sebe', () => {
    expect(buildMilestoneAmountsLine(0, 150)?.key).toBe('projects.milestoneAmounts.listLinePriceOnly');
    expect(buildMilestoneAmountsLine(100, NaN)?.key).toBe('projects.milestoneAmounts.listLineCostOnly');
  });
});

describe('MilestoneAmountsSection — skriveno polje troška se ne renderira', () => {
  const baseProps = {
    cost: '',
    onCostChange: vi.fn(),
    price: '',
    onPriceChange: vi.fn(),
    showPrice: true,
  };

  it('postojeća faza s budget === null -> polje troška izostaje', () => {
    render(<MilestoneAmountsSection {...baseProps} showCost={false} />);
    expect(screen.queryByTestId('milestone-cost')).toBeNull();
    expect(screen.getByTestId('milestone-price')).toBeTruthy();
  });

  it('nova faza / vlasnik -> polje troška je vidljivo', () => {
    render(<MilestoneAmountsSection {...baseProps} showCost />);
    expect(screen.getByTestId('milestone-cost')).toBeTruthy();
  });
});
