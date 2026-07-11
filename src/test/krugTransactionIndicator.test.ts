/**
 * Recent Transactions — Krug indikator na retku transakcije.
 *
 * Zaključava:
 *  - `TransactionItem` renderira badge SAMO kad `expense.krug_id` postoji.
 *  - Badge nosi `data-testid="tx-krug-indicator"` i koristi Users ikonu +
 *    primary tint (usklađeno s Krug modulom).
 *  - Bez novog klik-flowa (read-only wrapper unutar Tooltip-a).
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';

const src = readFileSync(resolve(__dirname, '..', 'components/TransactionItem.tsx'), 'utf8');

describe('TransactionItem — Krug indikator', () => {
  it('renderira se conditionally na expense.krug_id', () => {
    expect(src).toMatch(/\{expense\.krug_id\s*&&\s*\(/);
  });

  it('badge ima stable testid i primary tint', () => {
    expect(src).toMatch(
      /data-testid="tx-krug-indicator"[\s\S]{0,200}bg-primary\/15\s+text-primary/,
    );
  });

  it('koristi Users ikonu (usklađeno s Krug modulom)', () => {
    expect(src).toMatch(/import[^;]*\bUsers\b[^;]*from 'lucide-react'/);
    expect(src).toMatch(/data-testid="tx-krug-indicator"[\s\S]{0,300}<Users\s/);
  });

  it('badge je unutar Tooltip-a, bez novih akcija (read-only)', () => {
    expect(src).toMatch(
      /\{expense\.krug_id\s*&&\s*\([\s\S]{0,400}<Tooltip>[\s\S]{0,600}belongsToKrug/,
    );
    // Nema onClick na indikatoru
    expect(src).not.toMatch(/data-testid="tx-krug-indicator"[^>]*onClick/);
  });
});
