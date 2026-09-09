import { describe, it, expect, beforeEach } from 'vitest';
import {
  markOnce,
  getMarks,
  claimHomeReadyReport,
  homeReadySeverity,
  __resetBootTimingForTests,
} from '@/lib/bootTiming';

describe('bootTiming.markOnce', () => {
  beforeEach(() => __resetBootTimingForTests());

  it('records the value only the first time; later calls keep the first', () => {
    const first = markOnce('home_auth_ready', 100);
    const second = markOnce('home_auth_ready', 999);
    expect(first).toBe(100);
    expect(second).toBe(100);
    expect(getMarks()['home_auth_ready']).toBe(100);
  });

  it('rounds to integer milliseconds', () => {
    markOnce('js_boot', 123.7);
    expect(getMarks()['js_boot']).toBe(124);
  });

  it('keeps marks for different names independent', () => {
    markOnce('a', 10);
    markOnce('b', 20);
    expect(getMarks()).toEqual({ a: 10, b: 20 });
  });
});

describe('home_ready once-per-load gate', () => {
  beforeEach(() => __resetBootTimingForTests());

  it('allows exactly one report across simulated re-renders', () => {
    // Each call simulates one render pass reaching the ready condition.
    expect(claimHomeReadyReport()).toBe(true);
    expect(claimHomeReadyReport()).toBe(false);
    expect(claimHomeReadyReport()).toBe(false);
    expect(claimHomeReadyReport()).toBe(false);
  });

  it('resets between page loads (module reload simulated by test reset)', () => {
    expect(claimHomeReadyReport()).toBe(true);
    __resetBootTimingForTests();
    expect(claimHomeReadyReport()).toBe(true);
  });
});

describe('home_ready severity', () => {
  it('is warning above 5000 ms, info at or below', () => {
    expect(homeReadySeverity(5001)).toBe('warning');
    expect(homeReadySeverity(10000)).toBe('warning');
    expect(homeReadySeverity(5000)).toBe('info');
    expect(homeReadySeverity(0)).toBe('info');
  });
});
