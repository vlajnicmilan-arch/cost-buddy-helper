/**
 * ČUVAR — živi kanal mail uvoza.
 * Nova stavka „na pregledu" mora osvježiti brojač/red bez ponovnog ulaska u app.
 * Stavka se rađa u među-statusu (obrada) i tek UPDATE-om prelazi u 'na_pregledu'.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';

const handlers: Array<{ event: string; cb: (p: unknown) => void }> = [];
const removeChannel = vi.fn();

vi.mock('@/integrations/supabase/client', () => {
  const channel = {
    on: (_type: string, cfg: { event: string }, cb: (p: unknown) => void) => {
      handlers.push({ event: cfg.event, cb });
      return channel;
    },
    subscribe: () => channel,
  };
  return { supabase: { channel: () => channel, removeChannel } };
});

vi.mock('@/hooks/useAuth', () => ({ useAuth: () => ({ user: { id: 'U1' } }) }));

import {
  emitMailPendingChanged,
  useMailPendingEvent,
  useMailRealtime,
  isPendingTransition,
  MAIL_PENDING_EVENT,
} from '@/hooks/useMailRealtime';

beforeEach(() => {
  handlers.length = 0;
  removeChannel.mockClear();
});

describe('useMailRealtime — interni event', () => {
  it('emitira imenovani event', () => {
    const spy = vi.fn();
    window.addEventListener(MAIL_PENDING_EVENT, spy);
    emitMailPendingChanged({ itemId: 'X1' });
    window.removeEventListener(MAIL_PENDING_EVENT, spy);
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it('pretplatnik dobije poziv i odjavi se na unmount', () => {
    const handler = vi.fn();
    const { unmount } = renderHook(() => useMailPendingEvent(handler));
    act(() => emitMailPendingChanged({ itemId: 'X2' }));
    expect(handler).toHaveBeenCalledTimes(1);
    unmount();
    act(() => emitMailPendingChanged({ itemId: 'X3' }));
    expect(handler).toHaveBeenCalledTimes(1);
  });
});

describe('isPendingTransition', () => {
  it('true kad status prijeđe u na_pregledu', () => {
    expect(isPendingTransition({ status: 'obrada' }, { status: 'na_pregledu' })).toBe(true);
  });
  it('false kad je već bio na_pregledu (ponovni UPDATE)', () => {
    expect(isPendingTransition({ status: 'na_pregledu' }, { status: 'na_pregledu' })).toBe(false);
  });
  it('false za druge statuse', () => {
    expect(isPendingTransition({ status: 'obrada' }, { status: 'zavrsena' })).toBe(false);
  });
  it('true za INSERT bez starog retka', () => {
    expect(isPendingTransition(null, { status: 'na_pregledu' })).toBe(true);
  });
});

describe('useMailRealtime — slijed insert(obrada) → update(na_pregledu)', () => {
  it('okine refetch točno jednom, bez dvostrukog emita', () => {
    const onNew = vi.fn();
    const counter = vi.fn();
    renderHook(() => useMailPendingEvent(counter));
    renderHook(() => useMailRealtime({ enabled: true, onNewPending: onNew }));

    expect(handlers.map((h) => h.event).sort()).toEqual(['INSERT', 'UPDATE']);

    const insert = handlers.find((h) => h.event === 'INSERT')!.cb;
    const update = handlers.find((h) => h.event === 'UPDATE')!.cb;

    // 1) stavka nastaje u obradi — bez događaja
    act(() => insert({ new: { id: 'I1', status: 'obrada' }, old: null }));
    expect(counter).not.toHaveBeenCalled();

    // 2) prelazak u na_pregledu — točno jedan refetch
    act(() => update({ new: { id: 'I1', status: 'na_pregledu' }, old: { status: 'obrada' } }));
    expect(counter).toHaveBeenCalledTimes(1);
    expect(onNew).toHaveBeenCalledWith('I1');

    // 3) daljnji UPDATE-i iste stavke ne dupliciraju
    act(() => update({ new: { id: 'I1', status: 'na_pregledu' }, old: { status: 'na_pregledu' } }));
    expect(counter).toHaveBeenCalledTimes(1);
  });
});
