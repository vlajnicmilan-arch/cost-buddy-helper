import { describe, it, expect } from 'vitest';
import { matchManualToImported } from '@/lib/manualMatchForImport';

const d = (s: string) => new Date(`${s}T00:00:00.000Z`);

describe('matchManualToImported', () => {
  it('1:1 spaja expense ↔ expense (isti izvor, iznos, ±1 dan)', () => {
    const res = matchManualToImported({
      imported: [{ index: 0, paymentSource: 'cash', type: 'expense', amount: 50, date: d('2026-05-14') }],
      manualCandidates: [{ id: 'm1', paymentSource: 'cash', type: 'expense', amount: 50, date: d('2026-05-14') }],
    });
    expect(res.matches).toEqual([{ importedIndex: 0, manualId: 'm1' }]);
    expect(res.unmatched).toEqual([]);
    expect(res.ambiguous).toEqual([]);
  });

  it('transferi se NIKAD ne auto-spajaju (ostaju unmatched)', () => {
    const res = matchManualToImported({
      imported: [{
        index: 0,
        paymentSource: 'custom:aircash',
        type: 'transfer',
        amount: 200,
        date: d('2026-05-14'),
      }],
      manualCandidates: [{
        id: 'm1',
        paymentSource: 'custom:aircash',
        type: 'transfer',
        amount: 200,
        date: d('2026-05-14'),
      }],
    });
    expect(res.matches).toEqual([]);
    expect(res.unmatched).toEqual([0]);
  });

  it('ne spaja transfere s različitim izvorom', () => {
    const res = matchManualToImported({
      imported: [{ index: 0, paymentSource: 'custom:aircash', type: 'transfer', amount: 200, date: d('2026-05-14') }],
      manualCandidates: [{ id: 'm1', paymentSource: 'custom:revolut', type: 'transfer', amount: 200, date: d('2026-05-14') }],
    });
    expect(res.matches).toEqual([]);
    expect(res.unmatched).toEqual([0]);
  });

  it('ne spaja kad je manual expense a importani transfer (različit tip)', () => {
    const res = matchManualToImported({
      imported: [{ index: 0, paymentSource: 'custom:aircash', type: 'transfer', amount: 200, date: d('2026-05-14') }],
      manualCandidates: [{ id: 'm1', paymentSource: 'custom:aircash', type: 'expense', amount: 200, date: d('2026-05-14') }],
    });
    expect(res.matches).toEqual([]);
    expect(res.unmatched).toEqual([0]);
  });

  it('više kandidata → ambiguous (ne spaja)', () => {
    const res = matchManualToImported({
      imported: [{ index: 0, paymentSource: 'cash', type: 'expense', amount: 50, date: d('2026-05-14') }],
      manualCandidates: [
        { id: 'm1', paymentSource: 'cash', type: 'expense', amount: 50, date: d('2026-05-14') },
        { id: 'm2', paymentSource: 'cash', type: 'expense', amount: 50, date: d('2026-05-14') },
      ],
    });
    expect(res.matches).toEqual([]);
    expect(res.ambiguous).toEqual([0]);
  });

  it('jedan manual kandidat ne smije biti spojen dvaput', () => {
    const res = matchManualToImported({
      imported: [
        { index: 0, paymentSource: 'cash', type: 'expense', amount: 50, date: d('2026-05-14') },
        { index: 1, paymentSource: 'cash', type: 'expense', amount: 50, date: d('2026-05-14') },
      ],
      manualCandidates: [
        { id: 'm1', paymentSource: 'cash', type: 'expense', amount: 50, date: d('2026-05-14') },
      ],
    });
    expect(res.matches).toEqual([{ importedIndex: 0, manualId: 'm1' }]);
    // Drugi importani ostaje bez kandidata jer je m1 već potrošen.
    expect(res.unmatched).toEqual([1]);
  });

  it('poštuje maxDayDiff (default 1)', () => {
    const res = matchManualToImported({
      imported: [{ index: 0, paymentSource: 'cash', type: 'expense', amount: 50, date: d('2026-05-14') }],
      manualCandidates: [{ id: 'm1', paymentSource: 'cash', type: 'expense', amount: 50, date: d('2026-05-17') }],
    });
    expect(res.matches).toEqual([]);
    expect(res.unmatched).toEqual([0]);
  });
});
