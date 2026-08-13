import { describe, it, expect } from 'vitest';
import {
  resolveReceiptBusinessRouting,
  normalizeCompanyName,
  normalizeOibDigits,
} from '../receiptBusinessRouting';

const profiles = [
  { id: 'p1', name: 'Akrobat d.o.o.', oib: '12345678901' },
  { id: 'p2', name: 'Druga firma', oib: null },
];

describe('receiptBusinessRouting', () => {
  it('OIB kupca == naš OIB → auto', () => {
    const r = resolveReceiptBusinessRouting({ recipientOib: 'HR12345678901', profiles });
    expect(r).toEqual({ kind: 'auto', profileId: 'p1', profileName: 'Akrobat d.o.o.' });
  });

  it('tuđi OIB → none (ne nudi se ni ponuda po imenu)', () => {
    const r = resolveReceiptBusinessRouting({
      recipientOib: '99999999999',
      recipientName: 'Akrobat d.o.o.',
      profiles,
    });
    expect(r.kind).toBe('none');
  });

  it('samo ime → offer', () => {
    const r = resolveReceiptBusinessRouting({ recipientName: 'AKROBAT doo', profiles });
    expect(r).toEqual({ kind: 'offer', profileId: 'p1', profileName: 'Akrobat d.o.o.' });
  });

  it('već u tom profilu → none', () => {
    const r = resolveReceiptBusinessRouting({
      recipientOib: '12345678901',
      profiles,
      activeBusinessProfileId: 'p1',
    });
    expect(r.kind).toBe('none');
  });

  it('nepoznato ime → none', () => {
    expect(resolveReceiptBusinessRouting({ recipientName: 'Netko drugi', profiles }).kind).toBe('none');
  });

  it('normalizacija imena i OIB-a', () => {
    expect(normalizeCompanyName('Šrafciger j.d.o.o.')).toBe('srafciger');
    expect(normalizeOibDigits('HR-123 456 789 01')).toBe('12345678901');
    expect(normalizeOibDigits('1234')).toBeNull();
  });
});
