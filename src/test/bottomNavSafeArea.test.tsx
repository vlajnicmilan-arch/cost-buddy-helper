import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';

import { AIInsightBubble } from '@/components/AIInsightBubble';
import { BottomNav } from '@/components/BottomNav';
import { FeedbackFAB } from '@/components/feedback/FeedbackFAB';

vi.mock('framer-motion', () => ({
  AnimatePresence: ({ children }: { children: React.ReactNode }) => children,
  motion: {
    button: ({ children, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement>) => <button {...props}>{children}</button>,
    div: ({ children, ...props }: React.HTMLAttributes<HTMLDivElement>) => <div {...props}>{children}</div>,
  },
}));
vi.mock('@/contexts/AppStateContext', () => ({ useAppState: () => ({ activeBusinessProfileId: null }) }));
vi.mock('@/contexts/CurrencyContext', () => ({ useCurrency: () => ({ formatAmount: (value: number) => String(value) }) }));
vi.mock('@/hooks/useFeatureAccess', () => ({ useFeatureAccess: () => ({ hasAccess: () => true }) }));
vi.mock('@/hooks/useHaptics', () => ({ useHaptics: () => ({ lightTap: vi.fn() }) }));
vi.mock('@/hooks/useModuleGate', () => ({ useModuleGate: () => ({ requestModule: vi.fn() }) }));
vi.mock('@/hooks/useModuleStates', () => ({
  useModuleStates: () => ({ core: 'enabled', projects: 'enabled', smjer: 'enabled', krug: 'enabled' }),
}));
vi.mock('@/hooks/use-mobile', () => ({ useIsMobile: () => true }));
vi.mock('@/components/FloatingAIAvatar', () => ({
  FloatingAIAvatar: () => <div data-testid="ai-avatar" />,
  useAvatarMood: () => ({ mood: 'neutral', showTooltip: false, tooltipMessage: '', showMood: vi.fn() }),
}));

describe('bottom navigation safe-area spacing', () => {
  it('renders navigation, AI bubble and feedback above the shared navigation height', () => {
    const { container } = render(
      <MemoryRouter initialEntries={['/home']}>
        <BottomNav />
        <AIInsightBubble
          expenses={[]}
          totalIncome={0}
          totalExpenses={0}
          balance={0}
          paymentSources={[]}
          onOpenAssistant={vi.fn()}
        />
        <FeedbackFAB />
      </MemoryRouter>,
    );

    expect(screen.getByRole('navigation')).toBeInTheDocument();
    expect(screen.getByTestId('ai-avatar').parentElement?.className).toContain('var(--bottom-nav-h)');
    expect(screen.getByRole('button', { name: /povratnu informaciju/i }).className).toContain('var(--bottom-nav-h)');
    expect(container.querySelectorAll('[class*="var(--bottom-nav-h)"]')).toHaveLength(2);
  });
});