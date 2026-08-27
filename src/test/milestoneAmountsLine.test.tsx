import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { buildMilestoneAmountsLine, type MilestoneAmountRole } from '@/lib/milestoneAmounts';
import { MilestoneAmountsSection } from '@/components/projects/MilestoneAmountsSection';

import { createReactI18nextMock } from '@/test/mocks/reactI18next';
vi.mock('react-i18next', () => ({
  ...createReactI18nextMock(),
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

describe('MilestoneAmountsSection — vidljivost polja ovisi o ULOZI, ne o vrijednosti', () => {
  const baseProps = {
    cost: '',
    onCostChange: vi.fn(),
    price: '',
    onPriceChange: vi.fn(),
    priceApplicable: true,
  };

  const cases: Array<{
    role: MilestoneAmountRole;
    isOwner: boolean;
    cost: boolean;
    price: boolean;
  }> = [
    { role: 'owner', isOwner: true, cost: true, price: true },
    { role: 'viewer', isOwner: false, cost: true, price: true },
    { role: 'member', isOwner: false, cost: true, price: false },
    { role: 'investor', isOwner: false, cost: false, price: true },
    { role: 'worker', isOwner: false, cost: false, price: false },
  ];

  it.each(cases)('$role -> trošak: $cost, cijena: $price', ({ role, isOwner, cost, price }) => {
    const { unmount } = render(
      <MilestoneAmountsSection {...baseProps} role={role} isOwner={isOwner} />,
    );
    expect(!!screen.queryByTestId('milestone-cost')).toBe(cost);
    expect(!!screen.queryByTestId('milestone-price')).toBe(price);
    unmount();
  });

  it('vlasnik s praznom fazom (budget === null) I DALJE ima polje troška', () => {
    render(<MilestoneAmountsSection {...baseProps} cost="" role="owner" isOwner />);
    expect(screen.getByTestId('milestone-cost')).toBeTruthy();
  });

  it('cijena se ne prikazuje kad nije primjenjiva (osobni projekt bez iznosa)', () => {
    render(
      <MilestoneAmountsSection {...baseProps} priceApplicable={false} role="owner" isOwner />,
    );
    expect(screen.getByTestId('milestone-cost')).toBeTruthy();
    expect(screen.queryByTestId('milestone-price')).toBeNull();
  });
});

