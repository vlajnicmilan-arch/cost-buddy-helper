/**
 * Recent Transactions — Krug indikator na retku transakcije.
 *
 * Zaključava:
 *  - `TransactionItem` renderira indikator SAMO kad `expense.krug_id` postoji.
 *  - Indikator koristi `KrugBrandIcon` (isti logo modula, prilagođena veličina).
 *  - Nema tooltipa i nema onClick — čisti read-only.
 *  - `data-testid="tx-krug-indicator"` je stabilan.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';

const src = readFileSync(resolve(__dirname, '..', 'components/TransactionItem.tsx'), 'utf8');

describe('TransactionItem — Krug indikator', () => {
  it('renderira se conditionally na expense.krug_id', () => {
    expect(src).toMatch(/\{expense\.krug_id\s*&&\s*\(/);
  });

  it('koristi KrugBrandIcon (isti logo modula)', () => {
    expect(src).toMatch(/import\s*\{\s*KrugBrandIcon\s*\}\s*from\s*'@\/components\/krug\/KrugBrandIcon'/);
    expect(src).toMatch(/data-testid="tx-krug-indicator"[\s\S]{0,200}<KrugBrandIcon\s/);
  });

  it('nema tooltipa oko indikatora i nema onClick', () => {
    const match = src.match(/\{expense\.krug_id\s*&&\s*\(([\s\S]*?)\)\}/);
    expect(match).toBeTruthy();
    const block = match?.[1] ?? '';
    expect(block).not.toMatch(/Tooltip/);
    expect(block).not.toMatch(/onClick/);
  });

  it('stabilan testid je prisutan', () => {
    expect(src).toMatch(/data-testid="tx-krug-indicator"/);
  });
});
