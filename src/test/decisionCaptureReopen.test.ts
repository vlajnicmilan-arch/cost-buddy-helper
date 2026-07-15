import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { decisionCaptureReopen } from '@/lib/decisionCaptureReopen';

describe('decisionCaptureReopen', () => {
  beforeEach(() => {
    sessionStorage.clear();
    vi.useRealTimers();
  });

  afterEach(() => {
    sessionStorage.clear();
    vi.useRealTimers();
  });

  it('set + get sprema capture ključ', () => {
    decisionCaptureReopen.set('new-decision');
    const note = decisionCaptureReopen.get();
    expect(note?.key).toBe('new-decision');
    expect(typeof note?.savedAt).toBe('number');
  });

  it('consumeFor je jednokratan i briše samo traženi ključ', () => {
    decisionCaptureReopen.set('new-decision');
    expect(decisionCaptureReopen.consumeFor('reply-1')).toBeNull();
    expect(decisionCaptureReopen.get()?.key).toBe('new-decision');
    expect(decisionCaptureReopen.consumeFor('new-decision')?.key).toBe('new-decision');
    expect(decisionCaptureReopen.consumeFor('new-decision')).toBeNull();
    expect(decisionCaptureReopen.get()).toBeNull();
  });

  it('consumeMatching konzumira samo ključ koji odgovara regexu', () => {
    decisionCaptureReopen.set('reply-abc');
    expect(decisionCaptureReopen.consumeMatching(/^new-/)).toBeNull();
    expect(decisionCaptureReopen.get()?.key).toBe('reply-abc');
    expect(decisionCaptureReopen.consumeMatching(/^reply-.+$/)?.key).toBe('reply-abc');
    expect(decisionCaptureReopen.get()).toBeNull();
  });

  it('clear s ključem ne briše drugi zapis', () => {
    decisionCaptureReopen.set('reply-abc');
    decisionCaptureReopen.clear('new-decision');
    expect(decisionCaptureReopen.get()?.key).toBe('reply-abc');
    decisionCaptureReopen.clear('reply-abc');
    expect(decisionCaptureReopen.get()).toBeNull();
  });

  it('TTL: zapis stariji od 2 min se ignorira i briše', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-01-01T10:00:00Z'));
    decisionCaptureReopen.set('new-decision');
    vi.setSystemTime(new Date('2026-01-01T10:02:01Z'));
    expect(decisionCaptureReopen.get()).toBeNull();
    expect(sessionStorage.getItem('vmb.decisionCaptureReopen')).toBeNull();
  });
});
