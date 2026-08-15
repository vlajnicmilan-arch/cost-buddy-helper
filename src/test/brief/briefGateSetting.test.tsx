import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { BriefGateSetting } from '@/components/settings/BriefGateSetting';
import { BRIEF_GATE_DISABLED_KEY, BRIEF_GATE_LAST_SHOWN_KEY } from '@/lib/briefGate';
import { BRIEF_CONTINUITY_KEY } from '@/lib/brief/continuity';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

vi.mock('@/lib/featureFlags', () => ({ BRIEF_GATE_ENABLED: true }));

const showSuccess = vi.hoisted(() => vi.fn());
vi.mock('@/hooks/useStatusFeedback', () => ({ showSuccess }));

describe('BriefGateSetting — Prikaži ponovno', () => {
  beforeEach(() => {
    localStorage.clear();
    showSuccess.mockReset();
  });

  it('radnja se ne prikazuje kad je korisnikov prekidač isključen', () => {
    localStorage.setItem(BRIEF_GATE_DISABLED_KEY, '1');
    render(<BriefGateSetting />);
    expect(screen.queryByTestId('brief-gate-show-again')).not.toBeInTheDocument();
  });

  it('klik briše žig i kontinuitet te javlja potvrdu', () => {
    localStorage.setItem(BRIEF_GATE_LAST_SHOWN_KEY, new Date().toISOString());
    localStorage.setItem(BRIEF_CONTINUITY_KEY, '{"mail":{"count":1}}');

    render(<BriefGateSetting />);
    fireEvent.click(screen.getByTestId('brief-gate-show-again'));

    expect(localStorage.getItem(BRIEF_GATE_LAST_SHOWN_KEY)).toBeNull();
    expect(localStorage.getItem(BRIEF_CONTINUITY_KEY)).toBeNull();
    expect(showSuccess).toHaveBeenCalled();
  });
});
