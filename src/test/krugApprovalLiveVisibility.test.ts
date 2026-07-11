/**
 * Guard: Krug Approval Live Visibility.
 *
 * Approval queue (`['krug','pending-expenses',<id>]`) mora imati realtime signal.
 * Bez postgres_changes na `expenses` filtriran po `krug_id`, korisnik s pravom
 * odlučivanja ne vidi novi `predlozena` prijedlog dok ne izađe iz app.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

describe('Krug approval live visibility', () => {
  const src = readFileSync(join(process.cwd(), 'src/hooks/useKrug.ts'), 'utf8');

  it('useKrug detail effect subscribes to expenses postgres_changes filtered by krug_id', () => {
    expect(src).toMatch(/table:\s*'expenses'[^}]*filter:\s*`krug_id=eq\.\$\{krugId\}`/);
  });

  it('expenses change invalidates pending-expenses query', () => {
    // najlakši structural check: unutar istog subscribe bloka postoji invalidate za pending-expenses
    const idx = src.indexOf("table: 'expenses'");
    expect(idx).toBeGreaterThan(0);
    const tail = src.slice(idx, idx + 400);
    expect(tail).toMatch(/pending-expenses/);
  });
});
