import { describe, it, expect } from 'vitest';
import { resolveSwipeSnap, clampSwipeOffset } from './swipeThreshold';

describe('resolveSwipeSnap', () => {
  const opts = { actionWidth: 160, openThreshold: 0.4 }; // threshold = 64px

  it('returns closed for zero delta', () => {
    expect(resolveSwipeSnap(0, opts)).toBe('closed');
  });

  it('returns closed for right swipe (positive delta)', () => {
    expect(resolveSwipeSnap(50, opts)).toBe('closed');
    expect(resolveSwipeSnap(500, opts)).toBe('closed');
  });

  it('returns closed for left swipe below threshold', () => {
    expect(resolveSwipeSnap(-30, opts)).toBe('closed');
    expect(resolveSwipeSnap(-63.9, opts)).toBe('closed');
  });

  it('returns open exactly at threshold', () => {
    expect(resolveSwipeSnap(-64, opts)).toBe('open');
  });

  it('returns open past threshold', () => {
    expect(resolveSwipeSnap(-100, opts)).toBe('open');
    expect(resolveSwipeSnap(-160, opts)).toBe('open');
    expect(resolveSwipeSnap(-9999, opts)).toBe('open');
  });

  it('honours custom openThreshold', () => {
    expect(resolveSwipeSnap(-50, { actionWidth: 100, openThreshold: 0.6 })).toBe('closed');
    expect(resolveSwipeSnap(-60, { actionWidth: 100, openThreshold: 0.6 })).toBe('open');
  });

  it('returns closed for invalid inputs', () => {
    expect(resolveSwipeSnap(Number.NaN, opts)).toBe('closed');
    expect(resolveSwipeSnap(-50, { actionWidth: 0 })).toBe('closed');
    expect(resolveSwipeSnap(-50, { actionWidth: -100 })).toBe('closed');
  });
});

describe('clampSwipeOffset', () => {
  it('clamps right swipe to zero', () => {
    expect(clampSwipeOffset(50, 160)).toBe(0);
    expect(clampSwipeOffset(0, 160)).toBe(0);
  });

  it('passes through left swipe within range', () => {
    expect(clampSwipeOffset(-50, 160)).toBe(-50);
    expect(clampSwipeOffset(-160, 160)).toBe(-160);
  });

  it('clamps over-drag past actionWidth', () => {
    expect(clampSwipeOffset(-200, 160)).toBe(-160);
    expect(clampSwipeOffset(-9999, 160)).toBe(-160);
  });

  it('returns 0 for NaN', () => {
    expect(clampSwipeOffset(Number.NaN, 160)).toBe(0);
  });
});
