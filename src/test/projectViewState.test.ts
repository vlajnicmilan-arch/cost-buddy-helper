import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { projectViewState } from '@/lib/projectViewState';

describe('projectViewState', () => {
  beforeEach(() => {
    sessionStorage.clear();
    vi.useRealTimers();
  });
  afterEach(() => {
    sessionStorage.clear();
    vi.useRealTimers();
  });

  it('set + get vraća projekt i tab', () => {
    projectViewState.set('p1', 'decisions');
    const v = projectViewState.get();
    expect(v?.projectId).toBe('p1');
    expect(v?.tab).toBe('decisions');
    expect(typeof v?.savedAt).toBe('number');
  });

  it('setTab ažurira samo tab, projekt ostaje', () => {
    projectViewState.set('p1', 'overview');
    projectViewState.setTab('decisions');
    const v = projectViewState.get();
    expect(v?.projectId).toBe('p1');
    expect(v?.tab).toBe('decisions');
  });

  it('setTab no-op ako nema zapisa', () => {
    projectViewState.setTab('decisions');
    expect(projectViewState.get()).toBeNull();
  });

  it('clear briše zapis', () => {
    projectViewState.set('p1', 'decisions');
    projectViewState.clear();
    expect(projectViewState.get()).toBeNull();
  });

  it('TTL: zapis stariji od 10 min se ignorira i briše', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-01-01T10:00:00Z'));
    projectViewState.set('p1', 'decisions');
    vi.setSystemTime(new Date('2026-01-01T10:11:00Z')); // +11 min
    expect(projectViewState.get()).toBeNull();
    // Također mora biti očišćen iz storagea
    expect(sessionStorage.getItem('vmb.projectView')).toBeNull();
  });

  it('svjež zapis unutar TTL prolazi', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-01-01T10:00:00Z'));
    projectViewState.set('p1', 'decisions');
    vi.setSystemTime(new Date('2026-01-01T10:09:00Z')); // +9 min
    expect(projectViewState.get()?.projectId).toBe('p1');
  });

  it('korumpirani JSON u storageu vraća null i briše zapis', () => {
    sessionStorage.setItem('vmb.projectView', '{not-json');
    expect(projectViewState.get()).toBeNull();
    expect(sessionStorage.getItem('vmb.projectView')).toBeNull();
  });
});
