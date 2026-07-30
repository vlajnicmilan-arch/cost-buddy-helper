import { describe, it, expect } from 'vitest';
import {
  shouldSuppressMenuPointerUp,
  MENU_TOUCH_GUARD_WINDOW_MS,
} from '@/lib/menuTouchGuard';

const base = { openedAt: 1000, now: 1080, hadPointerDownInside: false };

describe('menuTouchGuard', () => {
  it('suppresses the touch pointerup that belongs to the opening gesture', () => {
    expect(shouldSuppressMenuPointerUp({ ...base, pointerType: 'touch' })).toBe(true);
  });

  it('suppresses the same case for pen input', () => {
    expect(shouldSuppressMenuPointerUp({ ...base, pointerType: 'pen' })).toBe(true);
  });

  it('allows selection when the gesture started inside the menu', () => {
    expect(
      shouldSuppressMenuPointerUp({ ...base, pointerType: 'touch', hadPointerDownInside: true }),
    ).toBe(false);
  });

  it('keeps mouse press-drag-release working', () => {
    expect(shouldSuppressMenuPointerUp({ ...base, pointerType: 'mouse' })).toBe(false);
  });

  it('stops guarding after the grace window', () => {
    expect(
      shouldSuppressMenuPointerUp({
        ...base,
        pointerType: 'touch',
        now: base.openedAt + MENU_TOUCH_GUARD_WINDOW_MS + 1,
      }),
    ).toBe(false);
  });

  it('a deliberate second tap (own pointerdown, later) selects normally', () => {
    expect(
      shouldSuppressMenuPointerUp({
        pointerType: 'touch',
        openedAt: 1000,
        now: 2500,
        hadPointerDownInside: true,
      }),
    ).toBe(false);
  });
});
