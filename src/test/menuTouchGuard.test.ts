import { describe, it, expect } from 'vitest';
import {
  shouldSuppressMenuPointerUp,
  shouldSuppressMenuActivation,
  MENU_TOUCH_GUARD_WINDOW_MS,
} from '@/lib/menuTouchGuard';

const base = { openedAt: 1000, now: 1080, hadPointerDownInside: false };

describe('menuTouchGuard open anchor', () => {
  it('suppresses a ghost click 80ms after a REAL open even if content mounted long ago', () => {
    // openedAt now comes from onOpenChange(true), not from content mount.
    expect(
      shouldSuppressMenuActivation({
        pointerType: 'touch',
        openedAt: 100000,
        now: 100080,
        hadPointerDownInside: false,
      }),
    ).toBe(true);
  });

  it('does not suppress when there is no known open timestamp', () => {
    expect(
      shouldSuppressMenuActivation({
        pointerType: 'touch',
        openedAt: 0,
        now: 100080,
        hadPointerDownInside: false,
      }),
    ).toBe(false);
  });
});


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

describe('mouse pointerup exemption', () => {
  const base = {
    pointerType: '',
    openedAt: 1_000,
    now: 1_080,
    hadPointerDownInside: false,
  };

  it('does not suppress a click right after a mouse pointerup on the content', () => {
    expect(
      shouldSuppressMenuActivation({
        ...base,
        lastPointerUpType: 'mouse',
        lastPointerUpAt: 1_070,
      }),
    ).toBe(true === false);
  });

  it('suppresses a ghost click with no pointerup at all (Propust B)', () => {
    expect(
      shouldSuppressMenuActivation({ ...base, lastPointerUpType: '', lastPointerUpAt: 0 }),
    ).toBe(true);
  });
});
