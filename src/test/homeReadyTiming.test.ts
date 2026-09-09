import { describe, it, expect, beforeEach } from 'vitest';
import {
  markOnce,
  getMarks,
  claimHomeReadyReport,
  homeReadySeverity,
  computeLoadMs,
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

describe('t_load (Brief gate deducted)', () => {
  beforeEach(() => __resetBootTimingForTests());

  it('equals t_total when the Brief was not shown', () => {
    expect(computeLoadMs(4000, null, null)).toBe(4000);
    expect(computeLoadMs(4000, 1000, null)).toBe(4000);
    expect(computeLoadMs(4000, null, 3000)).toBe(4000);
  });

  it('subtracts the time spent on the Brief', () => {
    expect(computeLoadMs(11778, 1200, 9000)).toBe(11778 - 7800);
  });

  it('ignores a non-positive Brief duration', () => {
    expect(computeLoadMs(5000, 3000, 3000)).toBe(5000);
    expect(computeLoadMs(5000, 4000, 1000)).toBe(5000);
  });

  it('drives severity by t_load, not t_total', () => {
    const tTotal = 12000;
    const tLoad = computeLoadMs(tTotal, 1000, 9000); // 4000
    expect(tLoad).toBe(4000);
    expect(homeReadySeverity(tLoad)).toBe('info');
    expect(homeReadySeverity(tTotal)).toBe('warning');
  });
});
