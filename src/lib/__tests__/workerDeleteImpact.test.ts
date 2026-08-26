import { describe, it, expect } from 'vitest';
import { summarizeWorkerDeleteImpact } from '@/lib/workerDeleteImpact';

const entries = [
  { worker_id: 'w1', actual_hours: 8 },
  { worker_id: 'w1', actual_hours: 7.5 },
  { worker_id: 'w2', actual_hours: 10 },
];

describe('summarizeWorkerDeleteImpact', () => {
  it('counts only the entries of the worker being deleted', () => {
    const r = summarizeWorkerDeleteImpact(entries, 'w1', { hourlyRate: 10 });
    expect(r.entryCount).toBe(2);
    expect(r.hours).toBe(15.5);
    expect(r.value).toBe(155);
  });

  it('prefers the already computed cost when available', () => {
    const r = summarizeWorkerDeleteImpact(entries, 'w1', { hourlyRate: 10, knownCost: 200.005 });
    expect(r.value).toBe(200.01);
  });

  it('reports no value when no rate is known', () => {
    const r = summarizeWorkerDeleteImpact(entries, 'w1', { hourlyRate: 0 });
    expect(r.value).toBeNull();
    expect(r.entryCount).toBe(2);
  });

  it('returns an empty impact for a worker without entries', () => {
    const r = summarizeWorkerDeleteImpact(entries, 'w3', { hourlyRate: 10 });
    expect(r).toEqual({ entryCount: 0, hours: 0, value: null });
  });
});
