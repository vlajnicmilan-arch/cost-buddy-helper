/**
 * ČUVAR — živi kanal koji je umro preko noći mora oživjeti na povratak u fokus.
 * Bez toga serverski trigger („kartica nestaje sama") ne stigne do dugo
 * otvorenog ekrana.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';

const state = { current: 'joined' as string };
const created: unknown[] = [];
const removed: unknown[] = [];

vi.mock('@/integrations/supabase/client', () => {
  const makeChannel = () => {
    const ch: Record<string, unknown> = {
      get state() { return state.current; },
      on: () => ch,
      subscribe: () => ch,
    };
    created.push(ch);
    return ch;
  };
  return {
    supabase: {
      channel: () => makeChannel(),
      removeChannel: (c: unknown) => { removed.push(c); },
    },
  };
});

vi.mock('@/hooks/useAuth', () => ({ useAuth: () => ({ user: { id: 'U1' } }) }));

import { useMailRealtime, MAIL_PENDING_EVENT } from '@/hooks/useMailRealtime';

const fireVisible = () => {
  Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true });
  document.dispatchEvent(new Event('visibilitychange'));
};

beforeEach(() => {
  created.length = 0;
  removed.length = 0;
  state.current = 'joined';
});

describe('useMailRealtime — resubscribe na povratak u fokus', () => {
  it('živ kanal se ne dira', () => {
    renderHook(() => useMailRealtime({ enabled: true }));
    expect(created.length).toBe(1);
    act(() => { fireVisible(); });
    expect(created.length).toBe(1);
    expect(removed.length).toBe(0);
  });

  it('mrtav kanal se gasi, diže ponovno i traži usklađivanje reda', () => {
    const sync = vi.fn();
    window.addEventListener(MAIL_PENDING_EVENT, sync);
    renderHook(() => useMailRealtime({ enabled: true }));
    state.current = 'closed';
    act(() => { fireVisible(); });
    window.removeEventListener(MAIL_PENDING_EVENT, sync);

    expect(removed.length).toBe(1);
    expect(created.length).toBe(2);
    expect(sync).toHaveBeenCalledTimes(1);
  });

  it('povratak mreže radi isto', () => {
    renderHook(() => useMailRealtime({ enabled: true }));
    state.current = 'errored';
    act(() => { window.dispatchEvent(new Event('online')); });
    expect(created.length).toBe(2);
  });
});
