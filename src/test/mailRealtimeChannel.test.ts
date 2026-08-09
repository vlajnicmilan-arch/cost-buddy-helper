/**
 * ČUVAR — živi kanal mail uvoza.
 * Nova stavka „na pregledu" mora osvježiti brojač/red bez ponovnog ulaska u app.
 */
import { describe, it, expect, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import {
  emitMailPendingChanged,
  useMailPendingEvent,
  MAIL_PENDING_EVENT,
} from '@/hooks/useMailRealtime';

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
