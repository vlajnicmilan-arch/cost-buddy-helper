import { describe, it, expect } from 'vitest';
import { reclassifyInternalTransfers } from '../pdfPostProcess';

describe('reclassifyInternalTransfers', () => {
  it('income "Uplata gotovine na Aircash Tisak" → transfer', () => {
    const out = reclassifyInternalTransfers([
      { type: 'income', description: 'Uplata gotovine na Aircash Tisak' },
    ]);
    expect(out[0].type).toBe('transfer');
  });

  it('income "Uplata na Aircash - Visa *** 7262" → transfer', () => {
    const out = reclassifyInternalTransfers([
      { type: 'income', description: 'Uplata na Aircash - Visa *** 7262' },
    ]);
    expect(out[0].type).toBe('transfer');
  });

  it('income "Revolut top up" → transfer', () => {
    const out = reclassifyInternalTransfers([
      { type: 'income', description: 'Revolut top up via Visa' },
    ]);
    expect(out[0].type).toBe('transfer');
  });

  it('obična plaća ostaje income', () => {
    const out = reclassifyInternalTransfers([
      { type: 'income', description: 'Plaća za 5/26' },
    ]);
    expect(out[0].type).toBe('income');
  });

  it('expense "Uplata gotovine na Aircash INA" → transfer', () => {
    const out = reclassifyInternalTransfers([
      { type: 'expense', description: 'Uplata gotovine na Aircash INA' },
    ]);
    expect(out[0].type).toBe('transfer');
  });

  it('expense "Uplata gotovine na Aircash Tisak" → transfer', () => {
    const out = reclassifyInternalTransfers([
      { type: 'expense', description: 'Uplata gotovine na Aircash Tisak' },
    ]);
    expect(out[0].type).toBe('transfer');
  });

  it('expense "Uplata na Aircash - Visa *** 7262" → transfer', () => {
    const out = reclassifyInternalTransfers([
      { type: 'expense', description: 'Uplata na Aircash - Visa *** 7262' },
    ]);
    expect(out[0].type).toBe('transfer');
  });

  it('expense "Bankomat podizanje" → transfer', () => {
    const out = reclassifyInternalTransfers([
      { type: 'expense', description: 'Bankomat podizanje 100 EUR' },
    ]);
    expect(out[0].type).toBe('transfer');
  });

  it('regularni expense ostaje expense', () => {
    const out = reclassifyInternalTransfers([
      { type: 'expense', description: 'Konzum Maksimirska' },
    ]);
    expect(out[0].type).toBe('expense');
  });

  it('već postojeći transfer ostaje transfer', () => {
    const out = reclassifyInternalTransfers([
      { type: 'transfer', description: 'whatever' },
    ]);
    expect(out[0].type).toBe('transfer');
  });

  it('prazan/null description se ignorira', () => {
    const out = reclassifyInternalTransfers([
      { type: 'income', description: '' },
      { type: 'income', description: null },
    ]);
    expect(out[0].type).toBe('income');
    expect(out[1].type).toBe('income');
  });

  it('ne mutira ulazni array', () => {
    const input = [{ type: 'income', description: 'Uplata gotovine na Aircash Tisak' }];
    const out = reclassifyInternalTransfers(input);
    expect(input[0].type).toBe('income');
    expect(out[0].type).toBe('transfer');
  });
});
