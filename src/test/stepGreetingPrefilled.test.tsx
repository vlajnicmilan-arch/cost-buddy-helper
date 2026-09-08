/**
 * Kad je ime već poznato pri prvom prikazu, greeting ne pita "Kako da te zovem?".
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

vi.mock('react-i18next', async () => ({
  ...(await import('@/test/mocks/reactI18next')).createReactI18nextMock(),
  useTranslation: () => ({
    t: (_k: string, f?: unknown) =>
      typeof f === 'string' ? f
        : f && typeof f === 'object' && 'defaultValue' in f
          ? String((f as { defaultValue: string }).defaultValue).replace('{{name}}', String((f as { name?: string }).name ?? ''))
          : _k,
  }),
}));

vi.mock('framer-motion', () => ({
  motion: new Proxy({}, {
    get: () => (props: Record<string, unknown>) => {
      const { children, ...rest } = props;
      const clean: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(rest)) {
        if (!['initial', 'animate', 'exit', 'transition', 'key'].includes(k)) clean[k] = v;
      }
      return <div {...clean}>{children as React.ReactNode}</div>;
    },
  }),
  AnimatePresence: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

import { StepGreeting } from '@/components/onboarding/steps/StepGreeting';

describe('StepGreeting — prefilled', () => {
  it('prefilled=true — bez pitanja za ime, s novom porukom', () => {
    render(<StepGreeting displayName="Mirko" onChange={vi.fn()} prefilled />);

    expect(screen.queryByText('Kako da te zovem?')).not.toBeInTheDocument();
    expect(screen.queryByText('Samo jedno pitanje pa krećemo.')).not.toBeInTheDocument();
    expect(screen.getByText('Ako želiš, ispravi ime — pa krenimo.')).toBeInTheDocument();
  });

  it('prefilled=false — kao danas', () => {
    render(<StepGreeting displayName="" onChange={vi.fn()} prefilled={false} />);

    expect(screen.getByText('Kako da te zovem?')).toBeInTheDocument();
    expect(screen.getByText('Samo jedno pitanje pa krećemo.')).toBeInTheDocument();
    expect(screen.queryByText('Ako želiš, ispravi ime — pa krenimo.')).not.toBeInTheDocument();
  });
});
